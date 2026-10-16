from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).parent;html=(root/'index.html').read_text(encoding='utf8'); checks=[]
def check(view,label,ok):
 checks.append({'viewport':view,'check':label,'pass':bool(ok)})
 if not ok:raise AssertionError(view+' :: '+label)
with sync_playwright() as p:
 opts={'headless':True}
 if Path('/usr/bin/chromium').exists():opts.update({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']})
 b=p.chromium.launch(**opts)
 for view,(w,h) in {'desktop':(1440,900),'ipad':(834,1112),'mobile':(390,844)}.items():
  pg=b.new_page(viewport={'width':w,'height':h},locale='ja-JP',timezone_id='Asia/Tokyo');errs=[];req=[]
  pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('request',lambda r:req.append(r.url))
  pg.set_content(html)
  pg.evaluate("document.querySelector('[data-admin-view=reminders]').click()")
  pg.locator('#doc-cycle').select_option('3か月ごと')
  check(view,'Unsaved cycle input changed',pg.locator('#doc-cycle').input_value()=='3か月ごと')
  pg.locator('[data-action="preview-cycle"]').click()
  check(view,'Dirty settings clearly warned','未保存の変更あり' in pg.locator('#doc-feedback').inner_text())
  check(view,'Preview based on previously saved monthly cycle','毎月' in pg.locator('#doc-feedback').inner_text())
  check(view,'Unsaved warning recorded in preview log','未保存の変更あり' in pg.locator('#doc-preview-log').inner_text())
  pg.locator('[data-action="save-cycle"]').click()
  pg.locator('[data-action="preview-cycle"]').click()
  check(view,'Warning cleared after save','未保存の変更あり' not in pg.locator('#doc-feedback').inner_text())
  check(view,'Saved cycle now used in preview','3か月ごと' in pg.locator('#doc-feedback').inner_text())
  pg.locator('#doc-push').uncheck()
  pg.locator('[data-action="preview-cycle"]').click()
  check(view,'Warning for unsaved notification toggle','未保存の変更あり' in pg.locator('#doc-feedback').inner_text())
  check(view,'Preview still reflects ON because uncheck not saved','定期資料依頼プレビュー' in pg.locator('#doc-feedback').inner_text())
  check(view,'No JS errors in normal demo',len(errs)==0)
  check(view,'No network requests in normal demo',len(req)==0)
  pg.close()
  # Deliberately advance simulated demo date and verify that overdue dates aren't advertised as upcoming.
  pg=b.new_page(viewport={'width':w,'height':h},locale='ja-JP',timezone_id='Asia/Tokyo');errs=[];req=[]
  pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('request',lambda r:req.append(r.url))
  pg.clock.install(time=datetime(2026,11,5,11,0,tzinfo=ZoneInfo('Asia/Tokyo')))
  pg.set_content(html)
  check(view,'Expired document deadline labeled overdue','提出期限超過（未提出・模擬）' in pg.locator('#dashboard-tasks').inner_text())
  check(view,'No incoming-task mislabel for overdue docs','2026/10/25｜青葉商事（架空）／未提出資料の回収期限' not in pg.locator('#dashboard-tasks').inner_text())
  pg.evaluate("document.querySelector('[data-admin-view=reminders]').click()")
  pg.locator('[data-action="preview-cycle"]').click()
  check(view,'Overdue sample still has notification preview','未提出' in pg.locator('#doc-feedback').inner_text())
  check(view,'No JS errors on late test',len(errs)==0)
  check(view,'No network requests on late test',len(req)==0)
  pg.close()
  # The tax office uses Japan time even when an operator's browser is set to another timezone.
  pg=b.new_page(viewport={'width':w,'height':h},locale='en-US',timezone_id='America/Los_Angeles');errs=[];req=[]
  pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('request',lambda r:req.append(r.url))
  pg.clock.install(time=datetime(2026,10,16,1,0,tzinfo=ZoneInfo('Asia/Tokyo')))
  pg.set_content(html)
  pg.evaluate("document.querySelector('[data-admin-view=visits]').click()")
  pg.locator('#visit-date').fill('2026-10-15');pg.locator('#visit-time').select_option('23:30')
  pg.locator('[data-action="save-visit"]').click()
  check(view,'Past JST visit rejected across browser timezone','過去日時' in pg.locator('#owner-alert').inner_text())
  pg.locator('#visit-date').fill('2026-10-16');pg.locator('#visit-time').select_option('02:00')
  pg.locator('[data-action="save-visit"]').click()
  check(view,'Future JST visit accepted across browser timezone','模擬登録' in pg.locator('#visit-feedback').inner_text())
  check(view,'Japan date stable in output','2026/10/16 02:00' in pg.locator('#visit-feedback').inner_text())
  check(view,'No JS errors across timezone',len(errs)==0)
  check(view,'No network requests across timezone',len(req)==0)
  pg.screenshot(path=str(root/f'QA_V36_{view}_timezone.png'),full_page=True)
  pg.close()
 b.close()
summary={'pass':len(checks),'fail':0,'viewports':['desktop','ipad','mobile'],'js_errors':0,'external_requests':0,'screenshots':3}
(root/'QA_V36_TARGETED.json').write_text(json.dumps({'summary':summary,'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print('TARGETED_V36',summary)
