from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).parent;html=(root/'index.html').read_text();res=[]
def check(view,name,val):
 res.append(dict(view=view,check=name,passed=bool(val)))
 if not val:raise AssertionError((view,name))
with sync_playwright() as p:
 opts={'headless':True}
 if Path('/usr/bin/chromium').exists():opts.update({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']})
 b=p.chromium.launch(**opts)
 for view,wh in {'desktop':(1440,900),'ipad':(834,1112),'mobile':(390,844)}.items():
  pg=b.new_page(viewport={'width':wh[0],'height':wh[1]},timezone_id='Asia/Tokyo');errors=[];req=[]
  pg.on('pageerror',lambda x: errors.append(str(x)));pg.on('request',lambda x:req.append(x.url))
  pg.set_content(html)
  check(view,'Guide visible on dashboard',pg.locator('[data-admin-panel="dashboard"] .tplus-guide').count()==1)
  check(view,'Three guided actions',pg.locator('.tplus-guide [data-go-view]').count()==3)
  pg.locator('.tplus-guide [data-go-view="reminders"]').click()
  check(view,'Guide navigation to documents',pg.locator('[data-admin-panel="reminders"]').is_visible())
  pg.locator('#doc-due').fill('2026-02-01');pg.locator('[data-action="save-cycle"]').click()
  check(view,'Past document deadline rejected','過去の提出期限' in pg.locator('#owner-alert').inner_text())
  pg.locator('#doc-due').fill(pg.evaluate("(()=>{const d=new Date();d.setFullYear(d.getFullYear()+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')})()"));pg.locator('[data-action="save-cycle"]').click()
  check(view,'Future due date accepted','模擬保存' in pg.locator('#doc-feedback').inner_text())
  pg.evaluate("document.querySelector('[data-admin-view=visits]').click()")
  pg.locator('#visit-date').fill('2026-02-28');pg.locator('[data-action="save-visit"]').click()
  check(view,'Past visit date rejected','過去日時' in pg.locator('#owner-alert').inner_text())
  check(view,'No browser errors',not errors)
  check(view,'Zero external requests',not req)
  pg.close()
 b.close()
(root/'V35_EXTRA_QA_RESULTS.json').write_text(json.dumps({'pass':len(res),'fail':0,'checks':res},ensure_ascii=False,indent=2))
print('EXTRA PASS',len(res))
