(() => {
 'use strict';
 const ROUTES={"dashboard":"R117_DEMO_owner.html?demo=1","clients":"R117_DEMO_owner.html?demo=1&view=clients","ipad":"R117_DEMO_owner-ipad.html?demo=1","member":"R117_DEMO_member.html?demo=1","booking":"R117_DEMO_index.html?demo=1&view=booking","inquiry":"R117_DEMO_index.html?demo=1&view=inquiry","systemcheck":"R117_DEMO_system-check.html?demo=1"};
const DEFAULTS={"R117_DEMO_index.html":"booking","R117_DEMO_owner.html":"dashboard","R117_DEMO_member.html":"member","R117_DEMO_owner-ipad.html":"ipad","R117_DEMO_system-check.html":"systemcheck"};
const basename=()=>location.pathname.split('/').pop();
const permitted=()=>new URLSearchParams(location.search).get('demo')==='1';
const parseRoute=()=>{
  const file=basename(); const qs=new URLSearchParams(location.search);
  if(!Object.hasOwn(DEFAULTS,file))return 'booking';
  const v=qs.get('view');
  if(file==='R117_DEMO_owner.html'&&v==='clients')return 'clients';
  if(file==='R117_DEMO_index.html'&&v==='inquiry')return 'inquiry';
  return DEFAULTS[file];
};
if(!permitted()){
  const main=document.getElementById('main');
  main.innerHTML='<section class="panel blocked"><h1>デモ専用の確認画面です</h1><p>この画面はデモ専用です。URLに demo=1 が指定されていないため、処理を開始しません。</p><a class="btn" href="R117_DEMO_index.html?demo=1">安全な架空デモを開く</a></section>';
  document.querySelector('#navigation').hidden=true;
  document.querySelector('#reset-demo').hidden=true;
  return;
}

 const engine=window.DPRO_TAX_DEMO_ENGINE;
 if(!engine||typeof engine.createDemoSession!=='function'){document.getElementById('main').textContent='安全なデモエンジンを読み込めませんでした。';return;}
 const session=engine.createDemoSession();
 const get=(s)=>document.querySelector(s);
 const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={view:parseRoute(),auth:false,bookingDate:'',message:null};
 const admin=(path,opt={})=>session.request(path,{adminKey:'1234',...opt});
 const local=(path,opt={})=>session.request(path,opt);
 const meta={systemcheck:['システム確認','この架空デモはサーバーに接続しません。'],dashboard:['管理ダッシュボード','架空の事務所・顧問先・案件を操作します。'],clients:['顧問先管理','架空の顧問先を登録・確認できます。'],ipad:['iPad 現場操作','実業務データに触れずタスク完了を試せます。'],member:['顧問先マイページ','架空の顧問先の表示のみを体験します。'],booking:['WEB面談予約','予約枠は30分固定。予約は実際には成立しません。'],inquiry:['お問い合わせ','送信されず、このタブ内だけに記録されます。']};
 const secured=['dashboard','clients','ipad','systemcheck'];
 const statusJP={todo:'未着手',in_progress:'対応中',new:'新着',requested:'受付',completed:'完了',cancelled:'取消',resolved:'解決済み',active:'契約中'};
 const label=(status)=>statusJP[status]||status; 
 function message(s='',error=false){state.message=s?{s,error}:null;}
 function head(view){const [name,desc]=meta[view];return `<div class="top"><div><h1>${name}</h1><p class="sub">${desc}</p></div><span class="pill">架空データのみ</span></div>`;}
 function rows(items,fn){return items.length?`<div class="rows">${items.map(fn).join('')}</div>`:'<div class="empty">現在表示する架空データはありません。</div>';}
 function banner(){return '<p class="warning">実際の氏名・電話番号・メールアドレス・税務資料は入力しないでください。保存・送信されません。画面を再読み込みすると初期状態に戻ります。</p>';}
 function render(){
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false'));
  get('#login-state').textContent=state.auth?'管理デモログイン中':'体験モード';
  const root=get('#main');let html='';
  if(state.message)html=`<div role="status" class="msg ${state.message.error?'error':''}">${esc(state.message.s)}</div>`;
  if(secured.includes(state.view)&&!state.auth){
   root.innerHTML=html+`<section class="panel login">${head(state.view)}<h2>管理画面の体験コード</h2><p class="sub">公開デモの操作に使うコードは <strong>1234</strong> です。</p><form id="auth-form"><div class="field"><label for="pin">体験コード</label><input type="password" id="pin" inputmode="numeric" autocomplete="off" maxlength="20" required></div><button class="btn" type="submit">体験デモを開く</button></form></section>`;
   return;
  }
  const snap=session.snapshot();
  if(state.view==='dashboard'){
   const data=admin('/api/admin/dashboard');
   html+=head('dashboard')+`<div class="cards"><div class="stat"><span>顧問先</span><strong id="count-clients">${data.counts.clients}</strong></div><div class="stat"><span>進行中案件</span><strong>${data.counts.cases}</strong></div><div class="stat"><span>タスク</span><strong>${data.counts.tasks}</strong></div><div class="stat"><span>お問い合わせ</span><strong>${data.open_inquiries.length}</strong></div></div><div class="cols"><section class="panel"><h2>案件一覧</h2>${rows(snap.cases,c=>`<div class="item"><b>${esc(c.title)}</b><span>${esc(label(c.status))}</span></div>`)}</section><section class="panel"><h2>今日のタスク</h2>${rows(snap.tasks,t=>`<div class="item"><b>${esc(t.title)}</b><span>${esc(label(t.status))}</span></div>`)}</section></div>`+banner();
  }
  if(state.view==='systemcheck'){
   const data=admin('/api/admin/system-check');
   html+=head('systemcheck')+`<section class="panel"><h2>完全架空デモの動作条件</h2><p class="warning">ここは実際のCloudflare・Supabase・LINEの稼働確認画面ではありません。架空データエンジンの状態のみ表示します。</p><div class="rows"><div class="item"><b>データ保存先</b><span>このタブのメモリ内</span></div><div class="item"><b>共有DB／Storage／LINE</b><span>未接続</span></div><div class="item"><b>外部API通信</b><span>ブラウザーCSPで禁止</span></div><div class="item"><b>実業務・本番確認</b><span>未検証・操作不可</span></div><div class="item"><b>デモエンジン</b><span>${esc(data.mode)}</span></div></div></section>`;
  }
  if(state.view==='clients'){
   html+=head('clients')+`<div class="cols"><section class="panel"><h2>顧問先一覧</h2>${rows(snap.clients,c=>`<div class="item"><div><b>${esc(c.legal_name)}</b><div class="help">${esc(c.client_code)}</div></div><span class="tag">架空</span></div>`)}</section><section class="panel"><h2>架空の顧問先を登録</h2><form id="client-form"><div class="field"><label for="client-name">サンプル事務所名</label><input id="client-name" maxlength="80" value="サンプル企業Ｃ（架空）" required></div><button class="btn" type="submit">架空の顧問先を登録</button></form><p class="help">このブラウザータブ内でだけ件数が増えます。</p></section></div>`+banner();
  }
  if(state.view==='ipad'){
   const data=admin('/api/demo/ipad');
   html+=head('ipad')+`<div class="cols"><section class="panel"><h2>タスク確認・完了</h2>${rows(data.tasks,t=>`<div class="item"><div><b>${esc(t.title)}</b><div class="help">状態：${esc(label(t.status))}</div></div><button type="button" class="btn alt" data-task-id="${esc(t.id)}" ${t.status==='completed'?'disabled':''}>完了</button></div>`)}</section><section class="panel"><h2>予約・問い合わせの確認</h2><div class="stat"><span>体験予約数</span><strong>${data.appointments.length}</strong></div><div class="stat"><span>体験お問い合わせ数</span><strong>${data.inquiries.length}</strong></div><p class="help">実LINE送信・添付ファイル確認・月次最終承認はできません。</p></section></div>`;
  }
  if(state.view==='member'){
   const data=local('/api/demo/member-preview');
   html+=head('member')+`<section class="panel"><h2>顧問先：${esc(data.client.legal_name)}</h2><p class="help">LINEの本人認証を代行しない、表示専用プレビューです。</p><div class="cols"><div><h2>現在の案件</h2>${rows(data.cases,c=>`<div class="item"><b>${esc(c.title)}</b><span>${esc(label(c.status))}</span></div>`)}</div><div><h2>資料依頼（見本）</h2>${rows(data.document_requests,r=>`<div class="item"><b>${esc(r.title)}</b><span>${esc(label(r.status))}</span></div>`)}</div></div><p class="warning">ファイルの閲覧・アップロード、本人情報の変更、実LINE連携は無効です。</p></section>`;
  }
  if(state.view==='booking'){
   const dates=local('/api/demo/dates').dates;
   if(!dates.includes(state.bookingDate))state.bookingDate=dates[0]||'';
   const slots=local('/api/demo/slots?date='+encodeURIComponent(state.bookingDate)).slots;
   html+=head('booking')+`<div class="cols"><section class="panel"><h2>面談日時を選ぶ</h2><form id="booking-form"><div class="field"><label for="booking-date">日付（営業日）</label><select id="booking-date">${dates.map(d=>`<option value="${esc(d)}" ${d===state.bookingDate?'selected':''}>${esc(d)}</option>`).join('')}</select></div><div class="field"><label for="booking-time">空き枠（30分）</label><select id="booking-time">${slots.map(s=>`<option value="${esc(s.time)}">${esc(s.time)}〜</option>`).join('')}</select></div><div class="field"><label for="booking-purpose">架空の相談内容</label><select id="booking-purpose"><option>税務相談（架空）</option><option>経理の相談（架空）</option><option>事業承継の相談（架空）</option></select></div><button class="btn" type="submit" ${slots.length?'':'disabled'}>架空の予約を登録</button></form><p class="help">土日、過去時刻、予約済みの枠は選べません。</p></section><section class="panel"><h2>このタブの体験予約</h2>${rows(snap.appointments,a=>`<div class="item"><div><b>${esc((a.requested_start_at||'').slice(0,16).replace('T',' '))}</b><div class="help">${esc(a.purpose||'面談（架空）')}</div></div><span class="tag">${esc(label(a.status))}</span></div>`)}</section></div>`+banner();
  }
  if(state.view==='inquiry'){
   html+=head('inquiry')+`<div class="cols"><section class="panel"><h2>架空のお問い合わせ</h2><form id="inquiry-form"><div class="field"><label for="inquiry-type">相談区分</label><select id="inquiry-type"><option value="tax_consultation">税務</option><option value="accounting">会計</option><option value="other">その他</option></select></div><div class="field"><label for="inquiry-subject">件名</label><input id="inquiry-subject" maxlength="80" value="架空の税務相談" required></div><div class="field"><label for="inquiry-body">問い合わせ内容（架空）</label><textarea id="inquiry-body" maxlength="360" required>架空のサンプル相談です。</textarea></div><button class="btn" type="submit">架空の問い合わせを登録</button></form></section><section class="panel"><h2>このタブの問い合わせ履歴</h2>${rows(snap.inquiries,i=>`<div class="item"><div><b>${esc(i.subject)}</b><p class="help">${esc(i.body)}</p></div><span class="tag">${esc(label(i.status))}</span></div>`)}</section></div>`+banner();
  }
  root.innerHTML=html;
 }
 get('#navigation').addEventListener('click',e=>{
  const a=e.target.closest('a[data-view]'); if(!a)return;
  // Same-origin, closed route map: no arbitrary URLs or API integrations.
  const view=a.dataset.view;
  if(!(view in ROUTES)||a.getAttribute('href')!==ROUTES[view])return;
  e.preventDefault();history.pushState({r117:true},'',ROUTES[view]);
  state.view=view;message();render();
 });
 window.addEventListener('popstate',()=>{
  if(!permitted()){location.reload();return;}
  state.view=parseRoute();message();render();
 });
 get('#reset-demo').addEventListener('click',()=>location.reload());
 get('#main').addEventListener('change',e=>{if(e.target.id==='booking-date'){state.bookingDate=e.target.value;message();render()}});
 get('#main').addEventListener('click',e=>{const b=e.target.closest('[data-task-id]');if(!b)return;try{admin('/api/demo/ipad/tasks/'+b.dataset.taskId,{method:'PATCH',body:{status:'completed'}});message('タスク完了を架空データへ反映しました。')}catch(err){message(err.message,true)}render()});
 get('#main').addEventListener('submit',e=>{
  e.preventDefault();try {
   switch(e.target.id){
    case 'auth-form': {if(get('#pin').value!=='1234')throw Error('コードが違います。公開デモの体験コードを入力してください。');state.auth=true;message('架空データ専用の管理デモを開きました。');break;}
    case 'client-form':admin('/api/admin/clients',{method:'POST',body:{legal_name:get('#client-name').value.trim(),business_type:'corporation'}});message('架空の顧問先を登録しました。');break;
    case 'booking-form':local('/api/demo/booking',{method:'POST',body:{date:get('#booking-date').value,time:get('#booking-time').value,purpose:get('#booking-purpose').value}});message('架空の予約を登録しました。実際の予約は行われません。');break;
    case 'inquiry-form':local('/api/demo/inquiry',{method:'POST',body:{category:get('#inquiry-type').value,subject:get('#inquiry-subject').value,body:get('#inquiry-body').value}});message('架空のお問い合わせを登録しました。送信は行われません。');break;
    default:throw Error('このフォームはデモでは利用できません。');
   }
  }catch(err){message(err.message||String(err),true)}render();
 });
 render();
})();
