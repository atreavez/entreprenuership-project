import asyncio,pathlib,json
from playwright.async_api import async_playwright
root=pathlib.Path(__file__).resolve().parent.parent
shots=root/'screenshots'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  results=[]
  for label,width,height in [('desktop',1440,940),('mobile',390,844)]:
   page=await browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
   await page.set_content((shots/'providers.html').read_text(),wait_until='domcontentloaded',timeout=30000)
   await page.screenshot(path=str(shots/f'v33-provider-{label}.png'),full_page=True,animations='disabled',timeout=30000)
   check=await page.evaluate('''() => ({width: document.documentElement.scrollWidth,viewport:innerWidth,pageHeight:document.documentElement.scrollHeight,hasForm:!!document.querySelector('.provider-form'),hasApprovals:!!document.querySelector('.provider-approvals'),hasProviderPanel:document.body.textContent.includes('Notification Providers')})''')
   results.append({'viewport':label,**check})
   if check['width']>check['viewport']+1: raise RuntimeError(f'Horizontal overflow: {check}')
   if not check['hasForm'] or not check['hasApprovals']:raise RuntimeError('Missing provider UI components')
   await page.close()
  await browser.close()
  print(json.dumps(results,indent=2))
asyncio.run(main())
