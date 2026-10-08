"""Author a new field input in Studio, then submit its values in the real host."""
import json,time
from browser_check import Browser,OUT
b=Browser()
def value(selector,data):
 b.evaluate("""(() => {const e=document.querySelector("""+json.dumps(selector)+""");if(!e)throw Error('Missing '+"""+json.dumps(selector)+""");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"""+json.dumps(str(data))+""");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()""")
b.navigate('?workspace=config-studio')
backup=b.evaluate("sessionStorage.getItem('cairnmap-config-studio-saved')")
try:
 b.evaluate("""(async()=>{const {createConfigPackageFromCurrentProject}=await import('/src/configStudio/legacyProjectAdapter.ts');const c=createConfigPackageFromCurrentProject();c.nodes.find(n=>n.path.class==='WRP'&&!n.path.kind).fields.push({fieldId:'acceptance-values',key:'tags.acceptanceValues',scope:'tags',type:'number',cardinality:'multiple',input:'text',required:false,labels:{zh:'验收数值',en:''},description:{zh:'',en:''},defaultValue:[1,2],scenes:{workflow:true}});sessionStorage.setItem('cairnmap-config-studio-saved',JSON.stringify(c));})()""")
 b.navigate('?workspace=config-studio&tab=workflows')
 value('section[aria-label="工作流编辑区域"] select','v3-wrp_warp')
 b.click('读取');b.wait('!!document.querySelector("select[aria-label=\\"添加输入的字段\\"]")')
 value('select[aria-label="添加输入的字段"]','tags.acceptanceValues')
 b.click('按字段添加输入与绑定');b.click('保存')
 b.wait('!document.querySelector("select[aria-label=\\"添加输入的字段\\"]")')
 saved=b.evaluate("JSON.parse(sessionStorage.getItem('cairnmap-config-studio-saved'))")
 workflow=next(w for w in saved['workflows'] if w['id']=='v3-wrp_warp')
 assignment=next(a for a in workflow['outputs'][0]['assignments'] if a['target']=='tags.acceptanceValues')
 control=next(c for s in workflow['steps'] for c in s.get('controls',[]) if c.get('slot')==assignment['expression'])
 assert control['kind']=='group' and control['defaultValue']==[1,2]
 b.screenshot('field-workflow-binding.png')
 b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html'});b.wait('!!window.workflowAcceptance?.measurement')
 b.evaluate('window.workflowAcceptance.setConfig('+json.dumps(saved)+')');time.sleep(.3)
 b.click('测绘');b.click('开始测绘(快捷)')
 b.evaluate("(() => {const s=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='v3-wrp_warp'));s.value='v3-wrp_warp';s.dispatchEvent(new Event('change',{bubbles:true}));})()")
 b.click('开始');b.wait('!!document.querySelector("input[aria-label=填写人]")');value('input[aria-label=填写人]','binding-user');b.click('下一页')
 for step in workflow['steps'][1:]:
  for c in step.get('controls',[]):
   selector='[data-workflow-control='+json.dumps(c['id'])+']'
   if c['id']==control['id']:
    initial=b.evaluate('[...document.querySelector('+json.dumps(selector)+').querySelectorAll("input")].map(e=>e.value)');assert initial==['1','2'],initial
    value(selector+' fieldset:nth-of-type(1) input',3);value(selector+' fieldset:nth-of-type(2) input',4)
   elif c['kind']=='classificationPicker':
    b.evaluate("(() => {const s=document.querySelector("+json.dumps(selector+' select')+");s.value=[...s.options].find(o=>o.value&&o.value!=='').value;s.dispatchEvent(new Event('change',{bubbles:true}));})()")
   elif c['kind'] in ['text','number']:value(selector+' input','12' if c['kind']=='number' else 'binding-value')
  if step['kind']=='geometry':
   b.click('进入绘制');point=b.evaluate('window.workflowAcceptance.screenPointAt(20,13)')
   for typ in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':typ,'button':'left','clickCount':1,**point})
   b.click('采用当前绘制')
  b.click('确认保存输出' if step is workflow['steps'][-1] else '下一页')
 b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
 record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
 assert record['tags']['acceptanceValues']==[3,4],record
 assert not b.errors,b.errors
 b.screenshot('field-workflow-native-submit.png')
 (OUT/'field-binding-browser-result.json').write_text(json.dumps({'checks':['Studio field-to-control binding and save','numeric-array defaults in actual Runner','edited numeric array in production committed record'],'control':control,'assignment':assignment,'record':record,'errors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
 print('field binding: actual Studio authoring -> default array -> real native submission: OK')
finally:
 if backup is not None:b.evaluate('sessionStorage.setItem("cairnmap-config-studio-saved",'+json.dumps(backup)+')')
