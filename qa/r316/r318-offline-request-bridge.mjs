/**
 * DPRO TAX R318 — OFFLINE-ONLY per-request gateway / PostgREST binding.
 * Not for production deployment. The real Supabase RLS policies have NOT been
 * verified as ready, and no live JWT trust, database, Worker, or LINE is used.
 *
 * Guarantees in this offline model:
 * - Request Authorization is the ONLY token supplied to the DB adapter.
 * - A new adapter + gateway are constructed for EVERY incoming request.
 * - R316 cryptographically verifies the bearer before DB transport is invoked.
 * - Only synthetic *.invalid endpoints can be configured (no live DB access).
 * - No fallback to legacy handler or demo code 1234.
 */
import {createR316Gateway} from './read-only-gateway.mjs';
import {createR317ScopedPostgrestAdapter} from './r317-scoped-postgrest-adapter.mjs';
const SYNTHETIC_HOST=/(?:^|\.)[a-z0-9-]+\.invalid$/i;
const TOKEN=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;
const JWT_LIMIT=12000;
function reject(code,status){return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function offlineUrl(raw,path){
  let u;try{u=new URL(raw)}catch{throw Error('OFFLINE_ENDPOINT_REQUIRED')}
  if(u.protocol!=='https:'||u.pathname!==path||u.port||u.username||u.password||u.search||u.hash||!SYNTHETIC_HOST.test(u.hostname))throw Error('OFFLINE_ENDPOINT_REQUIRED');
  return u.href;
}
export function createR318OfflineRequestBridge({trustedPublicKeys,issuer,audience='authenticated',restUrl,publishableKey,transport,now}={}){
  const safeIssuer=offlineUrl(issuer,'/auth/v1');
  const safeRestUrl=offlineUrl(restUrl,'/rest/v1');
  if(typeof transport!=='function')throw Error('MOCK_TRANSPORT_REQUIRED');
  if(transport===globalThis.fetch)throw Error('LIVE_TRANSPORT_FORBIDDEN');
  if(typeof publishableKey!=='string'||!/^sb_publishable_(?:TEST|QA|SYNTHETIC)_[A-Za-z0-9_-]{5,}$/.test(publishableKey))throw Error('SYNTHETIC_KEY_REQUIRED');
  if(!trustedPublicKeys||!Object.keys(trustedPublicKeys).length)throw Error('SYNTHETIC_KEYS_REQUIRED');
  return Object.freeze({
    async handle(request){
      try{
        if(!(request instanceof Request))return reject('INVALID_REQUEST',400);
        const u=new URL(request.url);
        if(u.protocol!=='https:'||!SYNTHETIC_HOST.test(u.hostname)||u.port||u.username||u.password)return reject('OFFLINE_REQUEST_ONLY',403);
        // Do not permit a second credential, trusted-sub header, LINE ID or demo admin
        // to choose the DB JWT. R316 ignores these for role elevation.
        const raw=request.headers.get('authorization')||'';
        const match=TOKEN.exec(raw);
        if(!match||raw.length>JWT_LIMIT+7)return reject('UNAUTHORIZED',401);
        const userJwt=match[1];
        const db=createR317ScopedPostgrestAdapter({
          restUrl:safeRestUrl,publishableKey,userJwt,
          transport:async (url,options)=>{
            // Verify no adapter path can redirect to a different host or use
            // a different credential. R317 additionally fixes paths/columns.
            const to=new URL(url);
            if(to.origin!==new URL(safeRestUrl).origin||!to.pathname.startsWith('/rest/v1/taxacc_')||
               options?.method!=='GET'||options?.headers?.authorization!=='Bearer '+userJwt||
               options?.headers?.apikey!==publishableKey||options?.credentials!=='omit'||
               options?.redirect!=='error')throw Error('BRIDGE_TRANSPORT_DENIED');
            return transport(url,options);
          },
        });
        // Verified subject and staff authorization happen in R316 *before*
        // the first call to the request-local DB adapter.
        const gateway=createR316Gateway({trustedPublicKeys,issuer:safeIssuer,audience,db,now});
        return await gateway.handle(request);
      }catch{return reject('SERVICE_UNAVAILABLE',503)}
    }
  });
}
