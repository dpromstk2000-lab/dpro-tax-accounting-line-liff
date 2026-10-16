from pathlib import Path
from playwright.sync_api import sync_playwright
import json
from datetime import date, timedelta
root=Path(__file__).parent
html=(root/'index.html').read_text(encoding='utf8')
views={'desktop':(1440,900),'ipad':(834,1112),'mobile':(390,844)}
results=[]
def record(view,label,condition):
    results.append({'view':view,'check':label,'pass':bool(condition)})
    if not condition:raise AssertionError(f'{view}: {label}')
with sync_playwright() as p:
  opts={'headless':True}
  if Path('/usr/bin/chromium').exists():opts.update({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']})
  browser=p.chromium.launch(**opts)
  for view,(w,h) in views.items():
    page=browser.new_page(viewport={'width':w,'height':h},locale='ja-JP',timezone_id='Asia/Tokyo')
    errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    page.set_content(html,wait_until='load')
    record(view,'V3.6 隔離候補 version heading',page.title().endswith('V3.6 隔離候補'))
    record(view,'No outdated V3.2 notice','V3.2' not in page.locator('body').inner_text())
    record(view,'No fake Supabase persistence badge','Supabase保存' not in page.locator('body').inner_text())
    record(view,'Mock date shown','架空データ・外部保存なし' in page.locator('#dashboard-date').inner_text())
    record(view,'Initial missing docs metric=3',page.locator('#metric-documents').inner_text()=='3')
    record(view,'Initial all 3 missing displayed',page.locator('#dashboard-documents .tplus-item').count()==3)
    record(view,'Monthly/quarterly summary','毎月1社・3か月ごと1社' in page.locator('#dashboard-doc-highlights').inner_text())
    record(view,'Reminder task actually based on due date','2026/10/25' in page.locator('#dashboard-tasks').inner_text())
    page.evaluate("document.querySelector('[data-admin-view=reminders]').click()")
    page.locator('[data-toggle-doc="0"]').click()
    record(view,'Aoba all docs submitted', '未提出 0点' in page.locator('#doc-stats').inner_text())
    record(view,'Dashboard pending count updated',page.locator('#metric-documents').inner_text()=='2')
    record(view,'Aoba reminder task removed','2026/10/25' not in page.locator('#dashboard-tasks').inner_text())
    record(view,'Sakura docs still pending','支払明細' in page.locator('#dashboard-documents').inner_text())
    page.locator('#doc-client').select_option(label='さくら企画（架空）')
    page.locator('#doc-cycle').select_option('毎月')
    future_due=(date.today()+timedelta(days=400)).isoformat()
    page.locator('#doc-due').fill(future_due)
    page.locator('#doc-push').check()
    page.locator('[data-action="save-cycle"]').click()
    record(view,'Changed cycle reflected','毎月2社・3か月ごと0社' in page.locator('#dashboard-doc-highlights').inner_text())
    record(view,'Changed due reflected in tasks',future_due.replace('-','/') in page.locator('#dashboard-tasks').inner_text())
    page.locator('[data-toggle-doc="0"]').click()
    page.locator('[data-toggle-doc="1"]').click()
    record(view,'All docs submitted count zero',page.locator('#metric-documents').inner_text()=='0')
    record(view,'All docs submitted suppress reminders','未提出資料の回収期限' not in page.locator('#dashboard-tasks').inner_text())
    record(view,'Dashboard empty state','未提出の資料はありません' in page.locator('#dashboard-documents').inner_text())
    record(view,'No JS errors',len(errors)==0)
    record(view,'No requests',len(requests)==0)
    page.evaluate("document.querySelector('[data-admin-view=dashboard]').click()")
    page.screenshot(path=str(root/f'QA_{view}_dashboard.png'),full_page=True)
    page.close()
  browser.close()
summary={'pass':sum(int(x['pass']) for x in results),'fail':sum(int(not x['pass']) for x in results),'viewports':list(views),'external_requests':0,'js_errors':0,'browser_screenshots':3}
(root/'QA_V35_CONSISTENCY.json').write_text(json.dumps({'summary':summary,'checks':results},ensure_ascii=False,indent=2),encoding='utf8')
print('SUMMARY',summary)
