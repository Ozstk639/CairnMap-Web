import json,time
from pathlib import Path
from browser_check import Browser,OUT
b=Browser();checks=[];root=Path(__file__).resolve().parents[3]
def click(label):
 b.evaluate("(()=>{const e=[...document.querySelectorAll('button,summary')].find(e=>(e.textContent.trim()==="+json.dumps(label)+"||e.getAttribute('aria-label')==="+json.dumps(label)+"||e.title==="+json.dumps(label)+")&&e.getBoundingClientRect().height);if(!e||e.disabled)throw Error('Missing enabled '+"+json.dumps(label)+");e.click();})()");time.sleep(.2)

def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing input');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(str(data))+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
b.navigate('?workspace=config-studio');
if b.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent==='放弃草稿'&&!e.disabled)"):click('放弃草稿')
b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),m=await import('/src/configStudio/r9Migration.ts');const c=m.migrateConfigToR9(await p.loadDefaultConfig());c.workflows.find(w=>w.id==='v3-wrp_warp').editor.enabled=false;await p.persistActiveConfig(c,true)})()")
b.navigate('?workspace=config-studio&tab=workflows');value('section[aria-label="工作流编辑区域"] select','v3-wrp_warp');click('读取')
b.evaluate("document.querySelector('input[aria-label=\"编辑用标准工作流\"]').click()")
b.wait("!!document.querySelector('[role=dialog][aria-label=\"编辑工作流资格与回填测试\"]')")
assert b.evaluate('document.getElementById("root").inert')
b.wait("document.querySelector('[role=dialog][aria-label=\"编辑工作流资格与回填测试\"]').getAttribute('aria-busy')==='false'")
assert b.evaluate("document.querySelector('input[aria-label=\"编辑用标准工作流\"]').checked")
click('关闭报告');assert not b.evaluate('document.getElementById("root").inert');click('保存');b.wait("!document.querySelector('section[aria-label=\"工作流编辑区域\"] textarea')")
value('section[aria-label="工作流编辑区域"] select','v3-tpp_teleport');click('读取');b.evaluate("document.querySelector('input[aria-label=\"编辑用标准工作流\"]').click()")
b.wait("document.querySelector('[role=dialog][aria-label=\"编辑工作流资格与回填测试\"]')?.getAttribute('aria-busy')==='false'")
assert not b.evaluate("document.querySelector('input[aria-label=\"编辑用标准工作流\"]').checked")
assert b.evaluate("document.querySelector('[role=dialog]').textContent.includes('不能包含额外绘制')")
click('关闭报告');click('放弃草稿');checks.append('real success/failure conversion modal isolates background; WRP enables and saves; TPP reports page/auxiliary failure and remains disabled')
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html?edit=1&final=1'});b.wait('!!window.workflowAcceptance?.measurement',40)
b.evaluate('window.confirm=()=>true;window.alerts=[];window.alert=m=>window.alerts.push(m)')
click('测绘');click('开始测绘(完整)')
if not b.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='导入数据'&&e.getBoundingClientRect().height)"):click('测绘')
click('导入数据');fixture=json.loads((root/'scripts/config-tools/fixtures/v1-workflow-output-parity.json').read_text(encoding='utf-8'))['cases'][-1]['expectedRecord']
value('textarea[placeholder^="批量 JSON"]',json.dumps([fixture]));click('导入');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
baseline=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]');click('展开工具栏');click('编辑');b.wait("!!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
assert b.evaluate("document.querySelector('section[aria-label=\"V3 工作流式编辑\"] input').getAttribute('aria-label')")=='编辑要素 ID'
assert b.evaluate("document.querySelector('input[aria-label=\"编辑要素 ID\"]').value")==baseline['ID']
assert not b.evaluate("document.querySelector('section[aria-label=\"V3 工作流式编辑\"]').textContent.includes('字符简称')")
value('[data-edit-control="wrp_warp-Name-B"] input','Changed in actual UI');value('input[aria-label="工作流编辑人"]','actual-r9-editor');click('放弃要素编辑')
assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')==baseline
assert not b.evaluate("!!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
checks.append('actual layer edit hydrates original ID and ordinary inputs, removes ID-only abbreviation, enters drawing; cancel restores the original record without adding a layer')
click('编辑');value('[data-edit-control="wrp_warp-Name-B"] input','Changed in actual UI');value('input[aria-label="工作流编辑人"]','actual-r9-editor');click('保存编辑图层');b.wait("!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().length')==1
record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]');assert record['Name']=='Changed in actual UI' and record['ID']==baseline['ID'] and record['CreateBy']==baseline['CreateBy'] and record['ModifityBy']=='actual-r9-editor'
click('编辑');b.evaluate("window.workflowAcceptance.setWorld('eden')");b.wait("document.querySelector('section[aria-label=\"V3 工作流式编辑\"]').closest('fieldset').disabled")
assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().length')==1
b.evaluate("window.workflowAcceptance.setWorld('zth')");b.wait("!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]').closest('fieldset').disabled");click('放弃要素编辑')
checks.append('actual save replaces one existing layer and preserves creation metadata; world mismatch disables editor/drawing until original world resumes')
assert not b.evaluate('window.alerts.length'),b.evaluate('window.alerts');assert not b.errors,b.errors
b.screenshot('r9-native-edit.png')
(OUT/'r9-final-workflow-edit-acceptance.json').write_text(json.dumps({'checks':checks,'baseline':baseline,'updated':record,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
