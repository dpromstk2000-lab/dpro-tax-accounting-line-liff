/* DPRO TAX R113 OFFLINE MULTISCREEN SESSION DEMO ENGINE. No HTTP, DB, Storage, cookies or LINE. */
(function(root){
  'use strict';
  const OFFICE_ID='10000000-1000-4000-8000-000000000001';
  const OFFICE_CODE='dpro_taxacc_demo';

  // Demo-only Japanese public-holiday calendar. Separate from real office scheduling.
  // Standard rules for current legislation; equinoxes are approximate outside officially announced years.
  const DEMO_HOLIDAY_CACHE=new Map();
  function demoJapaneseHolidays(year){
    if(DEMO_HOLIDAY_CACHE.has(year))return DEMO_HOLIDAY_CACHE.get(year);
    const days=new Set();
    const pad=n=>String(n).padStart(2,'0');
    const key=(month,day)=>`${year}-${pad(month)}-${pad(day)}`;
    const fixed=[[1,1],[2,11],[2,23],[4,29],[5,3],[5,4],[5,5],[8,11],[11,3],[11,23]];
    for(const [m,d] of fixed)days.add(key(m,d));
    const nthMon=(month,n)=>1+(8-new Date(Date.UTC(year,month-1,1)).getUTCDay())%7+7*(n-1);
    for(const [m,n] of [[1,2],[7,3],[9,3],[10,2]])days.add(key(m,nthMon(m,n)));
    const spring=Math.floor(20.8431+0.242194*(year-1980)-Math.floor((year-1980)/4));
    const autumn=Math.floor(23.2488+0.242194*(year-1980)-Math.floor((year-1980)/4));
    days.add(key(3,spring));days.add(key(9,autumn));
    // Citizen's holiday between two statutory national holidays (e.g. 2026-09-22).
    const start=Date.UTC(year,0,1);
    for(let i=1;i<365;i++){
      const d=new Date(start+i*86400000).toISOString().slice(0,10);
      const before=new Date(start+(i-1)*86400000).toISOString().slice(0,10);
      const after=new Date(start+(i+1)*86400000).toISOString().slice(0,10);
      if(!days.has(d)&&days.has(before)&&days.has(after))days.add(d);
    }
    // Substitute weekday after a national holiday falling on Sunday.
    for(const d of [...days]){
      if(new Date(d+'T00:00:00Z').getUTCDay()!==0)continue;
      let next=Date.parse(d+'T00:00:00Z')+86400000;
      while(days.has(new Date(next).toISOString().slice(0,10)))next+=86400000;
      days.add(new Date(next).toISOString().slice(0,10));
    }
    DEMO_HOLIDAY_CACHE.set(year,days);return days;
  }
  function demoClosedDate(date){
    const mmdd=date.slice(5);
    return mmdd>='12-29'||mmdd<='01-03'||demoJapaneseHolidays(Number(date.slice(0,4))).has(date);
  }
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
    appointments:[{id:'50000000-5000-4000-8000-000000000001',office_id:OFFICE_ID,appointment_code:'RES-DEMO-001',client_id:'20000000-2000-4000-8000-000000000001',requester_name:'架空の予約者',status:'requested',duration_minutes:30,requested_start_at:null,appointment_channel:'online',is_demo:true}],
    inquiries:[{id:'60000000-6000-4000-8000-000000000001',office_id:OFFICE_ID,inquiry_code:'INQ-DEMO-001',category:'tax_consultation',subject:'サンプルの相談（架空）',body:'架空のデモ用文章です。',status:'new',priority:'normal',is_demo:true}],
    staff:[{id:'70000000-7000-4000-8000-000000000001',office_id:OFFICE_ID,staff_code:'TAX-ST-DEMO',display_name:'サンプル担当',role:'staff',is_active:true}],
    document_requests:[{id:'80000000-8000-4000-8000-000000000001',office_id:OFFICE_ID,request_code:'REQ-DEMO-001',client_id:'20000000-2000-4000-8000-000000000001',title:'架空の月次資料（見本）',request_category:'monthly',status:'not_notified',is_demo:true,is_visible_to_client:false,items:[]}],
    services:[{id:'90000000-9000-4000-8000-000000000001',service_name:'税務相談（架空）',duration_minutes:30,channel_options:['online','phone','in_person'],is_public:true}],
  };
  const clone=value=>JSON.parse(JSON.stringify(value));
  function fail(status,code,message){const e=new Error(message);e.status=status;e.code=code;throw e;}
  function createDemoSession(opts={}){
    const store=clone(FAKE);let serial=0;
    // R133: keep the sample booking in an actual upcoming weekday 30-minute slot.
    // No fixed midnight/new-year fixture; this is still synthetic in-memory data only.
    const displayDate = date => new Intl.DateTimeFormat('en-CA',
      {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    const day0 = Date.parse(`${displayDate(opts.now ? new Date(opts.now) : new Date())}T00:00:00+09:00`);
    for (let offset=1; offset<=7; offset++) {
      const midnight = day0 + offset * 86400000;
      const weekday = new Date(midnight + 9 * 3600000).getUTCDay();
      const sampleDate = displayDate(new Date(midnight));
      if (weekday===0 || weekday===6 || demoClosedDate(sampleDate)) continue;
      store.appointments[0].requested_start_at = `${sampleDate}T10:00:00+09:00`;
      break;
    }
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
    // R123: values in generic admin edits are fictional but must still respect business enums.
    // No arbitrary state/progress strings are accepted; keep UI and dashboard stable.
    const STATUSES=Object.freeze({
      clients:['onboarding','active','paused','ended'],
      cases:['received','checking','waiting_client','waiting_documents','in_progress','staff_review','final_review','completed','on_hold','cancelled'],
      tasks:['todo','in_progress','waiting_staff','completed','cancelled'],
      appointments:['requested','confirmed','change_requested','cancel_requested','cancelled','completed','no_show'],
      inquiries:['new','open','waiting_office','resolved','closed'],
    });
    const PRIORITIES=['low','normal','high','urgent'];
    function validateEdit(type,patch){
      if('status' in patch&&!STATUSES[type].includes(patch.status))fail(400,'INVALID_DEMO_STATUS','選択できない状態です');
      if('priority' in patch&&!PRIORITIES.includes(patch.priority))fail(400,'INVALID_DEMO_PRIORITY','選択できない優先度です');
      if('progress_percent' in patch){
        const pct=patch.progress_percent;
        if(!/^(?:100|[1-9]?\d)$/.test(pct))fail(400,'INVALID_DEMO_PROGRESS','進捗は0〜100の整数で指定してください');
        patch.progress_percent=Number(pct);
      }
      if('legal_name' in patch&&!patch.legal_name.trim())fail(400,'INVALID_DEMO_NAME','顧問先名を入力してください');
      if('title' in patch&&!patch.title.trim())fail(400,'INVALID_DEMO_TITLE','件名を入力してください');
    }
    function readCollection(type,search){
      const cfg=KINDS[type];if(!cfg)return locked();
      const result=store[type].filter(x=>!search.get('client_id')||x.client_id===search.get('client_id'));
      return {ok:true,[type]:clone(result)};
    }
    function mutate(type,method,id,body){
      const cfg=KINDS[type];if(!cfg)return locked();
      const input=clean(body||{});
      if(method==='POST'){
        const data={office_id:OFFICE_ID,is_demo:true,created_at:new Date().toISOString()};
        for(const key of cfg.createFields)if(key in input)data[key]=String(input[key]).slice(0,220);
        if(!data[cfg.createFields[0]]||!data[cfg.createFields[0]].trim())fail(400,'REQUIRED_FIELD','必須項目を入力してください');
        if('priority' in data&&!PRIORITIES.includes(data.priority))fail(400,'INVALID_DEMO_PRIORITY','選択できない優先度です');
        // R129: optional fictional task deadlines must be real ISO dates, not arbitrary text.
        // Validate before autoId() so rejected deadlines do not consume a demo ID.
        if(type==='tasks'&&'due_at' in data){
          const due=data.due_at, datePart=due.slice(0,10);
          const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(due);
          const stamped=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(due);
          const midnight=Date.parse(datePart+'T00:00:00Z');
          const validDay=Number.isFinite(midnight)&&new Date(midnight).toISOString().slice(0,10)===datePart;
          let validTime=false;
          if(stamped){
            const hh=Number(due.slice(11,13)),mm=Number(due.slice(14,16)),ss=Number(due.slice(17,19));
            const offset=due.match(/([+-])(\d{2}):(\d{2})$/);
            const validOffset=!offset||(Number(offset[2])<=14&&Number(offset[3])<=59&&(Number(offset[2])!==14||offset[3]==='00'));
            validTime=hh<=23&&mm<=59&&ss<=59&&validOffset&&Number.isFinite(Date.parse(due));
          }
          if(!validDay||!(dateOnly||validTime))fail(400,'INVALID_DEMO_DUE_DATE','期限日は実在する日付を指定してください');
        }
        if(data.client_id&&!store.clients.some(c=>c.id===data.client_id))fail(403,'CLIENT_ACCESS_DENIED','架空顧問先以外へ紐付けできません');
        // R121: synthetic-only referential integrity; reject orphan cases and cross-client task links.
        if(type==='cases'&&!data.client_id)fail(400,'CASE_CLIENT_REQUIRED','案件の顧問先を選択してください');
        if(type==='tasks'&&data.case_id){
          const parentCase=store.cases.find(c=>c.id===data.case_id);
          if(!parentCase||!data.client_id||parentCase.client_id!==data.client_id)
            fail(403,'CASE_CLIENT_SCOPE_DENIED','別の顧問先または存在しない案件へ紐付けできません');
        }
        // R128: allocate only after all create validations have passed; failed writes must not consume IDs.
        data.id=autoId();
        data[{clients:'client_code',cases:'case_code',tasks:'task_code',appointments:'appointment_code',inquiries:'inquiry_code'}[type]]=`${cfg.prefix}-DEMO-${String(serial+2).padStart(3,'0')}`;
        // R125: use a valid, type-specific initial state for each synthetic record.
        // No acceptance of user-provided status on POST; valid state transitions remain PATCH-only.
        data.status={clients:'onboarding',cases:'received',tasks:'todo',appointments:'requested',inquiries:'new'}[type];
        store[type].push(data);audit.push({type,method,id:data.id});
        return {ok:true,[type==='clients'?'client':type==='cases'?'case':type==='tasks'?'task':type==='appointments'?'appointment':'inquiry']:clone(data)};
      }
      const before=one(type,id);
      if(method==='PATCH'){
        // R124: only the approved status field may be changed for synthetic
        // bookings/inquiries. Reject unknown or mixed fields rather than
        // silently ignoring time/contact/body edits and applying status.
        if((type==='appointments'||type==='inquiries')&&
           Object.keys(input).some(k=>!cfg.editFields.includes(k)))return locked();
        const patch={};for(const k of cfg.editFields)if(k in input)patch[k]=String(input[k]).slice(0,220);
        if(!Object.keys(patch).length)fail(400,'NO_CHANGES','変更できる項目がありません');
        validateEdit(type,patch);
        Object.assign(before,patch);audit.push({type,method,id});return {ok:true,record:clone(before)};
      }
      if(method==='DELETE'){
        // Deletion of synthetic appointments/inquiries is not a demo action.
        if(type==='appointments'||type==='inquiries')return locked();
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
          for(let i=0;i<store.office.booking_open_days;i++){
            const base=Date.parse(`${today}T00:00:00+09:00`)+i*86400000;
            const day=new Date(base+9*3600000), week=day.getUTCDay();
            if(week===0||week===6)continue;
            const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(base));
            if(demoClosedDate(date))continue;
            out.push(date);
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
        if(method==='GET'&&pathname==='/api/demo/member-preview'){
          // R122: the displayed demo member can only see fictional records linked to that same fictional client.
          const member=store.clients[0], belongs=x=>x.client_id===member.id;
          return {ok:true,mode:'fictional_preview',client:clone(member),cases:clone(store.cases.filter(belongs)),appointments:clone(store.appointments.filter(belongs)),document_requests:clone(store.document_requests.filter(belongs)),documents:[],uploads_disabled:true,line_verified:false};
        }
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
      // R122: member-preview is handled only by the scoped /api/demo/ router above; never return unfiltered records.
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
        // R126: client detail and dashboard/member preview must agree on synthetic bookings.
        // Only appointments explicitly linked to this synthetic client are visible here.
        return {ok:true,client:clone(c),contacts:[],links:[],cases:clone(store.cases.filter(x=>x.client_id===c.id)),tasks:clone(store.tasks.filter(x=>x.client_id===c.id)),document_requests:clone(store.document_requests.filter(x=>x.client_id===c.id)),documents:[],appointments:clone(store.appointments.filter(x=>x.client_id===c.id)),inquiries:[]};
      }

      if(method==='GET'&&pathname==='/api/admin/document-requests')return {ok:true,document_requests:clone(store.document_requests)};
      for(const type of Object.keys(KINDS)){
        const prefix='/api/admin/'+type;
        if(pathname===prefix){
          if(method==='GET')return readCollection(type,url.searchParams);
          // R122: public demos must use /api/demo/booking and /api/demo/inquiry
          // for validated 30-minute, non-past, non-PII-only local interactions.
          // Do not expose unvalidated generic admin writes for these types.
          if(method==='POST'&&(type==='appointments'||type==='inquiries'))return locked();
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
