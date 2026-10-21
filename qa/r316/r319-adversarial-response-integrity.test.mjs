/**
 * DPRO TAX R319: isolated adversarial integration/security regression.
 * Tests existing R316+R317+R318 actual executable code with disposable synthetic
 * ES256 signatures, malicious PostgREST *responses*, and zero live connections.
 * This is NOT a production authorization, RLS, or Worker acceptance test.
 */
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createR318OfflineRequestBridge} from './r318-offline-request-bridge.mjs';
if (!globalThis.crypto) globalThis.crypto=webcrypto;
const {subtle}=globalThis.crypto;
const TIME=1792494000;
const ISS='https://auth.r319.invalid/auth/v1', REST='https://db.r319.invalid/rest/v1';
const KEY='sb_publishable_SYNTHETIC_R319_QA_ONLY';
const OA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const U='66666666-6666-4666-8666-666666666666';
const CA='aaaaaaaa-0000-4000-8000-000000000001';
const CB='bbbbbbbb-0000-4000-8000-000000000001';
const CC='aaaaaaaa-0000-4000-8000-000000000002';
const offices=[
 {id:OA,is_active:true,is_demo:false,production_guard:true},
 {id:OB,is_active:true,is_demo:false,production_guard:true},
 {id:OC,is_active:false,is_demo:false,production_guard:true},
];
const staff=[
 {id:'s1',office_id:OA,auth_user_id:A,role:'owner',is_active:true,can_view_all_clients:true},
 {id:'s2',office_id:OB,auth_user_id:B,role:'staff',is_active:true,can_view_all_clients:false},
 {id:'s3',office_id:OA,auth_user_id:C,role:'reviewer',is_active:true,can_view_all_clients:false},
];
const clients=[
 {id:CA,office_id:OA,assigned_staff_id:'s3',reviewer_staff_id:'s3',email:'private@example.invalid',secret:'NEVER_EXPOSE_R319'},
 {id:CB,office_id:OB,assigned_staff_id:'s2',reviewer_staff_id:null,secret:'NEVER_EXPOSE_R319'},
 {id:CC,office_id:OA,assigned_staff_id:null,reviewer_staff_id:null,secret:'NEVER_EXPOSE_R319'},
];
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
let checks=0, network=0, dbCalls=0, rejected=0, allowed=0;
globalThis.fetch=async()=>{network++;throw Error('GLOBAL_NETWORK_FORBIDDEN')};
const okResponse=rows=>new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});
const pass=async(name,fn)=>{await fn();checks++;console.log('PASS '+name)};
async function main(){
 const trusted=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const outsider=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await subtle.exportKey('jwk',trusted.publicKey);
 const tokenOwners=new Map();
 const mint=async(sub=A,claims={},signer=trusted.privateKey,header={})=>{
  const h=b64({alg:'ES256',kid:'r319-qa',typ:'JWT',...header});
  const p=b64({iss:ISS,aud:'authenticated',sub,role:'authenticated',iat:TIME-30,nbf:TIME-30,exp:TIME+900,...claims});
  const signature=await subtle.sign({name:'ECDSA',hash:'SHA-256'},signer,Buffer.from(h+'.'+p));
  const t=h+'.'+p+'.'+Buffer.from(signature).toString('base64url');tokenOwners.set(t,sub);return t;
 };
 const tokens=new Map();for(const x of [A,B,C,U])tokens.set(x,await mint(x));
 const config={issuer:ISS,restUrl:REST,publishableKey:KEY,trustedPublicKeys:{'r319-qa':jwk},now:()=>TIME};
 const makeReq=(sub=A,office=OA,path='/api/admin/dashboard',method='GET',overrides={})=>new Request('https://worker.r319.invalid'+path,{method,headers:{'authorization':'Bearer '+tokens.get(sub),'x-dpro-office-id':office,...overrides}});
 const queryTable=url=>new URL(url).pathname.split('/').at(-1);
 const scope=url=>Object.fromEntries(new URL(url).searchParams.entries());
 function makeTransport({poison,delay=false}={}){
  return async(url,opt)=>{
   dbCalls++;
   assert.equal(opt.method,'GET');assert.equal(opt.credentials,'omit');assert.equal(opt.redirect,'error');assert.equal(opt.cache,'no-store');
   assert.equal(opt.headers.apikey,KEY);assert.match(opt.headers.authorization,/^Bearer [A-Za-z0-9_.-]+$/);
   const sub=tokenOwners.get(opt.headers.authorization.slice(7));
   if(!sub)throw Error('DB_JWT_OR_REQUEST_LEAK');
   if(delay)await Promise.resolve();
   const u=new URL(url),tbl=queryTable(url),q=scope(url);
   assert.equal(u.origin,'https://db.r319.invalid');
   assert.ok(['taxacc_offices','taxacc_staff','taxacc_clients'].includes(tbl));
   assert.ok(q.select&&!/secret|email|password|token/i.test(q.select));
   assert.ok(Object.keys(q).every(x=>['select','id','office_id','auth_user_id','is_active','limit'].includes(x)));
   let rows=[];
   if(tbl==='taxacc_offices')rows=offices.filter(x=>q.id==='eq.'+x.id);
   if(tbl==='taxacc_staff'){
    assert.equal(q.auth_user_id,'eq.'+sub);
    assert.equal(q.is_active,'eq.true');
    rows=staff.filter(x=>q.office_id==='eq.'+x.office_id&&x.auth_user_id===sub&&x.is_active);
   }
   if(tbl==='taxacc_clients'){
    assert.ok(q.office_id?.startsWith('eq.'));
    rows=clients.filter(x=>q.office_id==='eq.'+x.office_id&&(!q.id||q.id==='eq.'+x.id));
   }
   const intercepted=poison?.({table:tbl,rows,query:q,sub,url,options:opt});
   if(intercepted instanceof Response) return intercepted;
   if(intercepted!==undefined)rows=intercepted;
   return okResponse(rows);
  };
 }
 const bridgeFor=opts=>createR318OfflineRequestBridge({...config,transport:makeTransport(opts)});
 const bridge=bridgeFor({delay:true});
 async function check(r,status,shape,denyBody=false){
  assert.equal(r.status,status);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.match(r.headers.get('content-type')||'',/^application\/json/);
  const raw=await r.text();assert.ok(!raw.includes('NEVER_EXPOSE_R319'));assert.ok(!raw.includes('private@example.invalid'));
  for(const t of tokens.values())assert.ok(!raw.includes(t),'JWT_LEAK');
  const body=JSON.parse(raw);assert.equal(typeof body.ok,'boolean');
  if(status===200){assert.equal(body.ok,true);assert.deepEqual(Object.keys(body).sort(),shape.sort());allowed++;}
  else {assert.equal(body.ok,false);assert.ok(Object.keys(body).length<=2);if(denyBody)assert.ok(['UNAUTHORIZED','FORBIDDEN','NOT_FOUND','METHOD_DISABLED','SERVICE_UNAVAILABLE'].includes(body.error));rejected++;}
  return body;
 }
 await pass('clean-owner-dashboard',async()=>{const b=await check(await bridge.handle(makeReq()),200,['ok','office_id','staff_id','role']);assert.equal(b.office_id,OA)});
 await pass('clean-staff-owned-list',async()=>{const b=await check(await bridge.handle(makeReq(B,OB,'/api/admin/clients')),200,['ok','clients']);assert.deepEqual(b.clients,[{id:CB,office_id:OB}])});
 await pass('reviewer-cannot-see-unassigned',async()=>{const b=await check(await bridge.handle(makeReq(C,OA,'/api/admin/clients')),200,['ok','clients']);assert.deepEqual(b.clients,[{id:CA,office_id:OA}])});
 await pass('unassigned-staff-denied',async()=>{await check(await bridge.handle(makeReq(U,OA)),403,[],true)});
 await pass('cross-office-owner-denied',async()=>{await check(await bridge.handle(makeReq(A,OB)),403,[],true)});
 await pass('other-office-record-hidden',async()=>{await check(await bridge.handle(makeReq(A,OA,'/api/admin/clients/'+CB)),404,[],true)});
 await pass('assigned-record-fields-minimal',async()=>{const b=await check(await bridge.handle(makeReq(C,OA,'/api/admin/clients/'+CA)),200,['ok','client']);assert.deepEqual(b.client,{id:CA,office_id:OA})});
 const noDBTests=[
  ['missing-bearer','',OA,'/api/admin/dashboard','GET',401],
  ['admin-code-in-bearer','Bearer 1234',OA,'/api/admin/dashboard','GET',401],
  ['forged-sub-in-bearer','Bearer test-only:'+A,OA,'/api/admin/dashboard','GET',401],
  ['bearer-whitespace','Bearer  '+tokens.get(A),OA,'/api/admin/dashboard','GET',401],
  ['bearer-two-tokens','Bearer '+tokens.get(A)+' '+tokens.get(B),OA,'/api/admin/dashboard','GET',401],
  ['bearer-lowercase','bearer '+tokens.get(A),OA,'/api/admin/dashboard','GET',401],
  ['query-at-dashboard','Bearer '+tokens.get(A),OA,'/api/admin/dashboard?client_id='+CB,'GET',404],
  ['encoded-client','Bearer '+tokens.get(A),OA,'/api/admin/clients/%61','GET',404],
  ['signed-url-hold','Bearer '+tokens.get(A),OA,'/api/admin/documents/'+CA+'/signed-url','GET',404],
  ['demo-prepare-read','Bearer '+tokens.get(A),OA,'/api/admin/demo-prepare','GET',404],
  ['demo-prepare-write','Bearer '+tokens.get(A),OA,'/api/admin/demo-prepare','POST',405],
  ['patch-denied','Bearer '+tokens.get(A),OA,'/api/admin/clients/'+CA,'PATCH',405],
  ['delete-denied','Bearer '+tokens.get(A),OA,'/api/admin/clients/'+CA,'DELETE',405],
  ['head-denied','Bearer '+tokens.get(A),OA,'/api/admin/dashboard','HEAD',405],
  ['bad-office','Bearer '+tokens.get(A),'not-an-office','/api/admin/dashboard','GET',403],
 ];
 for(const [name,auth,office,path,method,status] of noDBTests)await pass(name,async()=>{
  const b=dbCalls,r=makeReq(A,office,path,method,{authorization:auth,'x-admin-key':'1234','x-line-user-id':'forged'});
  await check(await bridge.handle(r),status,[],true);assert.equal(dbCalls,b,'REJECTED_REQUEST_REACHED_DB');
 });
 const forged=[
  ['forged-claim-role',{role:'service_role'}],
  ['expired',{exp:TIME-1}],
  ['future-nbf',{nbf:TIME+90}],
  ['wrong-issuer',{iss:'https://bad.r319.invalid/auth/v1'}],
  ['wrong-audience',{aud:'service_role'}],
  ['wrong-sub',{sub:'not-a-uuid'}]
 ];
 for(const [name,claims] of forged)await pass(name,async()=>{
  const b=dbCalls,jwt=await mint(A,claims),r=makeReq(A,OA,'/api/admin/dashboard','GET',{authorization:'Bearer '+jwt});
  await check(await bridge.handle(r),401,[],true);assert.equal(dbCalls,b);
 });
 await pass('extra-signed-claims-cannot-elevate-or-redirect-office',async()=>{
  const jwt=await mint(A,{office_id:OB,admin:true,can_view_all_clients:true});
  const result=await check(await bridge.handle(makeReq(A,OA,'/api/admin/dashboard','GET',{authorization:'Bearer '+jwt,'x-admin-key':'1234'})),200,['ok','office_id','staff_id','role']);
  assert.equal(result.office_id,OA);assert.equal(result.role,'owner');
 });
 await pass('wrong-signing-key',async()=>{
  const b=dbCalls,t=await mint(A,{},outsider.privateKey);
  await check(await bridge.handle(makeReq(A,OA,'/api/admin/dashboard','GET',{authorization:'Bearer '+t})),401,[],true);assert.equal(dbCalls,b);
 });
 const poisons=[
  ['invalid-json',()=>new Response('not-json',{status:200})],
  ['non-array-json',()=>new Response('{}',{status:200})],
  ['wrong-http-status',()=>new Response('[]',{status:401})],
  ['redirect-http-status',()=>new Response('[]',{status:302})],
  ['not-found-http-status',()=>new Response('[]',{status:404})],
  ['error-http-status',()=>new Response('[]',{status:503})],
  ['oversized-content-length',()=>new Response('[]',{status:200,headers:{'content-length':'1000001'}})],
  ['invalid-content-length',()=>new Response('[]',{status:200,headers:{'content-length':'many'}})],
  ['oversized-json-response',()=>new Response('['+' '.repeat(1000010)+']',{status:200})],
  ['not-array-row',()=>new Response('[3]',{status:200})],
 ];
 for(const [name,mal] of poisons)await pass(name,async()=>{
  const b=bridgeFor({poison:()=>mal()});await check(await b.handle(makeReq(A,OA,'/api/admin/clients')),503,[],true);
 });
 const rowPoisons=[
  ['cross-office-row',{...clients[1]}],
  ['wrong-client-id',{...clients[0],id:CB},'/api/admin/clients/'+CA],
  ['missing-office-id',{id:CA,assigned_staff_id:'s3'}],
  ['string-office-id',{...clients[0],office_id:'office-a'}],
 ];
 for(const [name,row,path='/api/admin/clients'] of rowPoisons)await pass(name,async()=>{
  const b=bridgeFor({poison:({table})=>table==='taxacc_clients'?[row]:undefined});
  await check(await b.handle(makeReq(A,OA,path)),503,[],true);
 });
 await pass('duplicate-staff-fails-closed',async()=>{
  const b=bridgeFor({poison:({table,rows})=>table==='taxacc_staff'?[...rows,...rows]:undefined});
  await check(await b.handle(makeReq(A,OA)),403,[],true);
 });
 await pass('duplicate-office-fails-closed',async()=>{
  const b=bridgeFor({poison:({table,rows})=>table==='taxacc_offices'?[...rows,...rows]:undefined});
  await check(await b.handle(makeReq(A,OA)),503,[],true);
 });
 await pass('office-is-demo-fails-closed',async()=>{
  const b=bridgeFor({poison:({table,rows})=>table==='taxacc_offices'?rows.map(x=>({...x,is_demo:true})):undefined});
  await check(await b.handle(makeReq(A,OA)),403,[],true);
 });
 await pass('office-production-guard-not-true',async()=>{
  const b=bridgeFor({poison:({table,rows})=>table==='taxacc_offices'?rows.map(x=>({...x,production_guard:'true'})):undefined});
  await check(await b.handle(makeReq(A,OA)),403,[],true);
 });
 await pass('inactive-staff-row-not-accepted',async()=>{
  const b=bridgeFor({poison:({table,rows})=>table==='taxacc_staff'?rows.map(x=>({...x,is_active:false})):undefined});
  await check(await b.handle(makeReq(A,OA)),403,[],true);
 });
 await pass('staff-role-from-db-must-not-overgrant',async()=>{
  const b=bridgeFor({poison:({table,rows})=>table==='taxacc_staff'?rows.map(x=>({...x,role:'service_role',can_view_all_clients:true})):undefined});
  await check(await b.handle(makeReq(A,OA)),403,[],true);
 });
 await pass('staff-mismatched-auth-user',async()=>{
  const b=bridgeFor({poison:({table,rows})=>table==='taxacc_staff'?rows.map(x=>({...x,auth_user_id:B})):undefined});
  await check(await b.handle(makeReq(A,OA)),403,[],true);
 });
 await pass('valid-office-not-enough-without-membership',async()=>await check(await bridge.handle(makeReq(U,OB)),403,[],true));
 await pass('all-response-headers-safe',async()=>{
  const r=await bridge.handle(makeReq());assert.equal(r.headers.get('access-control-allow-origin'),null);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('location'),null);
 });
 await pass('all-live-network-remains-blocked',async()=>assert.equal(network,0));
 // Novel request-header combination stress test; each must be tenant-isolated.
 // This is separate from R318's method/route/office matrix.
 const methods=['GET','POST','PATCH','DELETE'];
 const paths=['/api/admin/dashboard','/api/admin/clients','/api/admin/clients/'+CA,'/api/admin/clients/'+CB,'/api/admin/documents/'+CA+'/signed-url'];
 const subjects=[A,B,C,U],tenants=[OA,OB,OC];
 let matrix=0,accepted=0,declined=0;
 for(const method of methods)for(const path of paths)for(const sub of subjects)for(const office of tenants){
   const res=await bridge.handle(makeReq(sub,office,path,method,{'x-admin-key':'1234','x-verified-sub':A,'x-line-user-id':'forged'}));
   const active=offices.find(x=>x.id===office)?.is_active;
   const person=staff.find(x=>x.auth_user_id===sub&&x.office_id===office&&x.is_active);
   const row=clients.find(x=>path==='/api/admin/clients/'+x.id&&x.office_id===office);
   const eligible=!!person&&!!row&&(person.can_view_all_clients===true&&['owner','manager'].includes(person.role)||person.id===row.assigned_staff_id||person.id===row.reviewer_staff_id);
   const expected=method==='GET'&&!!active&&!!person&&(path==='/api/admin/dashboard'||path==='/api/admin/clients'||eligible);
   assert.equal(res.status===200,expected,JSON.stringify({method,path,sub,office,status:res.status}));
   const raw=await res.text();assert.ok(!raw.includes('NEVER_EXPOSE_R319'));
   if(expected){accepted++;const b=JSON.parse(raw);assert.equal(b.ok,true);if(b.clients)assert.ok(b.clients.every(c=>c.office_id===office));if(b.client)assert.equal(b.client.office_id,office)}else declined++;
   matrix++;
 }
 assert.equal(matrix,240);assert.equal(network,0);
 console.log(JSON.stringify({suite:'DPRO_TAX_R319_ADVERSARIAL_RESPONSE_INTEGRITY_OFFLINE',checks:checks+matrix,named_checks:checks,matrix_checks:matrix,accepted,declined,mock_db_calls:dbCalls,external_egress:network,actual_r318_module_imported:true,synthetic_es256_only:true,adversarial_db_responses:true,live_supabase_jwt:false,live_supabase_rls_verified:false,live_worker_execution:false,production_deployment:false,commercial_release:'HOLD'}));
}
main().catch(e=>{console.error('R319_FAIL',e.stack||e);process.exitCode=1});
