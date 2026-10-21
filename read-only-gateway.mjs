/* DPRO TAX R316 — isolation-only executable Cloudflare Worker-compatible gateway.
   NOT DEPLOYABLE AS-IS: no live Supabase JWT trust or DB adapter is supplied.
   Intended for reuse only after separate real-token/DB validation and sign-off.
   Runtime: standard WebCrypto, Request, Response, TextDecoder/Encoder; no Node dependencies.
*/
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PART=/^[A-Za-z0-9_-]+$/;
const te=new TextEncoder();
const td=new TextDecoder('utf-8',{fatal:true});
const READ_PATH=/^\/api\/admin\/clients\/([0-9a-f-]{36})$/i;
const keyRx=/^[A-Za-z0-9._-]{1,96}$/;
const VALID_ROLES=new Set(['owner','manager','staff','reviewer']);
function fail(code,status=403){const e=new Error(code);e.status=status;throw e}
function b64d(raw){
  if(typeof raw!=='string'||!PART.test(raw)||raw.length>8192)fail('MALFORMED_JWT',401);
  const b64=raw.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(b64.padEnd(Math.ceil(b64.length/4)*4,'='));
  const out=Uint8Array.from(binary,c=>c.charCodeAt(0));
  // Canonical decoding: rejects noncanonical base64url and ambiguous encodings.
  const canonical=btoa(String.fromCharCode(...out)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(canonical!==raw)fail('MALFORMED_JWT',401);
  return out;
}
function obj(data){
  if(!data||Array.isArray(data)||typeof data!=='object')fail('BAD_CLAIMS',401);
  return data;
}
function jsonPart(raw){
  try{return obj(JSON.parse(td.decode(b64d(raw))))}catch(e){if(e?.status)throw e;fail('MALFORMED_JWT',401)}
}
async function importTrustedKeys(keys){
  if(!keys||typeof keys!=='object'||Array.isArray(keys)||!Object.keys(keys).length)fail('TRUST_ROOT_MISSING',503);
  const imported=new Map();
  for(const [kid,jwk] of Object.entries(keys)){
    if(!keyRx.test(kid)||!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.x!=='string'||typeof jwk.y!=='string'||'d' in jwk ||(jwk.alg&&jwk.alg!=='ES256')||(jwk.use&&jwk.use!=='sig')||(jwk.key_ops&&!Array.isArray(jwk.key_ops)))fail('INVALID_TRUST_ROOT',503);
    imported.set(kid,await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']));
  }
  return imported;
}
function http(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function canSee(row,staff){return (staff.can_view_all_clients===true&&['owner','manager'].includes(staff.role))||row.assigned_staff_id===staff.id||row.reviewer_staff_id===staff.id}
function ensureClientRow(row,office){
  if(!row||typeof row!=='object'||row.office_id!==office||!ID.test(row.id))fail('DB_SCOPE_BREACH',503);
}
/** db interface required: getOffice(id), findStaffMemberships(sub,officeId), listClients(officeId), getClient(officeId,clientId).
 *  All db queries MUST independently scope office_id; this layer checks results AGAIN.
 */
export function createR316Gateway({trustedPublicKeys,issuer,audience='authenticated',db,now=()=>Math.floor(Date.now()/1000)}={}){
  if(typeof issuer!=='string'||!issuer.startsWith('https://')||issuer.length>300||/[?#\s]/.test(issuer))throw Error('ISSUER_CONFIG_INVALID');
  if(typeof audience!=='string'||!audience||!db||typeof db!=='object')throw Error('GATEWAY_CONFIG_MISSING');
  for(const key of ['getOffice','findStaffMemberships','listClients','getClient'])if(typeof db[key]!=='function')throw Error('DB_ADAPTER_MISSING_'+key);
  const keysPromise=importTrustedKeys(trustedPublicKeys);
  async function verifyJWT(token){
    if(typeof token!=='string'||token.length>12000)fail('BAD_TOKEN',401);
    const parts=token.split('.');
    if(parts.length!==3||parts.some(x=>!x||!PART.test(x)))fail('BAD_TOKEN',401);
    const header=jsonPart(parts[0]);
    if(header.alg!=='ES256'||header.typ!=='JWT'||typeof header.kid!=='string'||!keyRx.test(header.kid)||'jwk' in header||'jku' in header||'x5u' in header||'crit' in header)fail('JWT_HEADER_DENIED',401);
    const keys=await keysPromise;
    if(!keys.has(header.kid))fail('KID_UNTRUSTED',401);
    const signed=te.encode(parts[0]+'.'+parts[1]);
    const sig=b64d(parts[2]);
    if(sig.length!==64||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.get(header.kid),sig,signed))fail('JWT_SIGNATURE_INVALID',401);
    const claims=jsonPart(parts[1]);
    if(claims.iss!==issuer||claims.aud!==audience||claims.role!=='authenticated'||!ID.test(claims.sub))fail('JWT_CLAIMS_INVALID',401);
    const t=now();
    if(!Number.isInteger(t)||![claims.exp,claims.iat,claims.nbf].every(Number.isInteger)||claims.exp<=t||claims.nbf>t||claims.iat>t+30||claims.exp<=claims.iat||claims.exp-claims.iat>3600)fail('JWT_TIME_INVALID',401);
    return Object.freeze({sub:claims.sub});
  }
  async function handle(request){
    try{
      // The only reachable methods are GET; unknown or mutation routes cannot fall through to legacy Worker.
      if(request.method!=='GET')fail('METHOD_DISABLED',405);
      const url=new URL(request.url);
      const path=url.pathname;
      if(url.search||url.hash)fail('ROUTE_DISABLED',404);
      let resource='';let clientId='';
      if(path==='/api/admin/dashboard')resource='dashboard';
      else if(path==='/api/admin/clients')resource='clients';
      else if(READ_PATH.test(path)){resource='client';clientId=READ_PATH.exec(path)[1];if(!ID.test(clientId))fail('ROUTE_DISABLED',404)}
      else fail('ROUTE_DISABLED',404);
      const authorization=request.headers.get('authorization')||'';
      const bearer=/^Bearer ([A-Za-z0-9_\-.]{1,12000})$/.exec(authorization);
      if(!bearer)fail('BEARER_REQUIRED',401);
      const verified=await verifyJWT(bearer[1]);
      const officeId=request.headers.get('x-dpro-office-id');
      if(!ID.test(officeId))fail('OFFICE_REQUIRED',403);
      const office=await db.getOffice(officeId);
      if(!office||office.id!==officeId||office.is_active!==true||office.is_demo!==false||office.production_guard!==true)fail('OFFICE_DENIED',403);
      const memberships=await db.findStaffMemberships(verified.sub,officeId);
      if(!Array.isArray(memberships)||memberships.length!==1)fail('MEMBERSHIP_DENIED',403);
      const staff=memberships[0];
      if(!staff||staff.office_id!==officeId||staff.auth_user_id!==verified.sub||staff.is_active!==true||typeof staff.id!=='string'||!VALID_ROLES.has(staff.role))fail('MEMBERSHIP_DENIED',403);
      if(resource==='dashboard')return http(200,{ok:true,office_id:officeId,staff_id:staff.id,role:staff.role});
      if(resource==='clients'){
        const rows=await db.listClients(officeId);
        if(!Array.isArray(rows)||rows.length>1000)fail('DB_RESPONSE_INVALID',503);
        for(const row of rows)ensureClientRow(row,officeId);
        // Deliberately expose a minimal, explicit allowlist; never pass raw DB rows to clients.
        return http(200,{ok:true,clients:rows.filter(row=>canSee(row,staff)).map(row=>({id:row.id,office_id:officeId}))});
      }
      const row=await db.getClient(officeId,clientId);
      if(row==null)return http(404,{ok:false,error:'NOT_FOUND'});
      ensureClientRow(row,officeId);
      if(row.id!==clientId)fail('DB_SCOPE_BREACH',503);
      if(!canSee(row,staff))return http(404,{ok:false,error:'NOT_FOUND'});
      return http(200,{ok:true,client:{id:row.id,office_id:officeId}});
    }catch(e){
      const status=[401,403,404,405,503].includes(e?.status)?e.status:503;
      return http(status,{ok:false,error:status===401?'UNAUTHORIZED':status===403?'FORBIDDEN':status===404?'NOT_FOUND':status===405?'METHOD_DISABLED':'SERVICE_UNAVAILABLE'});
    }
  }
  return Object.freeze({handle,verifyJWT});
}
