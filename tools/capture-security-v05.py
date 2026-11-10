from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil
root=Path(__file__).resolve().parents[1]/'screenshots'; html=(root/'security.html').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
 for device,(w,h) in {'desktop':(1440,960),'mobile':(390,844)}.items():
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
  page.set_content(html,wait_until='domcontentloaded')
  page.screenshot(path=str(root/f'v05-account-security-{device}.png'),full_page=True)
  dims=page.evaluate('({viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})')
  print(device,dims)
  page.close()
 browser.close()
