"""Read the delivered disk ZIP with the actual Studio file-input handler."""
import json,os
from browser_check import Browser,OUT
assert os.environ.get('CAIRNMAP_CDP_PORT')=='9240'
b=Browser();b.navigate('?workspace=config-studio')
b.evaluate("(async()=>{for(const k of Object.keys(sessionStorage))if(k.startsWith('cairnmap-config-studio'))sessionStorage.removeItem(k);localStorage.removeItem('cairnmap-config-active-choice-v1');await new Promise(resolve=>{const r=indexedDB.open('cairnmap-config-lab-v32',1);r.onsuccess=()=>{const d=r.result,t=d.transaction('packages','readwrite');t.objectStore('packages').clear();t.oncomplete=()=>{d.close();resolve()}}});})()")
b.navigate('?workspace=config-studio');b.evaluate('window.confirm=()=>true')
doc=b.call('DOM.getDocument')['root']['nodeId'];node=b.call('DOM.querySelector',{'nodeId':doc,'selector':'header input[type=file]'})['nodeId']
b.call('DOM.setFileInputFiles',{'nodeId':node,'files':[str((OUT/'CairnMap_V32_CategoryManagement_Editing_r5.zip').resolve())]})
b.wait("document.body.innerText.includes('已导入 cairnmap-config-v32-semantic r5')",40)
snapshot=b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),m=await import('/src/configStudio/defaults/manifest.json');const c=p.getActiveConfigSnapshot(),{parity:_,...content}=c;const bytes=new TextEncoder().encode(p.stableConfigText(content)),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');return {revision:c.revision,contract:c.contractRevision,nodes:c.nodes.length,workflows:c.workflows.length,editing:c.workflows.filter(w=>w.editor?.enabled).length,hash,expected:m.default.semanticFingerprint};})()")
assert snapshot['revision']==5 and snapshot['contract']==9 and snapshot['nodes']==95 and snapshot['workflows']==28 and snapshot['editing']==24 and snapshot['hash']==snapshot['expected'],snapshot
b.navigate('?workspace=config-studio');assert b.evaluate("document.querySelector('select[aria-label=\"编辑分类 Class\"]').value")==''
assert not b.evaluate("!!document.querySelector('main .leaflet-container')")
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/?workspace=config-lab&configMode=v3'});b.wait("document.body.innerText.includes('已加载活动 V3 配置 cairnmap-config-v32-semantic r5')",40)
assert not b.errors,b.errors
(OUT/'r9-final-zip-import-acceptance.json').write_text(json.dumps({'snapshot':snapshot,'checks':['disk ZIP read by actual Studio handler, exact semantic fingerprint, refresh does not select Class or mount validator','same imported r9/r5 package activates in actual Lab'],'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print('Actual disk ZIP import, hash, reload, and shared Lab activation: OK',flush=True)
