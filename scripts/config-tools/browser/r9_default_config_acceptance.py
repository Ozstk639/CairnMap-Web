"""Persistent version checks in a dedicated disposable CDP profile."""
import json, os
from browser_check import Browser, OUT

assert os.environ.get('CAIRNMAP_CDP_PORT') == '9240', 'Only run in the dedicated r9 acceptance profile'
b=Browser(); checks=[]
def navigate(query='?workspace=config-studio&configMode=v3'):
    b.navigate(query)
    b.wait("document.querySelector('main header p')?.textContent.includes('配置 r')")
def active():
    return b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');const c=p.getActiveConfigSnapshot();return {revision:c.revision,contract:c.contractRevision,label:c.displayName.zh,packageId:c.packageId}})()")
def reset_storage():
    b.evaluate("(async()=>{localStorage.removeItem('cairnmap-config-active-choice-v1');for(const k of Object.keys(sessionStorage))if(k.startsWith('cairnmap-config-studio'))sessionStorage.removeItem(k);await new Promise((resolve,reject)=>{const r=indexedDB.open('cairnmap-config-lab-v32',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('packages','readwrite');t.objectStore('packages').clear();t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}})})()")
def seed_old(custom=False):
    b.evaluate("(async()=>{const m=await import('/src/configStudio/legacyProjectAdapter.ts');const c=m.createConfigPackageFromCurrentProject();"+("c.displayName.zh='自定义旧包';" if custom else "")+"window.oldRaw=JSON.stringify(c);for(const k of ['cairnmap-config-studio-saved','cairnmap-config-studio-draft'])sessionStorage.setItem(k,window.oldRaw);await new Promise(resolve=>{const r=indexedDB.open('cairnmap-config-lab-v32',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('packages','readwrite');t.objectStore('packages').put(c,'latest');t.oncomplete=()=>{db.close();resolve()}}});})()")
    return b.evaluate('window.oldRaw')

navigate();reset_storage();navigate()
assert active()['revision']==4 and active()['contract']==8
checks.append('clean browser loads the shipped r8/r4 seed without upload')

reset_storage();old=seed_old();navigate()
assert active()['revision']==4
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return (await p.getConfigRecoveries()).length})()")>0
navigate();assert active()['revision']==4
checks.append('previous default r2 is archived and refresh consistently selects r4')

reset_storage();old=seed_old(True);navigate()
recovery=b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return (await p.getConfigRecoveries()).find(r=>r.source==='cairnmap-config-studio-saved').key})()")
raw=b.evaluate("(async()=>{const m=await import('/src/configStudio/configLabStorage.ts');return (await m.readConfigRecovery("+json.dumps(recovery)+")).raw})()")
assert json.loads(raw)==json.loads(old)
b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');await p.restoreConfigRecovery("+json.dumps(recovery)+")})()")
navigate();assert active()['label']=='自定义旧包'
checks.append('custom old content is preserved exactly and can be explicitly restored')

b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');const c=structuredClone(await p.loadDefaultConfig());c.packageId='default-acceptance-upload';c.revision=7;c.displayName.zh='上传验证版本';await p.persistActiveConfig(c);})()")
navigate();assert active()['packageId']=='default-acceptance-upload' and active()['revision']==7
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/?workspace=config-lab&configMode=v3'})
b.wait("document.body.innerText.includes('已加载活动 V3 配置 default-acceptance-upload r7')")
checks.append('uploaded/selected version survives refresh and is shared by Studio and Lab')

navigate('?workspace=config-studio&configMode=v3&tab=workflows')
b.evaluate("(()=>{const e=document.querySelector('section[aria-label=\"工作流编辑区域\"] select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'v3-wrp_warp');e.dispatchEvent(new Event('change',{bubbles:true}));})()")
b.click('读取');b.wait("!!document.querySelector('section[aria-label=\"工作流编辑区域\"] textarea')")
b.evaluate("(()=>{const e=document.querySelector('section[aria-label=\"工作流编辑区域\"] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'持久编辑验证');e.dispatchEvent(new Event('input',{bubbles:true}));})()")
b.click('保存');b.wait("!document.querySelector('section[aria-label=\"工作流编辑区域\"] textarea')")
navigate();assert active()['revision']==8
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return p.getActiveConfigSnapshot().workflows.find(w=>w.id==='v3-wrp_warp').label.zh})()")=='持久编辑验证'
checks.append('actual workflow Save increments the package and persists edited content across reload')

b.click('恢复应用默认配置');b.wait("document.querySelector('main header p')?.textContent.includes('配置 r4')")
assert active()['revision']==4
assert b.evaluate("(async()=>{const m=await import('/src/configStudio/configLabStorage.ts');return (await m.listConfigLabPackages()).some(c=>c.packageId==='default-acceptance-upload'&&c.revision===8)})()")
checks.append('restore default returns to r4 while saved user versions remain in history')
assert not b.errors,b.errors
(OUT/'r9-default-config-acceptance.json').write_text(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
