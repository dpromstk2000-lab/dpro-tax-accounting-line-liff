/* DPRO TAX R113 OFFLINE MULTISCREEN SESSION DEMO ENGINE. No HTTP, DB, Storage, cookies or LINE. */
(function(root){
  'use strict';
  const OFFICE_ID='10000000-1000-4000-8000-000000000001';
  const OFFICE_CODE='dpro_taxacc_demo';
  const KINDS={
    clients:{prefix:'TXC',noun:'顧問先',createFields:['legal_name','business_type','representative_name'],editFields:['legal_name','status']},
    cases:{prefix:'CASE',noun:'案件',createFields:['title','client_id','case_type','priority'],editFields:['title','status','priority','progress_percent']},
    tasks:{prefix:'TASK',noun:'タスク',createFields:['title','client_id','case_id','priority','due_at'],editFields:['title','status','priority']},
    appointments:{prefix:'RES',noun:'予約',createFields:['requester_name','requested_start_at','duration_minutes','appointment_channel','client_id'],editFields:['status']},
    inquiries:{prefix:'INQ',noun:'お問合せ',createFields:['subject','body','category'],editFields:['status']},
  };
  const FAKE={
    office:{id:OFFICE_ID,office_code:OFFICE_CODE,office_name:'DPRO TAX 体験デモ事務所',subtitle:'架空データでの体験専用',is_demo:true,is_active:true,production_guard:true,booking_open_days:90,security_notice:'これは架空データの体験版です。実際の個人情報・書類を入力しないでください。'},
    clients:[{id:'20000000-2000-4000-8000-000000000001',office_id:OFFICE_ID,client_code:'TXC-DEMO-001',legal_name:'サンプル法人Ａ（架空）',business_type:'corporation',status:'active',is_demo:true},{id:'20000000-2000-4000-8000-000000000002',office_id:OFFICE_ID,client_code:'TXC-DEMO-002',legal_name:'サンプル商店Ｂ（架空）',business_type:'sole_proprietor',status:'active',is_demo:true}],
    cases:[{id:'30000000-3000-4000-8000-000000000001',office_id:OFFICE_ID,client_id:'20000000-2000-4000-8000-000000000001',case_code:'CASE-DEMO-001',title:'月次資料確認（架空）',case_type:'monthly_documents',status:'in_progress',priority:'normal',progress_percent:60,is_demo:true}],
    tasks:[{id:'40000000-4000-4000-8000-000000000001',office_id:OFFICE_ID,client_id:'20000000-2000-4000-8000-000000000001',task_code:'TASK-DEMO-001',title:'必要書類を確認（架空）',priority:'normal',status:'todo',is_demo:true}],
    appointments:[{id:'50000000-5000-4000-8000-000000000001',office_id:OFFICE_ID,appointment_code:'RES-DEMO-001',requester_name:'架空の予約者',status:'requested',duration_minutes:30,requested_start_at:'2027-01-01T00:00:00+09:00',appointment_channel:'online',is_demo:true}],
    inquiries:[{id:'60000000-6000-4000-8000-000000000001',office_id:OFFICE_ID,inquiry_code:'INQ-DEMO-001',category:'tax_consultation',subject:'サンプルの相談（架空）',body:'架空のデモ用文章です。',status:'new',priority:'normal',is_demo:true}],
    staff:[{id:'70000000-7000-4000-8000-000000000001',office_id:OFFICE_ID,staff_code:'TAX-ST-DEMO',display_name:'サンプル担当',role:'staff',is_active:true}],
    document_requests:[{id:'80000000-8000-4000-8000-000000000001',office_id:OFFICE_ID,request_code:'REQ-DEMO-001',client_id:'20000000-2000-4000-8000-000000000001',title:'架空の月次資料（見本）',request_category:'monthly',status:'not_notified',is_demo:true,is_visible_to_client:false,items:[]}],
    services:[{id:'90000000-9000-4000-8000-000000000001',service_name:'税務相談（架空）',duration_minutes:30,channel_options:['online','phone','in_person'],is_public:true}],
  };
  const clone=value=>JSON.parse(JSON.stringify(value));
  function fail(status,code,message){const e=new Error(message);e.status=status;e.code=code;throw e;}
  function createDemoSession(opts={}){
    const store=clone(FAKE);let serial=0;
    const audit=[];
    const autoId=()=>{serial++;return `b0000000-0000-4000-8000-${String(serial).padStart(12,'0')}`;};
    const clean=(body)=>{
      if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'INVALID_BODY','入力形式が正しくありません');
      if('office_id' in body||'office_code' in body||('is_demo' in body&&body.is_demo!==true))fail(403,'DEMO_SCOPE_DENIED','公開デモ事務所を変更できません');
      if(Object.keys(body).some(k=>/password|secret|mynumber|マイナンバー|個人番号|line_user_id|storage_path/i.test(k)))fail(400,'REAL_DATA_PROHIBITED','実データを入力しないでください');
      return body;
    };
    const one=(type,id)=>{const v=store[type].find(x=>x.id===id);if(!v)fail(404,'RECORD_NOT_FOUND','該当する架空データはありません');return v;};
    const locked=()=>fail(403,'DEMO_SIDE_EFFECT_BLOCKED','この操作は架空体験では無効です');
    function readCollection(type,search){
      const cfg=KINDS[type];if(!cfg)return locked();
      const result=store[type].filter(x=>!search.get('client_id')||x.client_id===search.get('client_id'));
      return {ok:true,[type]:clone(result)};
    }
    function mutate(type,method,id,body){
      const cfg=KINDS[type];if(!cfg)return locked();
      const input=clean(body||{});
      if(method==='POST'){
        const data={id:autoId(),office_id:OFFICE_ID,is_demo:true,created_at:new Date().toISOString()};
        for(const key of cfg.createFields)if(key in input)data[key]=String(input[key]).slice(0,220);
        if(!data[cfg.createFields[0]])fail(400,'REQUIRED_FIELD','必須項目を入力してください');
        if(data.client_id&&!store.clients.some(c=>c.id===data.client_id))fail(403,'CLIENT_ACCESS_DENIED','架空顧問先以外へ紐付けできません');
        // R121: synthetic-only referential integrity; reject orphan cases and cross-client task links.
        if(type==='cases'&&!data.client_id)fail(400,'CASE_CLIENT_REQUIRED','案件の顧問先を選択してください');
        if(type==='tasks'&&data.case_id){
          const parentCase=store.cases.find(c=>c.id===data.case_id);
          if(!parentCase||!data.client_id||parentCase.client_id!==data.client_id)
            fail(403,'CASE_CLIENT_SCOPE_DENIED','別の顧問先または存在しない案件へ紐付けできません');
        }
        data[{clients:'client_code',cases:'case_code',tasks:'task_code',appointments:'appointment_code',inquiries:'inquiry_code'}[type]]=`${cfg.prefix}-DEMO-${String(serial+2).padStart(3,'0')}`;
        data.status=data.status||'received';
        store[type].push(data);audit.push({type,method,id:data.id});
        return {ok:true,[type==='clients'?'client':type==='cases'?'case':type==='tasks'?'task':type==='appointments'?'appointment':'inquiry']:clone(data)};
      }
      const before=one(type,id);
      if(method==='PATCH'){
        const patch={};for(const k of cfg.editFields)if(k in input)patch[k]=String(input[k]).slice(0,220);
        if(!Object.keys(patch).length)fail(400,'NO_CHANGES','変更できる項目がありません');
        Object.assign(before,patch);audit.push({type,method,id});return {ok:true,record:clone(before)};
      }
      if(method==='DELETE'){
        if(type==='clients')fail(403,'DEMO_CLIENT_DELETE_DENIED','公開デモの顧問先削除は禁止');
        // Soft disable only in this tab's copy; no DB operations.
        before.status='cancelled';audit.push({type,method,id});return {ok:true,record:clone(before)};
      }
      return locked();
    }
    function request(path,options={}){
      const method=String(options.method||'GET').toUpperCase();
      const url=new URL(String(path),'https://only-local.invalid');
      if(url.origin!=='https://only-local.invalid')return locked();
      const pathname=url.pathname;
      if(method==='GET'&&(pathname==='/api/health'||pathname==='/'))return {ok:true,service:'DPRO TAX Synthetic Local Demo',version:'R112-LOCAL-ONLY'};
      if(method==='GET'&&pathname==='/api/public/office')return {ok:true,office:clone(store.office),services:clone(store.services)};
      if(method==='GET'&&pathname==='/api/public/slots')return {ok:true,slots:[]}; // date-bound booking UI requires R113 E2E


      // R113: only safe in-memory public interactions. No customer PII required.
      if(pathname.startsWith('/api/demo/')){
        const now=()=>opts.now?new Date(opts.now):new Date();
        const jstToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
        const businessDays=()=>{
          const today=jstToday(), out=[];
          for(let i=0;i<21;i++){
            const base=Date.parse(`${today}T00:00:00+09:00`)+i*86400000;
            const day=new Date(base+9*3600000), week=day.getUTCDay();
            if(week===0||week===6)continue;
            out.push(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(base)));
          }
          return out;
        };
        const slotList=(date)=>{
          if(!businessDays().includes(date))return [];
          const slots=[];
          for(let h=9;h<17;h++)for(let m=0;m<60;m+=30){
            const hh=String(h).padStart(2,'0'),mm=String(m).padStart(2,'0');
            const ts=Date.parse(`${date}T${hh}:${mm}:00+09:00`);
            if(ts<=now().getTime())continue;
            if(store.appointments.some(a=>a.requested_start_at&&Date.parse(a.requested_start_at)===ts&&a.status!=='cancelled'))continue;
            slots.push({date,time:`${hh}:${mm}`,duration_minutes:30});
          }
          return slots;
        };
        if(method==='GET'&&pathname==='/api/demo/dates')return {ok:true,dates:businessDays()};
        if(method==='GET'&&pathname==='/api/demo/slots')return {ok:true,slots:slotList(url.searchParams.get('date')||'')};
        if(method==='GET'&&pathname==='/api/demo/member-preview')return {ok:true,mode:'fictional_preview',client:clone(store.clients[0]),cases:clone(store.cases),appointments:clone(store.appointments),document_requests:clone(store.document_requests),documents:[],uploads_disabled:true,line_verified:false};
        if(method==='POST'&&pathname==='/api/demo/booking'){
          const input=clean(options.body||{});
          const date=String(input.date||''),time=String(input.time||'');
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:(00|30)$/.test(time)||!slotList(date).some(x=>x.time===time))fail(400,'BOOKING_SLOT_UNAVAILABLE','選択した架空の予約枠は使えません');
          if(input.client_id||input.line_user_id||input.phone||input.email||input.office_id)fail(403,'DEMO_PERSONAL_DATA_FORBIDDEN','デモでは連絡先や識別情報を受け取りません');
          const label=String(input.purpose||'架空の相談').trim().slice(0,80);
          if(!label)fail(400,'PURPOSE_REQUIRED','相談種別を選択してください');
          const item={id:autoId(),office_id:OFFICE_ID,is_demo:true,appointment_code:`RES-DEMO-${String(serial).padStart(3,'0')}`,requester_name:'架空の予約者',requested_start_at:`${date}T${time}:00+09:00`,duration_minutes:30,appointment_channel:'online',purpose:label,status:'requested'};
          store.appointments.push(item);audit.push({type:'appointments',method,id:item.id});
          return {ok:true,appointment:clone(item),notice:'ブラウザー内でのみ反映しました。実際の予約ではありません。'};
        }
        if(method==='POST'&&pathname==='/api/demo/inquiry'){
          const input=clean(options.body||{});
          if(input.phone||input.email||input.client_id||input.line_user_id)fail(403,'DEMO_PERSONAL_DATA_FORBIDDEN','デモでは連絡先や識別情報を受け取りません');
          const type=String(input.category||'tax_consultation');
          if(!['tax_consultation','accounting','other'].includes(type))fail(400,'CATEGORY_NOT_ALLOWED','相談区分が不正です');
          const subject=String(input.subject||'').trim();
          if(!subject||subject.length>80)fail(400,'SUBJECT_INVALID','件名を1〜80文字で入力してください');
          const body=String(input.body||'').trim();
          if(!body||body.length>360)fail(400,'BODY_INVALID','内容を1〜360文字で入力してください');
          const item={id:autoId(),office_id:OFFICE_ID,is_demo:true,inquiry_code:`INQ-DEMO-${String(serial).padStart(3,'0')}`,category:type,subject,body,status:'new',priority:'normal'};
          store.inquiries.push(item);audit.push({type:'inquiries',method,id:item.id});
          return {ok:true,inquiry:clone(item),notice:'実際の送信は行われません。'};
        }
        if(method==='GET'&&pathname==='/api/demo/ipad'){
          if(options.adminKey!=='1234')fail(401,'DEMO_ADMIN_KEY_REQUIRED','体験コードが必要です');
          return {ok:true,tasks:clone(store.tasks),appointments:clone(store.appointments),inquiries:clone(store.inquiries),documents:[],approval_enabled:false};
        }
        const ipadTask=pathname.match(/^\/api\/demo\/ipad\/tasks\/([0-9a-f-]{36})$/i);
        if(method==='PATCH'&&ipadTask){
          if(options.adminKey!=='1234')fail(401,'DEMO_ADMIN_KEY_REQUIRED','体験コードが必要です');
          const input=clean(options.body||{});
          if(input.status!=='completed')fail(403,'DEMO_IPAD_ACTION_LIMITED','iPadデモはタスク完了操作のみ許可');
          const t=one('tasks',ipadTask[1]);t.status='completed';audit.push({type:'tasks',method,id:t.id});return {ok:true,task:clone(t)};
        }
        return locked();
      }
      if(pathname.startsWith('/api/member/')||pathname==='/api/member')return locked();
      if(method==='GET'&&pathname==='/api/demo/member-preview')return {ok:true,mode:'synthetic_member_preview',client:clone(store.clients[0]),cases:clone(store.cases),documents:[],storage_enabled:false,line_verified:false};
      if(!pathname.startsWith('/api/admin/'))return locked();
      if(options.adminKey!=='1234')fail(401,'DEMO_ADMIN_KEY_REQUIRED','体験コードを入力してください');
      if(method==='GET'&&pathname==='/api/admin/dashboard'){
        return {ok:true,office:{id:OFFICE_ID,office_code:OFFICE_CODE,office_name:store.office.office_name},counts:{clients:store.clients.length,cases:store.cases.length,tasks:store.tasks.length},urgent_cases:clone(store.cases.filter(c=>['high','urgent'].includes(c.priority))),due_tasks:clone(store.tasks.filter(t=>!['completed','cancelled'].includes(t.status))),documents_to_review:[],active_appointments:clone(store.appointments),open_inquiries:clone(store.inquiries.filter(x=>!['resolved','closed'].includes(x.status))),ipad_actions:{appointment_status_update:true,document_secure_view:false,document_review_start:false,inquiry_status_update:true,task_complete:true,document_final_approval_on_pc:false},generated_at:new Date().toISOString()};
      }
      if(method==='GET'&&pathname==='/api/admin/system-check')return {ok:true,mode:'local_synthetic_demo',database:{ok:false,synthetic:true},storage:{ok:false,disabled_for_demo:true},checks:{no_network:true,no_storage:true,no_line:true,session_isolated:true}};
      if(method==='GET'&&pathname==='/api/admin/settings')return {ok:true,office:clone(store.office),business_hours:[],closed_dates:[],services:clone(store.services)};
      if(method==='GET'&&pathname==='/api/admin/staff')return {ok:true,staff:clone(store.staff)};
      if(method==='GET'&&pathname==='/api/admin/documents')return {ok:true,documents:[]};
      if(method==='GET'&&pathname==='/api/admin/contacts')return {ok:true,contacts:[]};
      if(method==='GET'&&pathname==='/api/admin/message-templates')return {ok:true,templates:[]};
      if(method==='GET'&&pathname==='/api/admin/phone-normalize-check')return {ok:true,expected:'09011112201',results:[],synthetic:true};
      const clientDetail=pathname.match(/^\/api\/admin\/clients\/([0-9a-f-]{36})$/i);
      if(method==='GET'&&clientDetail){
        const c=one('clients',clientDetail[1]);
        return {ok:true,client:clone(c),contacts:[],links:[],cases:clone(store.cases.filter(x=>x.client_id===c.id)),tasks:clone(store.tasks.filter(x=>x.client_id===c.id)),document_requests:clone(store.document_requests.filter(x=>x.client_id===c.id)),documents:[],appointments:[],inquiries:[]};
      }

      if(method==='GET'&&pathname==='/api/admin/document-requests')return {ok:true,document_requests:clone(store.document_requests)};
      for(const type of Object.keys(KINDS)){
        const prefix='/api/admin/'+type;
        if(pathname===prefix){
          if(method==='GET')return readCollection(type,url.searchParams);
          if(method==='POST')return mutate(type,method,null,options.body);
        }
        if(pathname.startsWith(prefix+'/')){
          const id=pathname.slice(prefix.length+1);
          if(!/^[0-9a-f-]{36}$/.test(id))return locked();
          if(method==='GET')return {ok:true,record:clone(one(type,id))};
          if(method==='PATCH'||method==='DELETE')return mutate(type,method,id,options.body);
        }
      }
      return locked();
    }
    return Object.freeze({request,snapshot:()=>clone(store),audit:()=>clone(audit),mode:'SYNTHETIC_ONLY',session_id:opts.sessionId||'local-session'});
  }
  const api=Object.freeze({createDemoSession,version:'R113-SYNTHETIC-MULTISCREEN-ISOLATION'});
  root.DPRO_TAX_DEMO_ENGINE=api;
})(typeof window!=='undefined'?window:globalThis);
