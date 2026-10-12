"""Actual array editor/undo/redo and multipart/hole preservation, not state injection."""
import json,time
from pathlib import Path
from browser_check import Browser,OUT
b=Browser();root=Path(__file__).resolve().parents[3];checks=[]
def click(label):
 b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>(e.textContent.trim()==="+json.dumps(label)+"||e.title==="+json.dumps(label)+")&&e.getBoundingClientRect().height);if(!e||e.disabled)throw Error('Unavailable '+"+json.dumps(label)+");e.click();})()");time.sleep(.15)
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing input');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(str(data))+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
fixture=next(c['expectedRecord'] for c in json.loads((root/'scripts/config-tools/fixtures/v1-workflow-output-parity.json').read_text(encoding='utf-8'))['cases'] if c['schemaKey']=='bud_building')
fixture['ID']='R9_MULTI_BUD';fixture['opaque']={'kept':0,'flag':False}
fixture['CoordG']=[[[[0,-64,0],[100,-64,0],[100,-64,100],[0,-64,100]],[[20,-64,20],[30,-64,20],[30,-64,30]]],[[[300,-64,0],[400,-64,0],[400,-64,100],[300,-64,100]]]]
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html?edit=1&final=1'});b.wait('!!window.workflowAcceptance?.measurement',40)
b.evaluate('window.confirm=()=>true;window.alerts=[];window.alert=m=>window.alerts.push(m)')
click('测绘');click('开始测绘(完整)');click('导入数据');value('textarea[placeholder^="批量 JSON"]',json.dumps([fixture]));click('导入');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
baseline=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]');click('展开工具栏');click('编辑');b.wait("!!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
assert b.evaluate("document.querySelector('select[aria-label=\"部件编号\"]').options.length")==2
value('select[aria-label="部件编号"]','0')
assert b.evaluate("document.querySelector('select[aria-label=\"内部洞编号\"]').options.length")==1
value('input[aria-label="工作流编辑人"]','multipart-r9-editor')
selector='textarea[placeholder^="请输入严格 JSON 数组"]'
def array_change(coords,undo=False):
 click('数组编辑');b.wait('!!document.querySelector('+json.dumps(selector)+')')
 before=b.evaluate('document.querySelector('+json.dumps(selector)+').value');value(selector,json.dumps(coords))
 if undo:
  click('撤回');assert b.evaluate('document.querySelector('+json.dumps(selector)+').value')==before
  click('恢复');assert json.loads(b.evaluate('document.querySelector('+json.dumps(selector)+').value'))==coords
 click('校验');click('完成');b.wait('!document.querySelector('+json.dumps(selector)+')')
outer=fixture['CoordG'][0][0];outer[1][0]=110;array_change(outer,True)
value('select[aria-label="部件编号"]','1');second=fixture['CoordG'][1][0];second[1][0]=410;array_change(second)
value('select[aria-label="部件编号"]','0');click('编辑所选内洞');hole=fixture['CoordG'][0][1];hole[1][0]=35;array_change(hole)
click('保存编辑图层');b.wait("!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
assert record['CoordG']==fixture['CoordG'],(record['CoordG'],fixture['CoordG'])
assert record['opaque']==baseline['opaque'] and record['CreateBy']==baseline['CreateBy'] and record['ID']==baseline['ID']
assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().length')==1
checks.append('actual BUD edit restores two parts and one hole; array undo/redo, both outer rings and hole edits save latest coordinates into one original layer')
click('编辑');value('select[aria-label="部件编号"]','1');changed=json.loads(json.dumps(record['CoordG'][1][0]));changed[0][0]=290;array_change(changed);click('放弃要素编辑')
assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')==record
checks.append('cancel after a real multipart geometry modification restores the complete saved record, all rings and unknown data')
assert not b.evaluate('window.alerts.length'),b.evaluate('window.alerts');assert not b.errors,b.errors
b.screenshot('r9-final-multipart-edit.png');(OUT/'r9-final-multipart-edit-acceptance.json').write_text(json.dumps({'checks':checks,'baseline':baseline,'updated':record,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False),flush=True)
