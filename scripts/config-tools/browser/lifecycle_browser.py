import json, time
from browser_check import Browser, OUT
b=Browser();checks=[]
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html'})
b.wait('!!window.workflowAcceptance?.measurement')
storage=b.evaluate("""(async()=>{
 const {saveConfigLabPackage,loadLatestConfigLabPackage,listConfigLabPackages}=await import('/src/configStudio/configLabStorage.ts');
 const config=structuredClone(window.workflowAcceptance.config);config.packageId='acceptance-lifecycle-'+Date.now();
 await saveConfigLabPackage(config);const baseline=await loadLatestConfigLabPackage();
 const conflict=structuredClone(config);conflict.displayName.zh+=' changed';
 let conflictRejected=false;try{await saveConfigLabPackage(conflict)}catch{conflictRejected=true}
 const bad=structuredClone(config);bad.revision++;bad.engine.screenGateDefaults.polygonMinScreenAreaPx=-1;
 let invalidRejected=false;try{await saveConfigLabPackage(bad)}catch{invalidRejected=true}
 const latest=await loadLatestConfigLabPackage();const history=await listConfigLabPackages();
 return {conflictRejected,invalidRejected,latestUnchanged:JSON.stringify(latest)===JSON.stringify(baseline),historySaved:history.some(c=>c.packageId===config.packageId&&c.revision===config.revision)};
})()""")
assert all(storage.values()),storage
checks.append('real IndexedDB refuses invalid activation and same-revision content replacement')
b.click('测绘');b.click('开始测绘(快捷)')
b.evaluate("(() => {const s=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='v3-tpp_teleport'));s.value='v3-tpp_teleport';s.dispatchEvent(new Event('change',{bubbles:true}));})()")
b.click('开始');b.wait("!!document.querySelector('input[aria-label=填写人]')")
b.evaluate("(() => {const i=document.querySelector('input[aria-label=填写人]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'draft-snapshot');i.dispatchEvent(new Event('input',{bubbles:true}));window.savedRunnerInput=i;})()")
for width in [640,1440]:
 b.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':1000,'deviceScaleFactor':1,'mobile':False});time.sleep(.4)
 assert b.evaluate("document.querySelector('input[aria-label=填写人]')===window.savedRunnerInput && window.savedRunnerInput.value==='draft-snapshot'")
checks.append('same Runner and input survive desktop/narrow-screen layout switches')
b.evaluate("window.workflowAcceptance.setConfig({...window.workflowAcceptance.config,revision:88,workflows:[]})")
time.sleep(.3)
assert b.evaluate("document.querySelector('input[aria-label=填写人]')===window.savedRunnerInput")
checks.append('running workflow holds original package/workflow snapshot')
b.evaluate("window.workflowAcceptance.setWorld('naraku')");b.wait("document.body.innerText.includes('此工作流属于 zth')")
assert b.evaluate("window.savedRunnerInput.closest('fieldset').disabled")
b.evaluate("window.workflowAcceptance.setWorld('zth')");b.wait("!window.savedRunnerInput.closest('fieldset').disabled")
assert b.evaluate("window.savedRunnerInput.value==='draft-snapshot'")
checks.append('world changes suspend submission and restore the original-world form')
b.screenshot('workflow-lifecycle.png')
b.navigate('?workspace=config-studio');b.click('读取/新建')
b.evaluate("document.querySelector('[data-rule-extensions] > summary').click();true")
texts=b.evaluate("document.body.innerText")
for label in ['候选、碰撞对象与稳定/密度策略','默认值、提示、条件与引用','Label 独立碰撞指标','显示权重合成与边界']:
 assert label in texts,(label,texts[-2000:])
assert b.evaluate("[...document.querySelectorAll('input[aria-label=候选名称]')].every(e=>e.closest('main'))")
checks.append('advanced field/collision/priority/anchor editors are mounted in the active Studio')
assert not b.errors,b.errors
(OUT/'lifecycle-browser-result.json').write_text(json.dumps({'checks':checks,'storage':storage,'errors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks},ensure_ascii=False))
