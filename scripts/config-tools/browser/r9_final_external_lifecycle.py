import json,time
from browser_check import Browser,OUT
b=Browser();results=[]
def clock():b.evaluate("(() => {const D=Date;window.Date=class extends D {constructor(...a){if(a.length)super(...a);else super('2026-10-07T00:00:00Z')} static now(){return D.now()}};window.alerts=[];window.alert=m=>window.alerts.push(m)})()")
def fill():
 b.evaluate("""(() => {for(const e of window.externalScope.querySelectorAll('input,textarea')){if(!e.getBoundingClientRect().height||e.disabled||e.type==='checkbox'||e.type==='radio'||e.type==='color')continue;const label=e.closest('label')?.textContent??e.parentElement.textContent;const v=label.includes('色号')?'2277aa':e.type==='number'?'1':'EXTERNAL';const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()""")
 time.sleep(.15)
def draw(points=1):
 for x,y in [(700,650),(900,650),(850,750)][:points]:
  for typ in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':typ,'button':'left','clickCount':1,'x':x,'y':y})
  time.sleep(.12)
def begin(mode,kind):
 if mode=='v1':
  key={'railway':'railwayWorkflow','station':'stationWorkflow','trp':'tradePointWorkflow'}[kind]
  b.call('Page.navigate',{'url':'http://127.0.0.1:5189/scripts/config-tools/v1-workflow-oracle.html?componentKey='+key});b.wait('!!window.v1WorkflowOracle');b.evaluate('void (window.externalScope=document.querySelector("aside"))')
 else:
  b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html?final=1'});b.wait('!!window.workflowAcceptance?.measurement');b.click('测绘');b.click('开始测绘(快捷)')
  workflow='external-'+kind+'-integrated'
  b.evaluate("(() => {const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==="+json.dumps(workflow)+"));s.value="+json.dumps(workflow)+";s.dispatchEvent(new Event('change',{bubbles:true}));})()")
  b.click('开始');b.wait("document.body.innerText.includes('填写者ID')")
  b.evaluate("void (window.externalScope=[...document.querySelectorAll('fieldset')].find(e=>e.innerText.includes('填写者ID')))")
 clock();fill();b.click('下一步')
for kind in ['railway','station','trp']:
 row={'workflow':kind}
 for mode in ['v1','v3']:
  begin(mode,kind)
  if kind=='railway':
   b.evaluate("(() => {const s=window.externalScope.querySelector('select');s.value='其他';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   draw(2);b.click('下一步');fill();b.click('完成并输出')
  elif kind=='station':
   fill();b.click('下一步');fill();draw(3);b.click('下一步')
   draw(3);b.click('下一步');fill();draw();b.click('下一步');fill();draw();b.click('下一步');fill();draw();b.click('下一步')
  else:
   b.evaluate("(() => {const s=window.externalScope.querySelector('select');s.value=[...s.options].find(o=>o.value).value;s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   fill();b.click('下一步');b.click('添加交易');b.click('添加提供物品');b.click('添加获得物品');fill();b.click('下一步');fill();draw();b.click('下一步')
  time.sleep(.4)
  records=b.evaluate('window.v1WorkflowOracle.records' if mode=='v1' else 'window.workflowAcceptance.measurement.getCommittedFeatures()')
  assert records,(mode,kind,b.evaluate('document.body.innerText')[-6000:])
  assert not b.evaluate('window.alerts'),b.evaluate('window.alerts')
  row[mode]=records;b.screenshot('external-'+kind+'-'+mode+'.png')
 assert row['v1']==row['v3'],json.dumps(row,ensure_ascii=False)
 results.append(row);print('external lifecycle: '+kind+' complete records match: '+str(len(row['v3'])),flush=True)
assert not b.errors,b.errors
(OUT/'r9-final-external-lifecycle.json').write_text(json.dumps({'sourceSha':'0b82863d4fea3791f98917ba6d13f70e1f27eb15','reference':'actual frozen component + formatter, test capture bridge','candidate':'actual production MeasuringModule + external host','results':results,'errors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
