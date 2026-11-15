from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'screenshots/team.html').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in (1440,390):
  page=browser.new_page(viewport={'width':width,'height':844})
  page.set_content(html,wait_until='domcontentloaded',timeout=15000)
  result=page.evaluate('({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,containsInvite:document.body.innerText.includes("Invite a co-administrator")})')
  print(f'width={width}:',result,flush=True)
  assert result['containsInvite'] and result['scroll']<=result['client']+1
  page.close()
 browser.close()
