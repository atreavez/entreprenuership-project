from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil
root=Path(__file__).resolve().parents[1]/'screenshots'
html=(root/'documents.html').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    for name,(width,height) in {'desktop':(1440,980),'mobile':(390,844)}.items():
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        page.set_content(html,wait_until='domcontentloaded')
        page.screenshot(path=str(root/f'v07-encrypted-vault-{name}.png'),full_page=True)
        metrics=page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})')
        print(f'{name}: {metrics}')
        assert metrics['scrollWidth']<=width+1, f'horizontal overflow on {name}'
        assert 'AES-256-GCM' in page.locator('body').inner_text()
        page.close()
    browser.close()
