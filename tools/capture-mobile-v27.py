from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'screenshots/team.html').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 page.set_content(html,wait_until='domcontentloaded',timeout=10000)
 print('content loaded',flush=True)
 try:
  v=page.evaluate('({w:document.documentElement.scrollWidth,c:document.documentElement.clientWidth,h:document.documentElement.scrollHeight})')
  print('dimensions',v,flush=True)
  page.get_by_text('Invite a co-administrator',exact=True).scroll_into_view_if_needed(timeout=10000)
  page.screenshot(path=str(root/'screenshots/v27-coadmin-mobile.png'),full_page=False,timeout=10000)
  print('mobile viewport screenshot captured',flush=True)
 except Exception as e: print('mobile snapshot issue:',str(e)[:200],flush=True)
 browser.close()
