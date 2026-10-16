from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).parent
HTML=(ROOT/'index.html').read_text(encoding='utf8')
checks=[]
def verify(view,label,ok):
 checks.append({'viewport':view,'check':label,'pass':bool(ok)})
 if not ok: raise AssertionError(f'{view}: {label}')
with sync_playwright() as p:
 opts={'headless':True}
 if Path('/usr/bin/chromium').exists(): opts.update({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']})
 browser=p.chromium.launch(**opts)
 for view,(w,h) in {'desktop':(1440,900),'ipad':(834,1112),'mobile':(390,844)}.items():
  pg=browser.new_page(viewport={'width':w,'height':h},locale='ja-JP',timezone_id='Asia/Tokyo')
  errs=[];req=[]
  pg.on('pageerror',lambda x:errs.append(str(x)))
  pg.on('request',lambda x:req.append(x.url))
  pg.set_content(HTML)
  # Change assigned staff of Aoba and verify consistency in both staff and client views.
  pg.evaluate("document.querySelector('[data-admin-view=visits]').click()")
  pg.locator('#visit-staff').select_option('鈴木')
  later=pg.evaluate('''() => {const d=new Date(Date.now()+2*86400000); d.setMinutes(d.getMinutes()>=30?30:0,0,0); if(d.valueOf()<Date.now()+86400000)d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}''')
  pg.locator('#visit-date').fill(later[:10]);pg.locator('#visit-time').select_option(later[-5:]);pg.locator('[data-action="save-visit"]').click()
  verify(view,'Staff updated in visits list','鈴木' in pg.locator('#visits-list tr').first.inner_text())
  pg.evaluate("document.querySelector('[data-admin-view=notes]').click()")
  verify(view,'Staff header refreshed in notes', '主担当：鈴木' in pg.locator('#memo-client-title').inner_text())
  pg.locator('#memo-text').fill('担当者名更新を確認')
  pg.locator('[data-action="add-note"]').click()
  verify(view,'New staff note has actual assigned name','鈴木' in pg.locator('#memo-office-list .tplus-item').last.inner_text())
  pg.evaluate("document.querySelector('[data-admin-view=liff]').click()")
  verify(view,'Client header sees reassigned staff','鈴木' in pg.locator('#liff-client-label').inner_text())
  pg.locator('[data-liff-tab="notes"]').click()
  verify(view,'Private staff note still hidden in client mock','担当者名更新を確認' not in pg.locator('#liff-content').inner_text())
  # A near-term visit has a reminder slot that has already elapsed; never claim it will be sent.
  pg.evaluate("document.querySelector('[data-admin-view=visits]').click()")
  soon=pg.evaluate('''() => {const d=new Date(Date.now()+2*3600000);d.setMinutes(d.getMinutes()>=30?30:0,0,0);if(d.valueOf()<=Date.now())d.setMinutes(d.getMinutes()+30);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}''')
  pg.locator('#visit-date').fill(soon[:10]);pg.locator('#visit-time').select_option(soon[-5:]);pg.locator('[data-action="save-visit"]').click()
  verify(view,'Expired reminder warns during save','未送信として扱います' in pg.locator('#visit-feedback').inner_text())
  verify(view,'Visits row does not show scheduled','通知時刻経過（未送信）' in pg.locator('#visits-list tr').first.inner_text())
  verify(view,'Expired reminder not counted scheduled',pg.locator('#visit-scheduled').inner_text()=='1件')
  verify(view,'Attention count includes expired reminder',pg.locator('#visit-attention').inner_text()=='1件')
  pg.locator('[data-action="preview-visit"]').click()
  verify(view,'Visit reminder preview says past','送信せず' in pg.locator('#visit-feedback').inner_text())
  pg.evaluate("document.querySelector('[data-admin-view=dashboard]').click()")
  verify(view,'Dashboard does not falsely promise delivery','通知時刻経過（未送信・模擬）' in pg.locator('#dashboard-tasks').inner_text())
  pg.evaluate("document.querySelector('[data-admin-view=liff]').click()")
  pg.locator('[data-liff-tab="visit"]').click()
  verify(view,'Client preview does not falsely promise delivery','通知予定時刻経過（未送信・模擬）' in pg.locator('#liff-content').inner_text())
  verify(view,'No JS errors',len(errs)==0)
  verify(view,'No network requests',len(req)==0)
  pg.screenshot(path=str(ROOT/f'QA_V35_{view}_visit.png'),full_page=True)
  pg.close()
 browser.close()
summary={'pass':len(checks),'fail':0,'viewports':['desktop','ipad','mobile'],'external_requests':0,'js_errors':0,'screenshots':3}
(ROOT/'QA_V35_TARGETED.json').write_text(json.dumps({'summary':summary,'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print('TARGETED',summary)
