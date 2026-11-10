from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import functools,threading
root=Path(__file__).resolve().parents[1]/'screenshots'
pages=['auth','dashboard','geo','assets','asset-detail_demo-1','cases','case-detail_case1','documents','reports','billing','audit','notifications','assignments','team','tasks','disputes','monitoring','quotes','access','integrations','settings','security']
server=ThreadingHTTPServer(('127.0.0.1',8765),functools.partial(SimpleHTTPRequestHandler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path=shutil.which('chromium') or shutil.which('google-chrome'), args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
 for view,(width,height) in {'desktop':(1440,900),'mobile':(390,844)}.items():
  context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
  context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
  for page in pages:
   target=root/(page+'.html')
   t=context.new_page()
   t.set_content(target.read_text(),wait_until='domcontentloaded')
   t.screenshot(path=str(root/(f'{page}-{view}.png')),full_page=True)
   dims=t.evaluate('({h:document.documentElement.scrollHeight,w:document.documentElement.scrollWidth})')
   print(page,view,dims)
   t.close()
  context.close()
 browser.close()
