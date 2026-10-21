/** R317 disconnected contract: PostgREST query scoping AND actual R316 gateway interop. */
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createR316Gateway} from './read-only-gateway.mjs';
import {createR317ScopedPostgrestAdapter} from './r317-scoped-postgrest-adapter.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {subtle}=globalThis.crypto;
const ISS='https://r317.identity.invalid.test/auth/v1',NOW=1792494000;
const OA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',OC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const CA='aaaaaaaa-0000-4000-8000-000000000001',CB='bbbbbbbb-0000-4000-8000-000000000001';
const offices=[{id:OA,is_active:true,is_demo:false,production_guard:true},{id:OB,is_active:true,is_demo:false,production_guard:true},{id:OC,is_active:false,is_demo:false,production_guard:true}];
const staff=[{id:'s1',office_id:OA,auth_user_id:A,role:'owner',is_active:true,can_view_all_clients:true},{id:'s2',office_id:OB,auth_user_id:B,role:'staff',is_active:true,can_view_all_clients:false}];
const clients=[{id:CA,office_id:OA,assigned_staff_id:'s1',reviewer_staff_id:null,secret:'NEVER_EXPOSE'},{id:CB,office_id:OB,assigned_staff_id:'s2',reviewer_staff_id:null,secret:'NEVER_EXPOSE'}];
const REST='https://db.invalid.test/rest/v1';
const KEY='sb_publishable_TEST_ONLY_NO_REAL_CONNECTION', FAKEJWT='a.b.c';
let passes=0,requests=0,networkAttempts=0,policyRejections=0;
globalThis.fetch=async()=>{networkAttempts++;throw Error('NETWORK_FORBIDDEN')};
const pass=async(name,fn)=>{await fn();passes++;console.log('PASS '+name)};
const denied=async(name,fn)=>pass(name,async()=>{await assert.rejects(fn)});
const okResponse=(rows,code=200)=>new Response(JSON.stringify(rows),{status:code,headers:{'content-type':'application/json'}});
function mockTransport({forceResponse=null,allowOnlyScoped=true}={}){
  return async(input,opts)=>{
    requests++;
    const u=new URL(input);
    assert.equal(u.origin,'https://db.invalid.test');
    assert.equal(u.pathname.startsWith('/rest/v1/taxacc_'),true);
    assert.equal(opts.method,'GET');assert.equal(opts.cache,'no-store');
    assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');
    assert.equal(opts.headers.apikey,KEY);assert.equal(opts.headers.authorization,'Bearer '+FAKEJWT);
    assert.equal(opts.headers['cache-control'],'no-store');
    if(forceResponse)return forceResponse(u);
    const table=u.pathname.split('/').at(-1), q=u.searchParams;
    const expected={taxacc_offices:'id,is_active,is_demo,production_guard',taxacc_staff:'id,office_id,auth_user_id,role,is_active,can_view_all_clients',taxacc_clients:'id,office_id,assigned_staff_id,reviewer_staff_id'};
    assert.equal(q.get('select'),expected[table]);
    const office=(q.get('office_id')||q.get('id')||'').replace(/^eq\./,'');
    let rows=[];
    if(table==='taxacc_offices')rows=offices.filter(x=>x.id===office);
    if(table==='taxacc_staff'){
      assert.equal(q.get('is_active'),'eq.true');
      const sub=q.get('auth_user_id')?.replace(/^eq\./,'');
      assert.ok(q.get('office_id')?.startsWith('eq.'));
      rows=staff.filter(x=>x.auth_user_id===sub&&x.office_id===office&&x.is_active);
    }
    if(table==='taxacc_clients'){
      assert.ok(q.get('office_id')?.startsWith('eq.'));
      rows=clients.filter(x=>x.office_id===office);
      if(q.has('id'))rows=rows.filter(x=>x.id===q.get('id').slice(3));
    }
    if(allowOnlyScoped)assert.ok(['taxacc_offices','taxacc_staff','taxacc_clients'].includes(table));
    return okResponse(rows);
  }
}
function adapter(transport=mockTransport(),extras={}){
  return createR317ScopedPostgrestAdapter({restUrl:REST,publishableKey:KEY,userJwt:FAKEJWT,transport,...extras});
}
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
async function main(){
  const trusted=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await subtle.exportKey('jwk',trusted.publicKey);
  const mint=async(sub)=>{
    const h=b64({alg:'ES256',typ:'JWT',kid:'synthetic'}),p=b64({iss:ISS,aud:'authenticated',sub,role:'authenticated',iat:NOW-30,nbf:NOW-30,exp:NOW+900});
    const sig=await subtle.sign({name:'ECDSA',hash:'SHA-256'},trusted.privateKey,Buffer.from(h+'.'+p));
    return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
  };
  const cfg={issuer:ISS,audience:'authenticated',trustedPublicKeys:{synthetic:jwk},now:()=>NOW};
  const token=await mint(A);
  const req=(tok=token,office=OA,path='/api/admin/clients',method='GET')=>new Request('https://worker.invalid.test'+path,{method,headers:{authorization:'Bearer '+tok,'x-dpro-office-id':office,'x-admin-key':'1234'}});
  await pass('owner-auth-real-module-adapter',async()=>{
    const gate=createR316Gateway({...cfg,db:adapter()});const r=await gate.handle(req());
    assert.equal(r.status,200);assert.deepEqual((await r.json()).clients,[{id:CA,office_id:OA}]);
  });
  await pass('unauthorized-cross-tenant-denied',async()=>{
    const gate=createR316Gateway({...cfg,db:adapter()});
    assert.equal((await gate.handle(req(token,OB))).status,403);
  });
  await pass('signed-client-owner-detail',async()=>{
    const gate=createR316Gateway({...cfg,db:adapter()});
    assert.equal((await gate.handle(req(token,OA,'/api/admin/clients/'+CA))).status,200);
    assert.equal((await gate.handle(req(token,OA,'/api/admin/clients/'+CB))).status,404);
  });
  await pass('token-rejected-before-db-transport',async()=>{
    const before=requests;
    const gate=createR316Gateway({...cfg,db:adapter()});
    assert.equal((await gate.handle(req('1234'))).status,401);
    assert.equal(requests,before);
  });
  await pass('staff-tenant-must-match',async()=>{
    const gate=createR316Gateway({...cfg,db:adapter()});
    assert.equal((await gate.handle(req(await mint(B),OA))).status,403);
    assert.equal((await gate.handle(req(await mint(B),OB))).status,200);
  });
  await pass('disabled-office-blocked',async()=>{
    const gate=createR316Gateway({...cfg,db:adapter()});
    assert.equal((await gate.handle(req(token,OC))).status,403);
  });
  for(const [name,field,value]of [
    ['invalid-host','restUrl','http://db.invalid.test/rest/v1'],
    ['wrong-rest-path','restUrl','https://db.invalid.test/'],
    ['injected-credentials','restUrl','https://user:pass@db.invalid.test/rest/v1'],
    ['injected-query','restUrl',REST+'?a=b'],
    ['wrong-key','publishableKey','1234'],
    ['legacy-service-role-token','publishableKey','eyJhbGciOiJIUzI1NiJ9.test.token'],
    ['secret-key','publishableKey','sb_secret_should_never_be_used'],
    ['missing-token','userJwt',''],
    ['bad-token','userJwt','1234'],
    ['missing-fetch','transport',null],
  ])await denied(name,async()=>adapter(mockTransport(),{[field]:value}));
  for(const [name,fn]of [
    ['invalid-office-id',()=>adapter().getOffice('office-a')],
    ['invalid-client-id',()=>adapter().getClient(OA,'client-a')],
    ['invalid-staff-sub',()=>adapter().findStaffMemberships('admin',OA)],
    ['invalid-staff-office',()=>adapter().findStaffMemberships(A,'office-a')],
    ['invalid-list-office',()=>adapter().listClients('foo')],
  ])await denied(name,fn);
  for(const [name,response]of [
    ['postgrest-permission-denied',()=>okResponse({message:'RLS'},403)],
    ['postgrest-500',()=>okResponse({message:'DB_DOWN'},500)],
    ['postgrest-malformed-json',()=>new Response('not json',{status:200})],
    ['postgrest-unexpected-object',()=>okResponse({id:OA})],
    ['postgrest-nonobject-row',()=>okResponse([null])],
    ['postgrest-duplicate-offices',()=>okResponse([offices[0],offices[0]])],
    ['postgrest-oversized',()=>new Response('[]',{status:200,headers:{'content-length':'9999999'}})],
    ['postgrest-204',()=>new Response(null,{status:204})]
  ])await denied(name,()=>adapter(mockTransport({forceResponse:response})).getOffice(OA));
  await pass('duplicate-client-rejected',async()=>{
    await assert.rejects(()=>adapter(mockTransport({forceResponse:u=>u.pathname.endsWith('taxacc_clients')?okResponse([clients[0],clients[0]]):okResponse([])})).getClient(OA,CA));
  });
  await pass('transport-exception-gateway-fails-closed',async()=>{
    const gate=createR316Gateway({...cfg,db:adapter(async()=>{throw Error('DB_NETWORK_DOWN')})});
    const r=await gate.handle(req());assert.equal(r.status,503);
    assert.equal((await r.json()).error,'SERVICE_UNAVAILABLE');
  });
  await pass('transport-cross-office-contamination-denied',async()=>{
    const gate=createR316Gateway({...cfg,db:adapter(mockTransport({forceResponse:u=>{
      const t=u.pathname.split('/').at(-1);
      if(t==='taxacc_offices')return okResponse([offices[0]]);
      if(t==='taxacc_staff')return okResponse([staff[0]]);
      if(t==='taxacc_clients')return okResponse([clients[0],clients[1]]);
      throw Error('UNEXPECTED_TABLE');
    }}))});
    assert.equal((await gate.handle(req())).status,503);
  });
  // A bounded matrix directly exercises the R316 executable module + R317 PostgREST adapter.
  const paths=['/api/admin/dashboard','/api/admin/clients','/api/admin/clients/'+CA,'/api/admin/clients/'+CB,'/api/admin/documents/'+CA+'/signed-url'];
  const methods=['GET','POST','PATCH','DELETE'];
  const subjects=[A,B,C],officesToTest=[OA,OB,OC];
  const signedTokens={};for(const sub of subjects)signedTokens[sub]=await mint(sub);
  let matrix=0,allowed=0,deniedCount=0;
  const gate=createR316Gateway({...cfg,db:adapter()});
  for(const method of methods)for(const path of paths)for(const sub of subjects)for(const office of officesToTest){
    const r=await gate.handle(req(signedTokens[sub],office,path,method));
    const actual=r.status===200;
    const matchingStaff=staff.find(x=>x.auth_user_id===sub&&x.office_id===office);
    const enabled=offices.find(x=>x.id===office)?.is_active===true;
    const matchedClient=clients.find(x=>path==='/api/admin/clients/'+x.id&&x.office_id===office);
    const canAccess=!!matchingStaff&&(!matchedClient||matchedClient.assigned_staff_id===matchingStaff.id||matchingStaff.can_view_all_clients===true);
    const basic=path==='/api/admin/dashboard'||path==='/api/admin/clients';
    const expected=method==='GET'&&enabled&&!!matchingStaff&&(basic||!!matchedClient&&canAccess);
    assert.equal(actual,expected,JSON.stringify({method,path,sub,office,status:r.status}));
    if(actual)allowed++;else deniedCount++;
    matrix++;
  }
  assert.equal(matrix,180);assert.equal(networkAttempts,0);
  const checks=passes+matrix;
  console.log(JSON.stringify({suite:'DPRO_TAX_R317_POSTGREST_SCOPED_ADAPTER_ISOLATED',checks,named_checks:passes,matrix_checks:matrix,allowed,denied:deniedCount,mock_postgrest_requests:requests,external_egress:networkAttempts,actual_r316_module_imported:true,actual_r317_adapter_imported:true,only_synthetic_jwt:true,real_supabase_rls_verified:false,real_db_connection:false,real_worker_deployed:false,commercial_release:'HOLD'}));
}
main().catch(e=>{console.error('R317_FAIL',e.stack||e);process.exitCode=1});
