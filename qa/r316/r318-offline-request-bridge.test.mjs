/** DPRO TAX R318 disconnected JWT-to-DB token provenance, per-request isolation. */
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createR318OfflineRequestBridge} from './r318-offline-request-bridge.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {subtle}=globalThis.crypto;
const NOW=1792494000,ISS='https://auth.r318.invalid/auth/v1';
const REST='https://db.r318.invalid/rest/v1',KEY='sb_publishable_TEST_R318_MOCK_ONLY';
const OA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',OC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',E='55555555-5555-4555-8555-555555555555';
const CA='aaaaaaaa-0000-4000-8000-000000000001',CB='bbbbbbbb-0000-4000-8000-000000000001',CC='aaaaaaaa-0000-4000-8000-000000000002';
const offices=[{id:OA,is_active:true,is_demo:false,production_guard:true},{id:OB,is_active:true,is_demo:false,production_guard:true},{id:OC,is_active:false,is_demo:false,production_guard:true}];
const staff=[
{id:'s1',office_id:OA,auth_user_id:A,role:'owner',is_active:true,can_view_all_clients:true},
{id:'s2',office_id:OB,auth_user_id:B,role:'staff',is_active:true,can_view_all_clients:false},
{id:'s3',office_id:OA,auth_user_id:C,role:'reviewer',is_active:true,can_view_all_clients:false},
{id:'s4',office_id:OB,auth_user_id:C,role:'staff',is_active:true,can_view_all_clients:false},
{id:'s5',office_id:OA,auth_user_id:D,role:'owner',is_active:false,can_view_all_clients:true}
];
const clients=[
{id:CA,office_id:OA,assigned_staff_id:'s3',reviewer_staff_id:'s3',secret:'NEVER_EXPOSE'},
{id:CB,office_id:OB,assigned_staff_id:'s2',reviewer_staff_id:null,secret:'NEVER_EXPOSE'},
{id:CC,office_id:OA,assigned_staff_id:null,reviewer_staff_id:null,secret:'NEVER_EXPOSE'}
];
const tokBySub=new Map(),subByToken=new Map();
let checks=0,requests=0,externalEgress=0,bridgeCalls=0,denied=0,allowed=0;
globalThis.fetch=async()=>{externalEgress++;throw Error('EGRESS_FORBIDDEN')};
const pass=async(name,fn)=>{await fn();checks++;console.log('PASS '+name)};
const denyConfig=async(name,fn)=>pass(name,async()=>{assert.throws(fn)});
const response=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function main(){
 const key=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const foreign=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const publicJwk=await subtle.exportKey('jwk',key.publicKey);
 const mint=async(sub,privateKey=key.privateKey,extra={})=>{
  const h=b64({alg:'ES256',kid:'qa-r318',typ:'JWT'}),p=b64({iss:ISS,aud:'authenticated',sub,role:'authenticated',iat:NOW-30,nbf:NOW-30,exp:NOW+900,...extra});
  const signature=await subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,Buffer.from(h+'.'+p));
  return h+'.'+p+'.'+Buffer.from(signature).toString('base64url');
 };
 for(const sub of [A,B,C,D,E]){const token=await mint(sub);tokBySub.set(sub,token);subByToken.set(token,sub)}
 const cfg={issuer:ISS,restUrl:REST,publishableKey:KEY,trustedPublicKeys:{'qa-r318':publicJwk},now:()=>NOW};
 const req=(token=tokBySub.get(A),office=OA,path='/api/admin/dashboard',method='GET',headers={})=>new Request('https://worker.r318.invalid'+path,{method,headers:{authorization:'Bearer '+token,'x-dpro-office-id':office,'x-admin-key':'1234','x-line-user-id':'forged',...headers}});
 const audits=[];
 function transport({dirtyClient=false,errorStatus=0,delay=false}={}){
  return async(url,options)=>{
   bridgeCalls++;
   if(delay)await Promise.resolve();
   assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
   assert.equal(options.headers.apikey,KEY);
   const jwt=options.headers.authorization?.replace(/^Bearer /,'');
   const sub=subByToken.get(jwt);
   assert.ok(sub,'cross-request-token-or-unknown-signed-token');
   const u=new URL(url);assert.equal(u.origin,'https://db.r318.invalid');
   const tbl=u.pathname.split('/').at(-1);assert.ok(['taxacc_offices','taxacc_staff','taxacc_clients'].includes(tbl));
   const q=u.searchParams,officeId=(q.get('office_id')||q.get('id')||'').slice(3);
   assert.ok([OA,OB,OC].includes(officeId));
   audits.push({sub,officeId,table:tbl,jwt});requests++;
   if(errorStatus)return new Response('{}',{status:errorStatus});
   let rows=[];
   if(tbl==='taxacc_offices')rows=offices.filter(x=>x.id===officeId);
   if(tbl==='taxacc_staff'){
    assert.equal(q.get('auth_user_id'),'eq.'+sub,'signed-token-sub-must-match-db-staff-lookup');
    assert.equal(q.get('is_active'),'eq.true');
    rows=staff.filter(x=>x.auth_user_id===sub&&x.office_id===officeId&&x.is_active===true);
   }
   if(tbl==='taxacc_clients'){
    assert.ok(q.has('office_id'));
    rows=clients.filter(x=>x.office_id===officeId);
    if(q.has('id'))rows=rows.filter(x=>x.id===q.get('id').slice(3));
    if(dirtyClient&&officeId===OA)rows=[...rows,clients.find(x=>x.office_id===OB)];
   }
   return response(rows);
  };
 }
 const bridge=createR318OfflineRequestBridge({...cfg,transport:transport({delay:true})});
 await pass('owner-request-scoped-dashboard',async()=>{
  const r=await bridge.handle(req());assert.equal(r.status,200);
  const body=await r.json();assert.equal(body.office_id,OA);assert.equal(body.role,'owner');
 });
 await pass('staff-separate-token-separate-office',async()=>{
  const r=await bridge.handle(req(tokBySub.get(B),OB));assert.equal(r.status,200);
  assert.equal((await r.json()).role,'staff');
 });
 await pass('unauthorized-cross-tenant-token-not-replaced',async()=>{
  const r=await bridge.handle(req(tokBySub.get(A),OB));assert.equal(r.status,403);
 });
 await pass('no-admin-code-escalation',async()=>{
  const r=await bridge.handle(req(tokBySub.get(B),OA,'/api/admin/dashboard','GET',{'x-admin-key':'1234','x-verified-sub':A}));assert.equal(r.status,403);
 });
 await pass('jwt-tamper-rejected-before-transport',async()=>{
  const original=tokBySub.get(A).split('.');const bad=original[0]+'.'+b64({sub:B})+'.'+original[2];const before=bridgeCalls;
  assert.equal((await bridge.handle(req(bad))).status,401);assert.equal(bridgeCalls,before);
 });
 await pass('wrong-key-rejected-before-transport',async()=>{
  const before=bridgeCalls;assert.equal((await bridge.handle(req(await mint(A,foreign.privateKey)))).status,401);assert.equal(bridgeCalls,before);
 });
 await pass('expired-denied-without-transport',async()=>{
  const before=bridgeCalls;assert.equal((await bridge.handle(req(await mint(A,key.privateKey,{exp:NOW-1})))).status,401);assert.equal(bridgeCalls,before);
 });
 await pass('signed-client-filtering',async()=>{
  const owner=await bridge.handle(req(tokBySub.get(A),OA,'/api/admin/clients'));
  assert.equal(owner.status,200);assert.deepEqual((await owner.json()).clients,[{id:CA,office_id:OA},{id:CC,office_id:OA}]);
  const reviewer=await bridge.handle(req(tokBySub.get(C),OA,'/api/admin/clients'));
  assert.equal(reviewer.status,200);assert.deepEqual((await reviewer.json()).clients,[{id:CA,office_id:OA}]);
 });
 await pass('data-exposure-minimal-fields',async()=>{
  const r=await bridge.handle(req(tokBySub.get(B),OB,'/api/admin/clients/'+CB));assert.equal(r.status,200);
  const body=await r.text();assert.deepEqual(JSON.parse(body).client,{id:CB,office_id:OB});assert.ok(!body.includes('NEVER_EXPOSE'));
 });
 await pass('invalid-subheader-ignored',async()=>{
  const r=await bridge.handle(req(tokBySub.get(B),OB,'/api/admin/dashboard','GET',{'x-verified-sub':A,'x-dpro-staff-id':'s1'}));assert.equal(r.status,200);
  assert.equal((await r.json()).staff_id,'s2');
 });
 await pass('simultaneous-50-requests-isolated',async()=>{
  const entries=Array.from({length:50},(_,i)=>({sub:i%2?B:A,office:i%2?OB:OA}));
  const res=await Promise.all(entries.map(async x=>({x,r:await bridge.handle(req(tokBySub.get(x.sub),x.office,'/api/admin/clients'))})));
  for(const {x,r} of res){assert.equal(r.status,200);const body=await r.json();assert.equal(body.clients.length,x.office===OA?2:1);assert.ok(body.clients.every(c=>c.office_id===x.office));}
 });
 await pass('simultaneous-conflicting-token-office-denied',async()=>{
  const before=bridgeCalls;
  const res=await Promise.all(Array.from({length:30},(_,i)=>bridge.handle(req(tokBySub.get(i%2?A:B),i%2?OB:OA))));
  assert.ok(res.every(r=>r.status===403));assert.ok(bridgeCalls>before);
 });
 await pass('db-cross-office-injection-denied',async()=>{
  const t=createR318OfflineRequestBridge({...cfg,transport:transport({dirtyClient:true})});
  const r=await t.handle(req(tokBySub.get(A),OA,'/api/admin/clients'));assert.equal(r.status,503);
 });
 await pass('db-401-fails-closed',async()=>{
  const t=createR318OfflineRequestBridge({...cfg,transport:transport({errorStatus:401})});
  assert.equal((await t.handle(req())).status,503);
 });
 await pass('db-503-fails-closed',async()=>{
  const t=createR318OfflineRequestBridge({...cfg,transport:transport({errorStatus:503})});
  assert.equal((await t.handle(req())).status,503);
 });
 await pass('actual-global-fetch-never-used',async()=>assert.equal(externalEgress,0));
 for(const [name,patch] of [
  ['live-real-host',{restUrl:'https://example.supabase.co/rest/v1'}],
  ['localhost-rest',{restUrl:'https://localhost/rest/v1'}],
  ['external-issuer',{issuer:'https://identity.example.com/auth/v1'}],
  ['plain-http',{restUrl:'http://db.r318.invalid/rest/v1'}],
  ['hidden-query',{restUrl:REST+'?p=1'}],
  ['secret-key',{publishableKey:'sb_secret_INVALID'}],
  ['non-test-publishable',{publishableKey:'sb_publishable_REAL_LOOKALIKE'}],
  ['legacy-key',{publishableKey:'1234'}],
  ['missing-transport',{transport:null}],
  ['global-fetch-as-transport',{transport:globalThis.fetch}],
  ['missing-trust',{trustedPublicKeys:{}}],
 ])await denyConfig(name,()=>createR318OfflineRequestBridge({...cfg,transport:transport(),...patch}));
 const unsafeHosts=['https://worker.example.com','http://worker.r318.invalid','https://localhost','https://worker.r318.invalid:444'];
 for(const host of unsafeHosts)await pass('reject-live-worker-origin-'+host,async()=>{
  const r=new Request(host+'/api/admin/dashboard',{headers:{authorization:'Bearer '+tokBySub.get(A),'x-dpro-office-id':OA}});
  const before=bridgeCalls,ret=await bridge.handle(r);assert.notEqual(ret.status,200);assert.equal(bridgeCalls,before);
 });
 const bads=[
  ['missing-bearer',{'authorization':''},'/api/admin/dashboard','GET',401],
  ['admin-bearer',{'authorization':'Bearer 1234'},'/api/admin/dashboard','GET',401],
  ['malformed-bearer',{'authorization':'Basic abc'},'/api/admin/dashboard','GET',401],
  ['fake-verified-token',{'authorization':'Bearer test-only:'+A},'/api/admin/dashboard','GET',401],
  ['forged-line-id',{'authorization':'' ,'x-line-user-id':A},'/api/admin/dashboard','GET',401],
  ['query-injection',{},'/api/admin/dashboard?office='+OB,'GET',404],
  ['legacy-admin-api',{},'/api/admin/demo-prepare','POST',405],
  ['signed-url',{},'/api/admin/documents/'+CA+'/signed-url','GET',404],
  ['write-patch',{},'/api/admin/clients/'+CA,'PATCH',405],
  ['write-delete',{},'/api/admin/clients/'+CA,'DELETE',405],
 ];
 for(const [name,headers,path,method,expected] of bads)await pass(name,async()=>{
  const before=bridgeCalls,r=await bridge.handle(req(tokBySub.get(A),OA,path,method,headers));
  assert.equal(r.status,expected);assert.equal(bridgeCalls,before);
 });
 // Re-run the 180-case R317 method/path/user/office contract, with a different
 // request-scoped adapter per call rather than a single bound adapter.
 const methods=['GET','POST','PATCH','DELETE'];
 const paths=['/api/admin/dashboard','/api/admin/clients','/api/admin/clients/'+CA,'/api/admin/clients/'+CB,'/api/admin/documents/'+CA+'/signed-url'];
 let matrix=0;
 for(const method of methods)for(const path of paths)for(const sub of [A,B,C])for(const office of [OA,OB,OC]){
  const out=await bridge.handle(req(tokBySub.get(sub),office,path,method));
  const member=staff.find(x=>x.auth_user_id===sub&&x.office_id===office&&x.is_active);
  const active=offices.find(x=>x.id===office)?.is_active;
  const row=clients.find(x=>path==='/api/admin/clients/'+x.id&&x.office_id===office);
  const eligible=!!member&&!!row&&(member.can_view_all_clients&&['owner','manager'].includes(member.role)||row.assigned_staff_id===member.id||row.reviewer_staff_id===member.id);
  const simple=path==='/api/admin/dashboard'||path==='/api/admin/clients';
  const expected=method==='GET'&&!!active&&!!member&&(simple||eligible);
  assert.equal(out.status===200,expected,JSON.stringify({method,path,sub,office,status:out.status}));
  if(out.status===200)allowed++;else denied++;
  matrix++;
 }
 assert.equal(matrix,180);assert.equal(externalEgress,0);
 assert.equal(audits.every(x=>x.jwt===tokBySub.get(x.sub)),true);
 const total=checks+matrix;
 console.log(JSON.stringify({suite:'DPRO_TAX_R318_REQUEST_LOCAL_IDENTITY_DB_BINDING_OFFLINE',checks:total,named_checks:checks,matrix_checks:matrix,matrix_allowed:allowed,matrix_denied:denied,db_mock_calls:requests,external_egress:externalEgress,request_scoped_adapter:true,synthetic_es256:true,real_supabase_jwt:false,real_supabase_rls_verified:false,actual_worker_integration:false,production_deployment:false,commercial_release:'HOLD'}));
}
main().catch(e=>{console.error('R318_FAIL',e.stack||e);process.exitCode=1});
