/* DPRO TAX R316 — executable gateway module integration tests (synthetic only). */
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createR316Gateway} from './read-only-gateway.mjs';
const crypto=globalThis.crypto||webcrypto;
const {subtle}=crypto;
const NOW=1792494000;
const ISS='https://auth.r316.invalid/auth/v1';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',E='55555555-5555-4555-8555-555555555555';
const OA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',OC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CA='aaaaaaaa-0000-4000-8000-000000000001',CB='bbbbbbbb-0000-4000-8000-000000000001',CC='aaaaaaaa-0000-4000-8000-000000000002';
const offices=[{id:OA,is_active:true,is_demo:false,production_guard:true},{id:OB,is_active:true,is_demo:false,production_guard:true},{id:OC,is_active:false,is_demo:false,production_guard:true}];
const staff=[
{id:'s1',office_id:OA,auth_user_id:A,role:'owner',is_active:true,can_view_all_clients:true},
{id:'s2',office_id:OB,auth_user_id:B,role:'staff',is_active:true,can_view_all_clients:false},
{id:'s3',office_id:OA,auth_user_id:C,role:'reviewer',is_active:true,can_view_all_clients:false},
{id:'s4',office_id:OB,auth_user_id:C,role:'staff',is_active:true,can_view_all_clients:false},
{id:'s5',office_id:OA,auth_user_id:D,role:'owner',is_active:false,can_view_all_clients:true}
];
const clients=[{id:CA,office_id:OA,assigned_staff_id:'s3',reviewer_staff_id:'s3',secret:'NEVER_EXPOSE'},
{id:CB,office_id:OB,assigned_staff_id:'s2',reviewer_staff_id:null,secret:'NEVER_EXPOSE'},
{id:CC,office_id:OA,assigned_staff_id:null,reviewer_staff_id:null,secret:'NEVER_EXPOSE'}];
let outbound=0,dbCalls=0,checks=0,allowed=0,denied=0;
globalThis.fetch=async()=>{outbound++;throw Error('EGRESS_BLOCKED');};
const db={
 async getOffice(id){dbCalls++;return offices.find(x=>x.id===id)||null},
 async findStaffMemberships(sub,officeId){dbCalls++;return staff.filter(x=>x.auth_user_id===sub&&x.office_id===officeId&&x.is_active)},
 async listClients(officeId){dbCalls++;return clients.filter(x=>x.office_id===officeId)},
 async getClient(officeId,id){dbCalls++;return clients.find(x=>x.id===id&&x.office_id===officeId)||null}
};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const claims=(sub=A)=>({iss:ISS,aud:'authenticated',role:'authenticated',sub,iat:NOW-30,nbf:NOW-30,exp:NOW+900});
async function main(){
 const trusted=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const attacker=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const publicJwk=await subtle.exportKey('jwk',trusted.publicKey);
 const cfg={trustedPublicKeys:{'qa-key-01':publicJwk},issuer:ISS,db,now:()=>NOW};
 const gateway=createR316Gateway(cfg);
 async function mint(body=claims(),privateKey=trusted.privateKey,head={}){
   const h=b64({alg:'ES256',typ:'JWT',kid:'qa-key-01',...head});
   const p=b64(body);const sig=await subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,Buffer.from(h+'.'+p));
   return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
 }
 const tokens={};for(const sub of [A,B,C,D,E])tokens[sub]=await mint(claims(sub));
 function request(token=tokens[A],officeId=OA,path='/api/admin/dashboard',method='GET',headers={}){
   return new Request('https://worker.invalid'+path,{method,headers:{authorization:'Bearer '+token,'x-dpro-office-id':officeId,'x-admin-key':'1234','x-line-user-id':'forged',...headers}});
 }
 async function run(token=tokens[A],office=OA,path='/api/admin/dashboard',method='GET',headers={}){
  return gateway.handle(request(token,office,path,method,headers));
 }
 async function pass(name,fn){await fn();checks++;console.log('PASS '+name)}
 async function expect(name,status,fn){await pass(name,async()=>{const r=await fn();assert.equal(r.status,status,name)})}
 await pass('owner-authorized',async()=>{
   const r=await run();assert.equal(r.status,200);const out=await r.json();assert.equal(out.office_id,OA);assert.equal(out.role,'owner');
 });
 await pass('assigned-staff-authorized',async()=>{
   const r=await run(tokens[B],OB,'/api/admin/clients/'+CB);assert.equal(r.status,200);const body=await r.text();assert.ok(!body.includes('NEVER_EXPOSE'));
 });
 await pass('reviewer-assigned-authorized',async()=>assert.equal((await run(tokens[C],OA,'/api/admin/clients/'+CA)).status,200));
 await pass('staff-list-does-not-leak',async()=>{
   const r=await run(tokens[C],OA,'/api/admin/clients');assert.equal(r.status,200);const v=await r.json();
   assert.deepEqual(v.clients,[{id:CA,office_id:OA}]);assert.ok(!JSON.stringify(v).includes('NEVER_EXPOSE'));
 });
 await pass('owner-list-minimal-fields',async()=>{
   const r=await run(tokens[A],OA,'/api/admin/clients');assert.equal(r.status,200);const v=await r.json();
   assert.equal(v.clients.length,2);assert.ok(!JSON.stringify(v).includes('NEVER_EXPOSE'));
 });
 const parts=tokens[A].split('.');
 const negatives=[
 ['no-bearer',401,()=>run('',OA,'/api/admin/dashboard','GET',{authorization:''})],
 ['demo-only-bearer',401,()=>run('1234')],
 ['test-only-token',401,()=>run('test-only:'+A)],
 ['tampered-payload',401,()=>run(parts[0]+'.'+b64(claims(B))+'.'+parts[2])],
 ['other-signing-key',401,async()=>run(await mint(claims(A),attacker.privateKey))],
 ['alg-none',401,async()=>run(await mint(claims(),trusted.privateKey,{alg:'none'}))],
 ['alg-hs256',401,async()=>run(await mint(claims(),trusted.privateKey,{alg:'HS256'}))],
 ['untrusted-kid',401,async()=>run(await mint(claims(),trusted.privateKey,{kid:'other'}))],
 ['jwk-injected-header',401,async()=>run(await mint(claims(),trusted.privateKey,{jwk:publicJwk}))],
 ['jku-injected-header',401,async()=>run(await mint(claims(),trusted.privateKey,{jku:'https://evil.invalid/jwks'}))],
 ['x5u-injected-header',401,async()=>run(await mint(claims(),trusted.privateKey,{x5u:'https://evil.invalid/cert'}))],
 ['crit-injected-header',401,async()=>run(await mint(claims(),trusted.privateKey,{crit:['b64']}))],
 ['wrong-issuer',401,async()=>run(await mint({...claims(),iss:'https://evil.invalid'}))],
 ['wrong-audience',401,async()=>run(await mint({...claims(),aud:'service_role'}))],
 ['wrong-role',401,async()=>run(await mint({...claims(),role:'owner'}))],
 ['missing-sub',401,async()=>run(await mint({...claims(),sub:''}))],
 ['expired',401,async()=>run(await mint({...claims(),exp:NOW-1}))],
 ['future-nbf',401,async()=>run(await mint({...claims(),nbf:NOW+30}))],
 ['long-session',401,async()=>run(await mint({...claims(),exp:NOW+3601}))],
 ['future-iat',401,async()=>run(await mint({...claims(),iat:NOW+60}))],
 ['wrong-office',403,()=>run(tokens[A],OB)],
 ['inactive-office',403,()=>run(tokens[A],OC)],
 ['inactive-staff',403,()=>run(tokens[D],OA)],
 ['unknown-staff',403,()=>run(tokens[E],OA)],
 ['missing-office',403,()=>run(tokens[A],undefined,'/api/admin/dashboard','GET',{'x-dpro-office-id':''})],
 ['other-office-client',404,()=>run(tokens[A],OA,'/api/admin/clients/'+CB)],
 ['unassigned-client',404,()=>run(tokens[C],OA,'/api/admin/clients/'+CC)],
 ['other-office-staff',403,()=>run(tokens[B],OA,'/api/admin/dashboard')],
 ['signed-url-hold',404,()=>run(tokens[A],OA,'/api/admin/documents/'+CA+'/signed-url')],
 ['legacy-public-write',405,()=>run(tokens[A],OA,'/api/public/appointments','POST')],
 ['admin-post',405,()=>run(tokens[A],OA,'/api/admin/clients','POST')],
 ['admin-patch',405,()=>run(tokens[A],OA,'/api/admin/clients/'+CA,'PATCH')],
 ['admin-delete',405,()=>run(tokens[A],OA,'/api/admin/clients/'+CA,'DELETE')],
 ['head-denied',405,()=>run(tokens[A],OA,'/api/admin/dashboard','HEAD')],
 ['unlisted-route',404,()=>run(tokens[A],OA,'/api/admin/system-check')],
 ['query-string-denied',404,()=>run(tokens[A],OA,'/api/admin/dashboard?office_id='+OB)],
 ['path-traversal-denied',404,()=>run(tokens[A],OA,'/api/admin/clients/../other')],
 ['fake-client-id',404,()=>run(tokens[A],OA,'/api/admin/clients/bogus')],
 ];
 for(const [name,status,fn]of negatives)await expect(name,status,fn);
 await pass('spoof-identity-ignored',async()=>{
   const r=await run(tokens[B],OB,'/api/admin/dashboard','GET',{'x-verified-sub':A,'x-role':'owner','x-admin-key':'1234'});
   assert.equal(r.status,200);const v=await r.json();assert.equal(v.role,'staff');assert.equal(v.office_id,OB);
 });
 await pass('jwt-admin-claims-ignored',async()=>{
   const token=await mint({...claims(B),admin:true,office_id:OA,can_view_all_clients:true});
   assert.equal((await run(token,OB,'/api/admin/clients/'+CA)).status,404);
   assert.equal((await run(token,OB,'/api/admin/dashboard')).status,200);
 });
 await pass('database-call-after-signature-check-only',async()=>{
   const before=dbCalls;assert.equal((await run('1234')).status,401);assert.equal(dbCalls,before);
 });
 await pass('duplicate-membership-denied',async()=>{
   const bad={...db,findStaffMemberships:async()=>[staff[0],staff[0]]};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request())).status,403);
 });
 await pass('forged-membership-denied',async()=>{
   const bad={...db,findStaffMemberships:async()=>[{...staff[0],office_id:OB}]};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request())).status,403);
 });
 await pass('db-office-replay-denied',async()=>{
   const bad={...db,getOffice:async()=>offices[1]};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request())).status,403);
 });
 await pass('db-cross-office-list-fails-closed',async()=>{
   const bad={...db,listClients:async()=>clients};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request(tokens[A],OA,'/api/admin/clients'))).status,503);
 });
 await pass('db-cross-office-detail-fails-closed',async()=>{
   const bad={...db,getClient:async()=>clients[1]};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request(tokens[A],OA,'/api/admin/clients/'+CA))).status,503);
 });
 await pass('db-bad-detail-id-fails-closed',async()=>{
   const bad={...db,getClient:async()=>({...clients[0],id:CC})};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request(tokens[A],OA,'/api/admin/clients/'+CA))).status,503);
 });
 await pass('db-error-fails-closed',async()=>{
   const bad={...db,getOffice:async()=>{throw Error('DB_DOWN')}};
   const r=await createR316Gateway({...cfg,db:bad}).handle(request());
   assert.equal(r.status,503);assert.equal((await r.json()).error,'SERVICE_UNAVAILABLE');
 });
 await pass('db-response-invalid-fails-closed',async()=>{
   const bad={...db,listClients:async()=>({error:'error'})};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request(tokens[A],OA,'/api/admin/clients'))).status,503);
 });
 await pass('demo-office-fails-closed',async()=>{
   const bad={...db,getOffice:async()=>({...offices[0],is_demo:true})};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request())).status,403);
 });
 await pass('unprotected-office-fails-closed',async()=>{
   const bad={...db,getOffice:async()=>({...offices[0],production_guard:false})};
   assert.equal((await createR316Gateway({...cfg,db:bad}).handle(request())).status,403);
 });
 await pass('untrusted-jwk-private-key-rejected',async()=>{
  const privateJwk=await subtle.exportKey('jwk',trusted.privateKey);
  await assert.rejects(()=>createR316Gateway({...cfg,trustedPublicKeys:{'qa-key-01':privateJwk}}).verifyJWT(tokens[A]));
 });
 await pass('no-unintended-egress',async()=>assert.equal(outbound,0));
 const methods=['GET','POST','PATCH','DELETE','HEAD'];
 const paths=['/api/admin/dashboard','/api/admin/clients','/api/admin/clients/'+CA,'/api/admin/clients/'+CB,
 '/api/admin/clients/'+CC,'/api/admin/documents/'+CA+'/signed-url','/api/public/appointments','/api/admin/tasks'];
 for(const method of methods)for(const path of paths)for(const sub of [A,B,C,D,E])for(const officeId of [OA,OB,OC,'not-a-uuid']){
   const r=await run(tokens[sub],officeId,path,method);
   const ok=r.status===200;if(ok)allowed++;else denied++;
   const officeOk=offices.some(x=>x.id===officeId&&x.is_active&&!x.is_demo&&x.production_guard);
   const membership=staff.filter(x=>x.auth_user_id===sub&&x.office_id===officeId&&x.is_active);
   const who=membership[0];const row=clients.find(x=>path==='/api/admin/clients/'+x.id&&x.office_id===officeId);
   const eligible=who&&row&&((who.can_view_all_clients&&['owner','manager'].includes(who.role))||row.assigned_staff_id===who.id||row.reviewer_staff_id===who.id);
   const simple=path==='/api/admin/dashboard'||path==='/api/admin/clients';
   const expected=method==='GET'&&officeOk&&membership.length===1&&(simple||!!eligible);
   assert.equal(ok,expected,JSON.stringify({method,path,sub,officeId,r:r.status}));checks++;
 }
 assert.equal(allowed,12);assert.equal(denied,788);
 assert.equal(outbound,0);
 console.log(JSON.stringify({suite:'DPRO_TAX_R316_EXECUTABLE_GATEWAY_OFFLINE',checks,
   named_checks:checks-800,matrix_checks:800,allowed,denied,db_mock_calls:dbCalls,
   external_egress:outbound,actual_module_imported:true,synthetic_es256_verified:true,
   db_adapter_is_mock:true,real_worker_source_replaced:false,real_supabase_jwt:false,
   real_supabase_db:false,real_worker_deployment:false,commercial_release:'HOLD'}));
}
main().catch(e=>{console.error('R316_FAIL',e.stack||e);process.exitCode=1});
