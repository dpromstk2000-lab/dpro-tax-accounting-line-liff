from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root=Path(__file__).parent
html=(root/'index.html').read_text(encoding='utf8')
viewports={'desktop':(1440,900),'ipad':(850,1130),'mobile':(390,844)}
results=[]

def qa(page,condition,label,viewport):
    if callable(condition): condition=condition()
    results.append({'viewport':viewport,'check':label,'pass':bool(condition)})
    if not condition: raise AssertionError(f'{viewport} — {label}')

def txt(page,s):return page.locator(s).inner_text()

with sync_playwright() as p:
    launch={'headless':True}
    if Path('/usr/bin/chromium').exists():
        launch.update({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']})
    browser=p.chromium.launch(**launch)
    for viewport,(w,h) in viewports.items():
        page=browser.new_page(viewport={'width':w,'height':h},locale='ja-JP')
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        page.set_content(html,wait_until='load')
        qa(page,page.title().endswith('V3.6 隔離候補'),'Version V3.6 隔離候補',viewport)
        qa(page,page.locator('[data-admin-view="visits"]').count()==1,'Visit panel retained',viewport)
        qa(page,page.locator('[data-admin-view="notes"]').count()==1,'Note panel retained',viewport)
        qa(page,page.locator('[data-admin-view="reminders"]').count()==1,'Docs panel retained',viewport)
        # Test under viewport different breakpoints via direct DOM click (sidebar on mobile may be overlay closed)
        page.evaluate("document.querySelector('[data-admin-view=reminders]').click()")
        qa(page,page.locator('[data-admin-panel="reminders"]').is_visible(),'Documents panel visible',viewport)
        qa(page,'請求書・領収書' in txt(page,'#doc-items-list'),'Aoba missing document',viewport)
        qa(page,'通帳コピー' in txt(page,'#doc-items-list'),'Aoba submitted document',viewport)
        qa(page,'未提出 1点' in txt(page,'#doc-stats'),'Missing count=1',viewport)
        page.locator('[data-toggle-doc="0"]').click()
        qa(page,'未提出 0点' in txt(page,'#doc-stats'),'Mark received',viewport)
        page.locator('[data-action="preview-cycle"]').click()
        qa(page,'催促なし' in txt(page,'#doc-feedback'),'No reminder after all submitted',viewport)
        page.locator('[data-toggle-doc="0"]').click()
        qa(page,'未提出 1点' in txt(page,'#doc-stats'),'Reopen missing document',viewport)
        page.locator('[data-action="preview-cycle"]').click()
        qa(page,'請求書・領収書' in txt(page,'#doc-feedback'),'Reminder only missing documents',viewport)
        qa(page,'通帳コピー' not in txt(page,'#doc-feedback'),'Submitted excluded from reminder',viewport)
        page.locator('#doc-client').select_option(label='さくら企画（架空）')
        qa(page,'支払明細' in txt(page,'#doc-items-list'),'Sakura documents shown',viewport)
        qa(page,'請求書・領収書' not in txt(page,'#doc-items-list'),'Aoba documents hidden',viewport)
        page.locator('[data-action="preview-cycle"]').click()
        qa(page,'通知停止' in txt(page,'#doc-feedback'),'Sakura reminder disabled',viewport)
        # Notes and albums
        page.evaluate("document.querySelector('[data-admin-view=notes]').click()")
        qa(page,page.locator('#memo-album-grid').is_visible(),'Albums visible',viewport)
        page.locator('#memo-client').select_option(label='青葉商事（架空）')
        page.locator('#memo-text').fill('非公開確認ノート QA-'+viewport)
        page.locator('#memo-scope').select_option('internal')
        page.locator('[data-action="add-note"]').click()
        qa(page,'非公開確認ノート' in txt(page,'#memo-office-list'),'Private staff note added',viewport)
        page.locator('#album-label').fill('秘密の所内カードQA-'+viewport)
        page.locator('#album-scope').select_option('internal')
        page.locator('[data-action="add-album"]').click()
        qa(page,'秘密の所内カード' in txt(page,'#memo-album-grid'),'Private album added',viewport)
        page.locator('#album-label').fill('共有カードQA-'+viewport)
        page.locator('#album-scope').select_option('shared')
        page.locator('[data-action="add-album"]').click()
        qa(page,'共有カード' in txt(page,'#memo-album-grid'),'Shared album added',viewport)
        # client preview privacy
        page.evaluate("document.querySelector('[data-admin-view=liff]').click()")
        page.locator('#liff-client').select_option(label='青葉商事（架空）')
        page.locator('[data-liff-tab="notes"]').click()
        qa(page,'共有カードQA-' in txt(page,'#liff-content'),'Shared album in LIFF mock',viewport)
        qa(page,'秘密の所内カードQA-' not in txt(page,'#liff-content'),'Private album not visible to client',viewport)
        qa(page,'非公開確認ノート' not in txt(page,'#liff-content'),'Private note not visible to client',viewport)
        page.locator('#liff-client').select_option(label='さくら企画（架空）')
        qa(page,'共有カードQA-' not in txt(page,'#liff-content'),'Aoba card separated from Sakura',viewport)
        qa(page,'四半期共有資料' in txt(page,'#liff-content'),'Sakura card visible',viewport)
        page.locator('[data-liff-tab="docs"]').click()
        qa(page,'支払明細' in txt(page,'#liff-content'),'Sakura documents visible to Sakura',viewport)
        qa(page,'請求書・領収書' not in txt(page,'#liff-content'),'Aoba documents not shown to Sakura',viewport)
        qa(page,len(errors)==0,'No JavaScript errors',viewport)
        qa(page,len(requests)==0,'No external requests',viewport)
        page.evaluate("document.querySelector('[data-admin-view=reminders]').click()")
        page.screenshot(path=str(root/f'QA_{viewport}_documents.png'),full_page=True)
        page.evaluate("document.querySelector('[data-admin-view=notes]').click()")
        page.screenshot(path=str(root/f'QA_{viewport}_notes.png'),full_page=True)
        page.close()
    browser.close()

summary={'pass':sum(x['pass'] for x in results),'fail':sum(not x['pass'] for x in results),'viewports':list(viewports),'screenshots':6,'notes':'Mock only; no external requests, no production Worker or DB'}
(root/'QA_RESULTS.json').write_text(json.dumps({'summary':summary,'checks':results},ensure_ascii=False,indent=2),encoding='utf8')
print('SUMMARY',summary)
