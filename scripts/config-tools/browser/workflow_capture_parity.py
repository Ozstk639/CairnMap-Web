import json, time
from browser_check import Browser, OUT
b=Browser()
def set_input(fragment,value):
    b.evaluate("""(() => {const i=[...document.querySelectorAll('input')].find(e=>e.getBoundingClientRect().height&&(e.closest('label')?.textContent??e.parentElement.textContent).includes("""+json.dumps(fragment)+"""));if(!i)throw Error('Input missing: '+"""+json.dumps(fragment)+""" );Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,"""+json.dumps(str(value))+""");i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()""")
def map_click(x,y):
    for event in ['mousePressed','mouseReleased']: b.call('Input.dispatchMouseEvent',{'type':event,'button':'left','clickCount':1,'x':x,'y':y})
    time.sleep(.2)
def freeze_time():
    b.evaluate("(() => {const OriginalDate=Date;window.Date=class extends OriginalDate { constructor(...args){if(args.length)super(...args);else super('2026-10-07T00:00:00Z');}static now(){return OriginalDate.now();} };return true;})()")
b.call('Page.navigate',{'url':'http://127.0.0.1:5189/scripts/config-tools/v1-workflow-oracle.html'})
b.wait('!!window.v1WorkflowOracle');freeze_time();set_input('填写者ID','capture-author');b.click('下一步')
b.evaluate("(() => {const s=document.querySelector('select');s.value='NOM|NOM';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
set_input('名称','Captured teleport');set_input('字符简称','CAPTURE');b.click('下一步');b.wait('window.v1WorkflowOracle.drawing')
set_input('elevation',0);map_click(700,650);b.click('下一步');b.wait("document.body.innerText.includes('请在地图上点选目标点坐标')")
set_input('TGTelevation',32);map_click(900,750);b.click('下一步');b.wait('window.v1WorkflowOracle.records.length===1')
v1=b.evaluate('window.v1WorkflowOracle.records[0]');b.screenshot('workflow-capture-frozen-v1.png')
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html'})
b.wait('!!window.workflowAcceptance?.measurement');freeze_time();b.click('测绘');b.click('开始测绘(快捷)')
b.evaluate("(() => {const s=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='v3-tpp_teleport'));s.value='v3-tpp_teleport';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
b.click('开始');b.wait("!!document.querySelector('input[aria-label=填写人]')");set_input('填写人','capture-author');b.click('下一页')
for level,title in [('kind','Kind'),('skind','SKind')]:
 b.evaluate("(() => {const s=document.querySelector('select[aria-label=\"工作流分类 "+title+"\"]');s.value='NOM';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
set_input('名称','Captured teleport');set_input('字符简称','CAPTURE');b.click('下一页')
set_input('起点高度',0);map_click(700,650);b.click('下一页')
b.click('确认保存输出');time.sleep(.3)
assert b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().length')==0,'missing target must block writes'
assert b.evaluate('document.querySelector(\"[data-workflow-step]\").innerText.includes(\"目标点坐标\")')
set_input('目标点高度',32);map_click(900,750);b.click('确认保存输出')
b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
v3=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
v1['World']='zth' # Declared canonical World migration: numeric 0 -> zth.
assert v3==v1, json.dumps({'v1':v1,'v3':v3},ensure_ascii=False)
assert not b.errors, b.errors
b.screenshot('workflow-capture-native-v3.png')
(OUT/'workflow-capture-parity.json').write_text(json.dumps({'sourceSha':'0b82863d4fea3791f98917ba6d13f70e1f27eb15','frozenV1Component':True,'nativeProductionHost':True,'missingTargetBlocksCommit':True,'v1':v1,'v3':v3,'errors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print('workflow capture browser: frozen actual V1 component vs production V3 host, complete record equality: OK')
