"""Read real form DOM order, including group headers before any items are added."""
import json
from browser_check import Browser,OUT
b=Browser();rows=[]
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html'});b.wait('!!window.workflowAcceptance?.measurement',40)
workflows=b.evaluate("window.workflowAcceptance.config.workflows.filter(w=>w.mode==='composed')")
for workflow in workflows:
 b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html'});b.wait('!!window.workflowAcceptance?.measurement',40)
 b.click('测绘');b.click('开始测绘(快捷)')
 b.evaluate("(()=>{const s=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==="+json.dumps(workflow['id'])+"));s.value="+json.dumps(workflow['id'])+";s.dispatchEvent(new Event('change',{bubbles:true}));})()")
 b.click('开始');b.wait("!!document.querySelector('input[aria-label=填写人]')")
 b.evaluate("(()=>{const i=document.querySelector('input[aria-label=填写人]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'form-order-audit');i.dispatchEvent(new Event('input',{bubbles:true}));})()")
 b.click('下一页')
 actual=b.evaluate("[...document.querySelectorAll('[data-workflow-control]')].map(e=>({id:e.getAttribute('data-workflow-control'),text:e.firstElementChild.textContent}))")
 schema=workflow['id'][3:];controls={control['id']:control for step in workflow['steps'] for control in step.get('controls',[])}
 keys=['classification' if controls[row['id']]['kind']=='classificationPicker' else 'annotations' if controls[row['id']]['kind']=='tagsExtensions' else row['id'][len(schema)+1:-(len(controls[row['id']]['slot'])+1)] for row in actual]
 assert keys[-1]=='annotations',(schema,keys)
 def before(first,last):assert keys.index(first)<keys.index(last),(schema,keys,first,last)
 before('Name','abbr')
 for optional in ['nomenclator','wiki','brief']:
  if optional in keys:before('abbr',optional)
 if schema in ['bud_building','flr_unit','rod_road']:before('Name','catAbbr');before('catAbbr','abbr')
 if schema=='rod_road':
  for functional in ['Level','Oneway','Enter','Exit','SelfJunction']:before(functional,'Name')
  before('abbr','ConnectL');before('ConnectL','Blacklist');before('Blacklist','Mode');before('Mode','Speed')
 if schema=='tpp_teleport':before('wiki','TGTWarp')
 if schema=='wrp_warp':before('abbr','WRPointI2D')
 rows.append({'workflowId':workflow['id'],'actualDomKeys':keys,'actualTitles':actual})
assert len(rows)==17 and not b.errors,(len(rows),b.errors)
(OUT/'r8-form-order-acceptance.json').write_text(json.dumps({'cases':rows,'source':'real r8 production MeasuringModule form DOM; relative order requirements from frozen V1 component audit and approved feedback','runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print('All 17 actual form DOM orders, auxiliary abbreviations and road groups: OK')
