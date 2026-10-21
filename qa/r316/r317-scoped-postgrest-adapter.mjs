/**
 * DPRO TAX R317 - SCOPED POSTGREST CONTRACT (ISOLATED / NOT DEPLOYABLE)
 *
 * No service-role access, no admin-code fallback, no automatic fetch.
 * The supplied userJwt MUST be verified by the calling R316 gateway before any
 * adapter methods are called; this module does NOT verify JWT signatures.
 * Real Supabase project currently has no verified suitable RLS policies:
 * never connect this module to the production DB without a separate authorization review.
 *
 * One adapter per incoming request; never share token-bearing adapter across users.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const JWTSHAPE=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const COL={
  taxacc_offices:'id,is_active,is_demo,production_guard',
  taxacc_staff:'id,office_id,auth_user_id,role,is_active,can_view_all_clients',
  taxacc_clients:'id,office_id,assigned_staff_id,reviewer_staff_id',
};
function invalid(code){throw new Error(code)}
function id(x){if(typeof x!=='string'||!UUID.test(x))invalid('INVALID_DB_SCOPE_ID');return x.toLowerCase()}
function base(url){
  let parsed;
  try{parsed=new URL(url)}catch{invalid('INVALID_REST_URL')}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||
     parsed.pathname!=='/rest/v1'||!parsed.hostname||parsed.port)invalid('INVALID_REST_URL');
  return parsed;
}
function rejectResponse(response,table){
  if(!response||response.ok!==true||response.status!==200||typeof response.text!=='function')invalid('DB_RESPONSE_FAILED_'+table);
}
export function createR317ScopedPostgrestAdapter({restUrl,publishableKey,userJwt,transport}={}){
  const root=base(restUrl);
  if(typeof publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]{5,}$/.test(publishableKey)||
    publishableKey.length>256)invalid('PUBLISHABLE_KEY_REQUIRED');
  if(typeof userJwt!=='string'||userJwt.length>12000||!JWTSHAPE.test(userJwt))invalid('USER_TOKEN_REQUIRED');
  if(typeof transport!=='function')invalid('INJECTED_TRANSPORT_REQUIRED');
  async function read(table,fields,limit){
    if(!(table in COL)||Object.getPrototypeOf(COL).hasOwnProperty(table)||!Number.isInteger(limit)||limit<1||limit>1001)invalid('INVALID_QUERY');
    const u=new URL(root.href);
    u.pathname+='/'+table;
    u.searchParams.set('select',COL[table]);
    for(const [col,value] of Object.entries(fields)){
      if(!['id','office_id','auth_user_id','is_active'].includes(col))invalid('FILTER_NOT_ALLOWED');
      if(col==='is_active'){if(value!=='true')invalid('FILTER_NOT_ALLOWED');u.searchParams.set(col,'eq.true')}
      else u.searchParams.set(col,'eq.'+id(value));
    }
    u.searchParams.set('limit',String(limit));
    const response=await transport(u.toString(),{
      method:'GET',headers:{'accept':'application/json','apikey':publishableKey,
      'authorization':'Bearer '+userJwt,'cache-control':'no-store'},
      cache:'no-store',credentials:'omit',redirect:'error',
    });
    rejectResponse(response,table);
    const length=response.headers?.get?.('content-length');
    if(length!=null&&(!/^\d+$/.test(length)||Number(length)>1_000_000))invalid('DB_RESPONSE_TOO_LARGE');
    const data=await response.text();
    if(data.length>1_000_000)invalid('DB_RESPONSE_TOO_LARGE');
    let rows;try{rows=JSON.parse(data)}catch{invalid('DB_INVALID_JSON')}
    if(!Array.isArray(rows)||rows.length>limit)invalid('DB_RESPONSE_SHAPE');
    for(const row of rows){if(!row||Array.isArray(row)||typeof row!=='object')invalid('DB_RESPONSE_SHAPE')}
    return rows;
  }
  return Object.freeze({
    async getOffice(officeId){
      const office=id(officeId);
      const rows=await read('taxacc_offices',{id:office},2);
      if(rows.length>1)invalid('OFFICE_NOT_UNIQUE');
      return rows[0]??null;
    },
    async findStaffMemberships(sub,officeId){
      return read('taxacc_staff',{auth_user_id:id(sub),office_id:id(officeId),is_active:'true'},2);
    },
    async listClients(officeId){
      const office=id(officeId);
      return read('taxacc_clients',{office_id:office},1001);
    },
    async getClient(officeId,clientId){
      const rows=await read('taxacc_clients',{office_id:id(officeId),id:id(clientId)},2);
      if(rows.length>1)invalid('CLIENT_NOT_UNIQUE');
      return rows[0]??null;
    }
  });
}
