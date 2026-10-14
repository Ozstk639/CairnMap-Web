"""Actual cold module failure, explicit reload retry and restored tool intent."""
import json,time,sys
from browser_check import Browser,OUT
b=Browser()
tool=sys.argv[1] if len(sys.argv)>1 else '测绘'
store="(await import((await (await fetch('/src/App.tsx')).text()).match(/from\\s+[\"']([^\"']*featureModuleStore[^\"']*)/)[1])).useFeatureModuleStore"
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/?workspace=config-lab&configMode=v3'})
b.wait("!!document.querySelector('.leaflet-container')",40)
b.evaluate("localStorage.removeItem('ria_feature_modules_v1');sessionStorage.removeItem('cairnmap-config-studio-draft');sessionStorage.removeItem('ria_feature_module_retry_v1');sessionStorage.removeItem('ria_feature_module_pending_tool_v1');true")
b.call('Page.reload',{'ignoreCache':True});b.wait("!!document.querySelector('.leaflet-container')",40)
b.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='测绘'&&e.getBoundingClientRect().height)",30)
b.call('Network.enable');b.call('Network.setCacheDisabled',{'cacheDisabled':True})
b.call('Network.setBlockedURLs',{'urls':['*entrypoints/measuringEntry*']})
b.click(tool);b.wait("!!document.querySelector('#feature-module-dialog-title')")
b.click('下载并启用')
b.wait('(async()=>{return '+store+".getState().modules.measuring.status==='error';})()")
b.wait("!!document.querySelector('[role=dialog] .text-red-700')")
failed=b.evaluate('(async()=>{const s='+store+'.getState();return {module:s.modules.measuring,dialog:s.dialog,overlay:s.loadingOverlay};})()')
assert failed['dialog']['error'] and not failed['overlay']['isOpen']
b.call('Network.setBlockedURLs',{'urls':[]})
b.click('重新加载并重试')
b.wait('(async()=>{return '+store+".getState().modules.measuring.status==='loaded';})()",45)
b.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='开始测绘(完整)'&&e.getBoundingClientRect().height)" if tool=='测绘' else "[...document.querySelectorAll('h3')].some(e=>e.textContent.trim()==='测量工具'&&e.getBoundingClientRect().height)")
assert not b.evaluate("!!document.querySelector('#feature-module-dialog-title')")
result={'tool':tool,'networkFaultInjected':'blocked cold measuringEntry request; then unblocked','failureDisplayed':True,'overlayRemoved':True,'explicitReloadRetryLoaded':True,'originalToolOpened':True,'expectedFaultState':failed,'runtimeErrors':b.errors}
(OUT/('module-retry-result.json' if tool=='测绘' else 'module-retry-measurement-result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
b.call('Network.setCacheDisabled',{'cacheDisabled':False})
assert not b.errors,b.errors
print('Actual App/Lab cold failure -> explicit reload retry -> restored requested tool: OK',flush=True)
