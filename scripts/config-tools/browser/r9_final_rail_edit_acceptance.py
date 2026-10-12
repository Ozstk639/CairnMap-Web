import json,time
from pathlib import Path
from browser_check import Browser,OUT
b=Browser();checks=[];root=Path(__file__).resolve().parents[3]
fixture=json.loads((root/'scripts/config-tools/fixtures/v1-rail-editing-reference.json').read_text(encoding='utf-8'))
def click(label):
 b.evaluate("(()=>{const e=[...document.querySelectorAll('button,summary')].find(e=>(e.textContent.trim()==="+json.dumps(label)+"||e.getAttribute('aria-label')==="+json.dumps(label)+"||e.title==="+json.dumps(label)+")&&e.getBoundingClientRect().height);if(!e||e.disabled)throw Error('Missing enabled '+"+json.dumps(label)+");e.click();})()");time.sleep(.15)
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing input');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(str(data))+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html?edit=1&final=1'});b.wait('!!window.workflowAcceptance?.measurement',40)
b.evaluate("(()=>{const D=Date;window.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-10-12T00:00:00Z']));}static now(){return D.now();}};window.confirm=()=>true;window.alerts=[];window.alert=m=>window.alerts.push(m);})()")
click('测绘');click('开始测绘(完整)');click('导入数据');value('textarea[placeholder^="批量 JSON"]',json.dumps([test['original'] for test in fixture['cases']]));click('导入');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===7')
for test in fixture['cases']:
 code=test['classCode'];identifier=test['original']['ID']
 b.evaluate("(()=>{const row=[...document.querySelectorAll('div')].find(e=>e.className.includes('whitespace-nowrap')&&e.textContent.includes("+json.dumps(identifier)+"));if(!row)throw Error('Layer row missing');const toggle=row.querySelector('button[title=\"展开工具栏\"]');if(toggle)toggle.click();})()");time.sleep(.1)
 b.evaluate("(()=>{const row=[...document.querySelectorAll('div')].find(e=>e.className.includes('whitespace-nowrap')&&e.textContent.includes("+json.dumps(identifier)+"));const edit=[...row.querySelectorAll('button')].find(e=>e.textContent==='编辑');if(!edit||edit.disabled)throw Error('Editor unavailable');edit.click();})()");b.wait("!!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
 assert b.evaluate("document.querySelector('input[aria-label=\"编辑要素 ID\"]').value")==identifier
 if code=='PLF':
  assert b.evaluate("document.querySelector('[data-edit-control=edit-PLF-Situation] button.bg-slate-700').textContent")=='否'
  assert b.evaluate("document.querySelector('[data-edit-control=edit-PLF-lines] input[type=number]').value")=='0'
 if code=='RLE':assert b.evaluate("document.querySelector('[data-edit-control=edit-RLE-direction] select').value")=='0'
 value('[data-edit-control="edit-'+code+'-Name"] input','V1 edited '+code);value('input[aria-label="工作流编辑人"]','editing-user');click('保存编辑图层');b.wait("!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
 record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().find(r=>r.ID==='+json.dumps(identifier)+')');assert record==test['updated'],json.dumps({'class':code,'actual':record,'expected':test['updated']},ensure_ascii=False)
 assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().length')==7
 checks.append(code+': actual original backfill, ID first, typed inputs/repeat groups and full replacement record equal frozen V1 edit result')
b.evaluate("(()=>{const row=[...document.querySelectorAll('div')].find(e=>e.className.includes('whitespace-nowrap')&&e.textContent.includes('ZRLE_EDIT'));[...row.querySelectorAll('button')].find(e=>e.textContent==='编辑').click();})()");b.wait("!!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
click('方向反转');click('保存编辑图层');b.wait("!document.querySelector('section[aria-label=\"V3 工作流式编辑\"]')")
reversed_record=b.evaluate("window.workflowAcceptance.measurement.getCommittedFeatures().find(r=>r.ID==='ZRLE_EDIT')")
assert reversed_record['startplf']=='ZPLF_B' and reversed_record['endplf']=='ZPLF_A'
assert reversed_record['CoordL'][0]==list(reversed(fixture['cases'][0]['original']['CoordL'][0]))
checks.append('actual RLE direction reversal updates original line coordinates and swaps the new editor endpoint slots together')
click('切换到快捷模式')
assert not b.evaluate("[...document.querySelectorAll('select option')].some(o=>o.value.startsWith('v3-editor-'))")
checks.append('all seven edit-only plans are absent from actual quick-mapping options and never selected as capture defaults')
assert not b.evaluate('window.alerts.length'),b.evaluate('window.alerts');assert not b.errors,b.errors
b.screenshot('r9-rail-edit-templates.png');(OUT/'r9-final-rail-edit-acceptance.json').write_text(json.dumps({'checks':checks,'updatedRecords':b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()'),'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
