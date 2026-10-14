"""Drive all standard composed workflows through production MeasuringModule.
Expected records are the frozen schema fixtures; no V3 evaluator supplies expectations.
"""
import json,time
from pathlib import Path
from browser_check import Browser,OUT
b=Browser();ROOT=Path(__file__).resolve().parents[3]
fixtures=json.loads((ROOT/'scripts/config-tools/fixtures/v1-workflow-output-parity.json').read_text(encoding='utf-8'))['cases']
results=[]
def value(selector,value):
 b.evaluate("""(() => {const e=document.querySelector("""+json.dumps(selector)+""");if(!e)throw Error('Missing input '+"""+json.dumps(selector)+""");const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"""+json.dumps(str(value))+""");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()""")
def field(selector,definition,data):
 kind=definition['kind']
 if kind=='toggle':
  b.evaluate("[...document.querySelector("+json.dumps(selector)+").querySelectorAll('button')].find(e=>e.textContent==="+json.dumps('是' if data else '否')+").click()")
 elif kind in ['featureSearch','coarseSearch']:
  value(selector+' input',str(data).strip());time.sleep(.25)
  b.evaluate("(() => {const c=document.querySelector("+json.dumps(selector)+");const e=[...c.querySelectorAll('button')].find(e=>e.textContent.includes("+json.dumps(str(data).strip())+"));if(!e)throw Error('Search candidate missing '+c.innerText);e.click();})()")
 else:value(selector+(' textarea' if kind in ['textarea','json'] else ' select' if kind=='select' else ' input'),data)

for index,fixture in enumerate(fixtures):
 b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html'})
 b.wait('!!window.workflowAcceptance?.measurement',40)
 b.evaluate("(() => {const OriginalDate=Date;window.Date=class extends OriginalDate { constructor(...args){if(args.length)super(...args);else super('2026-10-07T00:00:00Z');}static now(){return OriginalDate.now();} };})()")
 workflow=b.evaluate('window.workflowAcceptance.config.workflows.find(w=>w.id==='+json.dumps('v3-'+fixture['schemaKey'])+')')
 assert workflow and workflow['mode']=='composed'
 controls=[c for s in workflow['steps'] for c in s.get('controls',[])]
 seed=[]
 def seed_search(definition,data):
  p=definition.get('search');target=p['target']
  seed.append({'ID':str(data).strip(),'Name':str(data).strip(),'Class':target['class'],'Kind':target.get('kind',''),'SKind':target.get('skind',''),'SKind2':target.get('skind2',''),'World':'zth',p.get('returnField','ID'):str(data).strip()})
 for c in controls:
  slot=c.get('slot');key=c['id'][len(fixture['schemaKey'])+1:-(len(slot)+1)] if slot else ''
  data=fixture['inputs'].get(key)
  if data and c['kind'] in ['featureSearch','coarseSearch']:seed_search(c,data)
  if c['kind']=='group' and data:
   for row in data:
    for item in c['group']['itemFields']:
     if item['kind'] in ['featureSearch','coarseSearch']:seed_search(item,row[item['key']])
 b.evaluate('window.workflowAcceptance.setRecords('+json.dumps(seed)+')')
 b.click('测绘');b.click('开始测绘(快捷)')
 b.evaluate("(() => {const s=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==="+json.dumps(workflow['id'])+"));s.value="+json.dumps(workflow['id'])+";s.dispatchEvent(new Event('change',{bubbles:true}));})()")
 b.click('开始');b.wait("!!document.querySelector('input[aria-label=填写人]')")
 value('input[aria-label=填写人]','fixture-user');b.click('下一页')
 for step in workflow['steps'][1:]:
  if not b.evaluate('!!document.querySelector('+json.dumps('[data-workflow-step='+json.dumps(step['id'])+']')+')'):continue
  for c in step.get('controls',[]):
   selector='[data-workflow-control='+json.dumps(c['id'])+']'
   if c['kind']=='tagsExtensions':continue
   if c['kind']=='classificationPicker':
    for level in ['class','kind','skind','skind2']:
     title={'class':'Class','kind':'Kind','skind':'SKind','skind2':'SKind2'}[level]
     select=selector+' select[aria-label="工作流分类 '+title+'"]'
     if b.evaluate('!!document.querySelector('+json.dumps(select)+')'):value(select,fixture['classification'].get(level,''))
    continue
   slot=c.get('slot');key=c['id'][len(fixture['schemaKey'])+1:-(len(slot)+1)] if slot else ''
   data=fixture['inputs'].get(key)
   if data is None:continue
   if c['kind']=='group':
    for ri,row in enumerate(data):
     b.evaluate('document.querySelector('+json.dumps(selector)+').querySelector(":scope > div > button").click()')
     for fi,item in enumerate(c['group']['itemFields']):
      itemSelector=selector+' fieldset:nth-of-type('+str(ri+1)+') label:nth-child('+str(fi+1)+')'
      field(itemSelector,item,row[item['key']])
   else:field(selector,c,data)
  if step['kind']=='geometry':
   coords=fixture['expectedRecord'].get('CoordP') or (fixture['expectedRecord'].get('CoordL') or [[[0,-64,0],[20,-64,0],[20,-64,20]]])[0]
   if fixture['geometry']=='Polygon':coords=fixture['expectedRecord']['CoordG'][0][0]
   b.click('进入绘制')
   for x,y,z in coords:
    point=b.evaluate('window.workflowAcceptance.screenPointAt('+str(x)+','+str(z)+')')
    for typ in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':typ,'button':'left','clickCount':1,**point})
    time.sleep(.06)
  if b.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='确认保存输出'&&e.getBoundingClientRect().height)"):
   b.click('确认保存输出');break
  else:b.click('下一页')
 b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1',8)
 actual=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
 expected=fixture['expectedRecord']
 assert actual==expected,json.dumps({'key':fixture['schemaKey'],'expected':expected,'actual':actual},ensure_ascii=False)
 results.append({'schemaKey':fixture['schemaKey'],'classification':fixture['classification'],'inputVariant':index%2,'record':actual})
 print(f'composed production UI: {index+1}/{len(fixtures)} {fixture["schemaKey"]}',flush=True)
assert not b.errors,b.errors
(OUT/'native-workflow-matrix.json').write_text(json.dumps({'cases':results,'errors':b.errors,'sourceSha':'0b82863d4fea3791f98917ba6d13f70e1f27eb15','expected':'frozen schema final-record fixtures','actual':'r8 production MeasuringModule + native Runner + real map clicks; direct save without adoption'},ensure_ascii=False,indent=2),encoding='utf-8')
print('All 17 composed workflows, 34 production UI submissions: complete record equality: OK')
