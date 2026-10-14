"""New r8 paths through the actual MeasuringModule and native host."""
import json,time
from browser_check import Browser,OUT
b=Browser();checks=[]
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing '+"+json.dumps(selector)+");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(str(data))+ ");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
def start(identifier,path,patch=None):
 b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/workflow-acceptance.html'})
 b.wait('!!window.workflowAcceptance?.measurement',40)
 if patch:b.evaluate(patch);time.sleep(.2)
 b.evaluate("(()=>{const D=Date;window.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-10-07T00:00:00Z']));}static now(){return D.now();}};})()")
 b.click('测绘');b.click('开始测绘(快捷)')
 b.evaluate("(()=>{const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==="+json.dumps(identifier)+"));s.value="+json.dumps(identifier)+";s.dispatchEvent(new Event('change',{bubbles:true}));})()")
 b.click('开始');b.wait("!!document.querySelector('input[aria-label=填写人]')")
 value('input[aria-label=填写人]','r8-ui-author');b.click('下一页')
 for level,title in [('class','Class'),('kind','Kind'),('skind','SKind'),('skind2','SKind2')]:
  selector='select[aria-label="工作流分类 '+title+'"]'
  if b.evaluate('!!document.querySelector('+json.dumps(selector)+')'):value(selector,path[level])
 workflow=b.evaluate('window.workflowAcceptance.config.workflows.find(w=>w.id==='+json.dumps(identifier)+')')
 for control in workflow['steps'][1].get('controls',[]):
  selector='[data-workflow-control='+json.dumps(control['id'])+']'
  if '-Name-' in control['id']:value(selector+' input','R8 lake' if path['class']=='ISG' else 'R8 teleport')
  elif '-abbr-' in control['id']:value(selector+' input','R8_LAKE' if path['class']=='ISG' else 'R8_TPP')
  elif '-nomenclator-' in control['id']:value(selector+' input','automatic author')
 return workflow
def point(x,z):
 screen=b.evaluate('window.workflowAcceptance.screenPointAt('+str(x)+','+str(z)+')')
 for event in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':event,'button':'left','clickCount':1,**screen})
 time.sleep(.08)
def count():return b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures().length')
def extension(index,group,key,kind,data=''):
 row='section[aria-label="结构化标签与扩展"] > fieldset:nth-of-type(2) > div:nth-of-type('+str(index)+')'
 value(row+' input[aria-label="扩展组名"]',group);value(row+' input[aria-label="扩展字段名"]',key);value(row+' select[aria-label="标签扩展值类型"]',kind)
 if kind!='null':value(row+(' select' if kind=='bool' else ' input')+'[aria-label="标签扩展值"]',data)
def add_extension():b.click('添加扩展行')
path={'class':'ISG','kind':'NGF','skind':'WTB','skind2':'LKE'}
workflow=start('v3-isg_ngf_wtb',path)
assert workflow['steps'][1]['controls'][-1]['kind']=='tagsExtensions'
assert all(step['kind']!='tagsExtensions' for step in workflow['steps'])
assert b.evaluate('document.querySelectorAll('+json.dumps('section[aria-label="结构化标签与扩展"] > fieldset > div')+').length')==2
tag='section[aria-label="结构化标签与扩展"] > fieldset:nth-of-type(1)'
value(tag+' input[aria-label="标签字段名"]','auditText');value(tag+' input[aria-label="标签扩展值"]','  preserve spaces  ')
extension(1,'audit','zero','number','0');add_extension();extension(2,'audit','flag','bool','false');add_extension();extension(3,'audit','none','null')
checks.append('first information page has one movable fixed module and at least one row per namespace')
b.click('下一页');point(20,13);point(70,13);b.click('确认保存输出')
assert count()==0 and b.evaluate('document.body.innerText.includes("至少需要 3 个坐标")')
point(70,38);b.click('采用当前绘制');point(20,38)
# Actual undo and redo must remain available after adoption.
b.click('撤销');b.click('重做');b.click('确认保存输出');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
assert len(record['CoordG'][0][0])==4 and record['tags']['auditText']=='  preserve spaces  '
assert record['extensions']['audit']=={'zero':0,'flag':False,'none':None}
checks.append('invalid two-point polygon retains editable draft; adoption followed by another point and undo/redo saves the latest four points')
# Independent expectation calls the untouched frozen formatter, not the candidate evaluator.
b.call('Page.navigate',{'url':'http://127.0.0.1:5189/scripts/config-tools/v1-workflow-oracle.html?componentKey=naturalWaterbodyWorkflow'})
b.wait('!!window.v1WorkflowOracle',40)
expected=b.evaluate("""(async()=>{const {getFormatDef,TAG_KEY_OTHER}=await import('/src/components/Common/featureFormats.ts');const {WORKFLOW_EDITOR_SCHEMAS}=await import('/src/components/Common/workflowEditorRegistry/index.ts');const schema=WORKFLOW_EDITOR_SCHEMAS.find(s=>s.schemaKey==='isg_ngf_wtb');const result=getFormatDef(schema.match.subType).buildFeatureInfo({op:'create',mode:'polygon',values:{ID:'ZNGFWTBLKE_R8_LAKE',Name:'R8 lake',Kind:'NGF',SKind:'WTB',SKind2:'LKE'},groups:{tags:[{tagKey:'nomenclator',tagValue:'automatic author'},{tagKey:TAG_KEY_OTHER,tagKeyOther:'auditText',tagValue:'  preserve spaces  '}],extensions:[{extGroup:'audit',extKey:'zero',extType:'number',extValue:'0'},{extGroup:'audit',extKey:'flag',extType:'bool',extValue:'false'},{extGroup:'audit',extKey:'none',extType:'null',extValue:''}]},coords:[{x:20,y:-64,z:13},{x:70,y:-64,z:13},{x:70,y:-64,z:38},{x:20,y:-64,z:38}],editorId:'r8-ui-author',worldId:'zth',now:new Date('2026-10-07T00:00:00Z')});result.World='zth';return result;})()""")
assert record==expected,{'actual':record,'frozen':expected}
checks.append('typed custom rows and automatic nomenclator equal the complete frozen V1 formatter record')
start('v3-isg_ngf_wtb',path)
value('[data-workflow-control="isg_ngf_wtb-wiki-C"] input','https://example.invalid/wiki')
extension(1,'link','wiki','text','https://other.invalid/wiki');b.click('下一页')
for x,z in [(20,13),(70,13),(70,38)]:point(x,z)
b.click('确认保存输出');assert count()==0 and b.evaluate('document.body.innerText.includes("extensions.link.wiki")&&document.body.innerText.includes("不同值")')
b.click('上一页');extension(1,'link','wiki','text','https://example.invalid/wiki');b.click('下一页');b.click('确认保存输出');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
checks.append('automatic/custom duplicate path blocks different values and accepts identical values without silently replacing inputs')
tpp=start('v3-tpp_teleport',{'class':'TPP','kind':'NOM','skind':'NOM'})
b.click('下一页');value('[data-workflow-control="tpp_teleport-elevation"] input','0');point(20,13);b.click('下一页')
value('[data-workflow-control="tpp_teleport-target-elevation"] input','-2');point(70,38);point(75,40);b.click('确认保存输出')
assert count()==0 and b.evaluate('document.body.innerText.includes("单点")')
b.click('撤销');b.click('确认保存输出');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
tpp_record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
assert tpp_record['TGTcoordinate']=={'x':70,'y':-2,'z':38} and tpp_record['elevation']==0 and tpp_record['TGTelevation']==-2
checks.append('TPP single-point object rejects multiple points, permits undo and preserves zero/negative heights')
tpp=start('v3-tpp_teleport',{'class':'TPP','kind':'NOM','skind':'NOM'})
b.evaluate("window.workflowAcceptance.setRecords([{ID:'WARP_TEST',Name:'WARP_TEST',World:'zth',Class:'WRP',Kind:'NOM',SKind:'NOM'}])")
b.click('下一页');point(20,13);b.click('下一页');point(70,38);b.click('采用当前绘制')
b.click('上一页');b.click('上一页');value('[data-workflow-control="tpp_teleport-TGTWarp-F"] input','WARP_TEST');time.sleep(.25)
b.evaluate("[...document.querySelector('[data-workflow-control=tpp_teleport-TGTWarp-F]').querySelectorAll('button')].find(e=>e.textContent.includes('WARP_TEST')).click()")
b.click('下一页');b.click('确认保存输出');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
warp_record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
assert warp_record['TGTWarp']=='WARP_TEST' and 'TGTcoordinate' not in warp_record and 'TGTelevation' not in warp_record
checks.append('returning to F after target adoption skips the target page and excludes old coordinate/height residues')
start('v3-isg_ngf_wtb',path,"""(()=>{const c=structuredClone(window.workflowAcceptance.config),w=c.workflows.find(w=>w.id==='v3-isg_ngf_wtb');w.steps[1].controls.splice(-1,0,{id:'numeric-gate',slot:'NUMERIC_GATE',kind:'number',columns:1,label:{zh:'启动值',en:''}});w.outputs[0].when={token:'NUMERIC_GATE',operator:'equals',value:0};w.steps.push({id:'numeric-extra',kind:'geometry',geometryRole:'auxiliary',geometry:['LineString'],label:{zh:'条件额外线',en:''},when:{token:'NUMERIC_GATE',operator:'equals',value:0},drawing:{captureSlot:'EXTRA_LINE',returnFormat:'coordL',multiple:false,bindings:[{outputId:w.outputs[0].id,target:'extensions.audit.coords',value:'geometry'}]}});window.workflowAcceptance.setConfig(c);})()""")
value('[data-workflow-control=numeric-gate] input','0');b.click('下一页')
for x,z in [(20,13),(70,13),(70,38)]:point(x,z)
b.click('下一页');assert b.evaluate('document.querySelector("[data-workflow-step]").getAttribute("data-workflow-step")')=='numeric-extra'
point(80,38);point(100,48);b.click('确认保存输出');b.wait('window.workflowAcceptance.measurement.getCommittedFeatures().length===1')
numeric_record=b.evaluate('window.workflowAcceptance.measurement.getCommittedFeatures()[0]')
assert len(numeric_record['CoordG'][0][0])==3 and numeric_record['extensions']['audit']['coords']==[[[80,-64,38],[100,-64,48]]]
checks.append('numeric condition 0 enables main and auxiliary line; next-page and final snapshots use the same typed slots')
assert not b.errors,b.errors
(OUT/'r8-workflow-acceptance.json').write_text(json.dumps({'checks':checks,'polygon':record,'frozenPolygon':expected,'tpp':tpp_record,'warpAfterTarget':warp_record,'numericCondition':numeric_record,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False),flush=True)
