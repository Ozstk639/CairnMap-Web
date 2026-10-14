import json,time
from pathlib import Path
from browser_check import Browser,OUT
b=Browser();checks=[];root=Path(__file__).resolve().parents[3]
def click(label):
 b.evaluate("(()=>{const e=[...document.querySelectorAll('button,summary')].find(e=>(e.textContent.trim()==="+json.dumps(label)+"||e.getAttribute('aria-label')==="+json.dumps(label)+"||e.title==="+json.dumps(label)+")&&e.getBoundingClientRect().height);if(!e||e.disabled)throw Error('Missing enabled '+"+json.dumps(label)+");e.click();})()");time.sleep(.15)
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing input '+"+json.dumps(selector)+");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(str(data))+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
b.navigate('?workspace=config-studio')
if b.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent==='放弃草稿'&&!e.disabled)"):click('放弃草稿')
b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),m=await import('/src/configStudio/r9Migration.ts');await p.persistActiveConfig(m.migrateConfigToR9(await p.loadDefaultConfig()),true)})()")
b.navigate('?workspace=config-studio&tab=workflows');value('section[aria-label="工作流编辑区域"] select','external-trp-integrated');click('读取')
value('select[aria-label="外部引用用途"]','edit');assert b.evaluate("document.body.innerText.includes('外部编辑完成品')")
assert b.evaluate("document.querySelector('input[aria-label=\"在便捷测绘中可选\"]').disabled&&!document.querySelector('input[aria-label=\"在便捷测绘中可选\"]').checked")
assert b.evaluate("[...document.querySelector('select[aria-label=\"外部引用方案\"]').options].map(o=>o.value)")==['tradePointEditor']
assert not b.evaluate("!!document.querySelector('input[aria-label=\"编辑用标准工作流\"]')")
checks.append('actual external header exposes capture/edit purpose; edit lists only registered TRP finished editor and locks capture visibility off without standard conversion')
click('放弃草稿')
fixture=json.loads((root/'scripts/config-tools/fixtures/v1-trp-editing-reference.json').read_text(encoding='utf-8'))
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html?edit=1'});b.wait('!!window.workflowAcceptance?.measurement',40)
b.evaluate("(()=>{const D=Date;window.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-10-12T00:00:00Z']));}static now(){return D.now();}};window.confirm=()=>true;window.alerts=[];window.alert=m=>window.alerts.push(m);})()")
click('测绘');click('开始测绘(完整)');click('导入数据');value('textarea[placeholder^="批量 JSON"]',json.dumps([test['original'] for test in fixture['cases']]));click('导入');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===3')
def open_record(identifier):
 b.evaluate("(()=>{const row=[...document.querySelectorAll('div')].find(e=>e.className.includes('whitespace-nowrap')&&e.textContent.includes("+json.dumps(identifier)+"));if(!row)throw Error('Layer row missing');const toggle=row.querySelector('button[title=\"展开工具栏\"]');if(toggle)toggle.click();})()");time.sleep(.1)
 b.evaluate("(()=>{const row=[...document.querySelectorAll('div')].find(e=>e.className.includes('whitespace-nowrap')&&e.textContent.includes("+json.dumps(identifier)+"));const edit=[...row.querySelectorAll('button')].find(e=>e.textContent==='编辑');if(!edit||edit.disabled)throw Error('Editor unavailable');edit.click();})()");b.wait("!!document.querySelector('section[aria-label=\"TRP 外部工作流式编辑\"]')")
for test in fixture['cases']:
 identifier=test['original']['ID'];open_record(identifier)
 assert b.evaluate("document.querySelector('section[aria-label=\"TRP 外部工作流式编辑\"] input').closest('[data-editor-field]').getAttribute('data-editor-field')")=='ID'
 assert b.evaluate("!!document.querySelector('[data-editor-field=Trade] button')&&document.querySelector('[data-editor-field=Trade]').textContent.includes('提供物品')")
 assert b.evaluate("document.querySelector('[data-editor-field=Trade] input[type=number]').value")=='0'
 assert not b.evaluate("document.querySelector('section[aria-label=\"TRP 外部工作流式编辑\"]').textContent.includes('字符简称')")
 assert b.evaluate("document.querySelector('section[aria-label=\"结构化标签与扩展\"]').textContent.includes('标签')")
 value('[data-editor-field="Name"] input','V1 edited TRP '+str(test['case']))
 if test['case']==0:
  click('放弃要素编辑');assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().find(r=>r.ID==='+json.dumps(identifier)+')')==test['original'];open_record(identifier);value('[data-editor-field="Name"] input','V1 edited TRP 0')
 if test['case']==1:b.evaluate("(()=>{const e=document.querySelectorAll('[data-editor-field=Trade] input[type=number]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}));})()")
 if test['case']==2:
  value('[data-editor-field="ID"] input','ZTRP_RENAMED');value('select[aria-label="工作流分类 Kind"]','SPE');value('select[aria-label="工作流分类 SKind"]','SPE');value('[data-editor-field="elevation"] input','-2')
 b.evaluate("(()=>{const panel=document.querySelector('section[aria-label=\"TRP 外部工作流式编辑\"]');const label=[...panel.querySelectorAll('label')].find(e=>e.textContent==='编辑者ID');const input=label.parentElement.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'editing-user');input.dispatchEvent(new Event('input',{bubbles:true}));})()")
 click('保存编辑图层');b.wait("!document.querySelector('section[aria-label=\"TRP 外部工作流式编辑\"]')")
 expected=test['updated'].copy()
 if isinstance(expected.get('elevation'),str):expected['elevation']=float(expected['elevation'])
 record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().find(r=>r.ID==='+json.dumps(expected['ID'])+')');assert record==expected,json.dumps({'case':test['case'],'actual':record,'expected':expected},ensure_ascii=False)
 assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().length')==3
 checks.append('TRP '+str(test['case'])+': actual special Trade editor, original backfill and one-layer replacement record equal frozen V1 after declared numeric-string normalization')
open_record('ZTRP_RENAMED');b.evaluate("window.workflowAcceptance.setWorld('eden')");b.wait("document.querySelector('section[aria-label=\"TRP 外部工作流式编辑\"]').closest('fieldset').disabled");b.evaluate("window.workflowAcceptance.setWorld('zth')");b.wait("!document.querySelector('section[aria-label=\"TRP 外部工作流式编辑\"]').closest('fieldset').disabled");click('放弃要素编辑')
click('切换到快捷模式');assert not b.evaluate("[...document.querySelectorAll('select option')].some(o=>o.value==='v3-editor-trp-external')")
checks.append('external cancel/world pause preserve source layer; finished editor remains absent from capture options')
assert not b.evaluate('window.alerts.length'),b.evaluate('window.alerts');assert not b.errors,b.errors
b.screenshot('r9-trp-external-edit.png');(OUT/'r9-trp-edit-acceptance.json').write_text(json.dumps({'checks':checks,'records':b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()'),'declaredMigration':'finite numeric string elevation -> number; frozen raw reference retained','runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
