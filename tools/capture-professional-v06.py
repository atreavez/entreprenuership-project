from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'screenshots'
pages={'professional-trust':'professional.html','trust-review-desk':'professional-review-desk.html'}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=shutil.which('chromium'),args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    for kind,filename in pages.items():
     html=(root/filename).read_text()
     for name,(w,h) in {'desktop':(1440,940),'mobile':(390,844)}.items():
      page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
      page.set_content(html,wait_until='domcontentloaded')
      page.screenshot(path=str(root/f'v06-{kind}-{name}.png'),full_page=True)
      dims=page.evaluate('({innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,title:document.title})')
      print(kind,name,dims)
      if dims['scrollWidth']>w+1: raise RuntimeError(f'Horizontal overflow on {name}: {dims}')
      page.close()
    browser.close()
