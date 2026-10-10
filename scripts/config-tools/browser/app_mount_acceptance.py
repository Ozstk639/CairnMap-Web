"""Actual App/Lab tool creation, mount toggles, real card, delete recovery and world UI."""
import json,time
from browser_check import Browser,OUT
from app_probe import PROBE,POINT
b=Browser();checks=[]
config=json.loads((OUT/'CairnMap_V32_FieldReuse_Drawing_r4.config.json').read_text(encoding='utf-8'))
workflow=next(w for w in config['workflows'] if w['id']=='v3-wrp_warp')
keys=['ria_temp_rule_sources_v1','ria_temp_rule_override_ids_v1','ria_temp_rule_delete_ids_v1']
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/?workspace=config-lab&configMode=v3'})
b.wait("!!document.querySelector('.leaflet-container')",40)
backup=b.evaluate('Object.fromEntries('+json.dumps(keys)+'.map(k=>[k,localStorage.getItem(k)]))')
draftBackup=b.evaluate("sessionStorage.getItem('cairnmap-config-studio-draft')")

def click(label):
 b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==="+json.dumps(label)+"&&e.getBoundingClientRect().height);if(!e||e.disabled)throw Error('Unavailable button '+"+json.dumps(label)+");e.click();return true;})()")
 time.sleep(.15)

def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing '+"+json.dumps(selector)+");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(str(data))+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()")

def labels():return b.evaluate("[...document.querySelectorAll('.leaflet-marker-icon')].map(e=>e.textContent.trim())")

try:
 b.evaluate('sessionStorage.setItem("cairnmap-config-studio-draft",'+json.dumps(json.dumps(config,ensure_ascii=False))+');'+''.join('localStorage.removeItem('+json.dumps(k)+');' for k in keys)+'true')
 b.call('Page.reload');b.wait("!!document.querySelector('.leaflet-container')",40);b.wait(PROBE,30)
 b.evaluate('window.confirm=()=>true;window.alerts=[];window.alert=m=>window.alerts.push(m);window.appProbe.map.setView([0,0],3,{animate:false});true')
 click('测绘')
 if b.evaluate("!!document.querySelector('#feature-module-dialog-title')"):click('下载并启用')
 b.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='开始测绘(快捷)'&&e.getBoundingClientRect().height)",40)
 click('开始测绘(快捷)')
 b.evaluate("(()=>{const s=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='v3-wrp_warp'));s.value='v3-wrp_warp';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
 click('开始');b.wait("!!document.querySelector('input[aria-label=填写人]')")
 value('input[aria-label=填写人]','bp10-ui-user');click('下一页')
 for step in workflow['steps'][1:]:
  for c in step.get('controls',[]):
   sel='[data-workflow-control='+json.dumps(c['id'])+']'
   if c['kind']=='classificationPicker':
    for title in ['Class','Kind','SKind','SKind2']:
     select=sel+' select[aria-label="工作流分类 '+title+'"]'
     if b.evaluate('!!document.querySelector('+json.dumps(select)+')'):b.evaluate("(()=>{const s=document.querySelector("+json.dumps(select)+");s.value=[...s.options].find(o=>o.value).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()")
   elif c['kind'] in ['text','number']:
    if '-Name-' in c['id']:value(sel+' input','BP10UI')
    elif '-abbr-' in c['id']:value(sel+' input','BP10_UI')
    elif c.get('required'):value(sel+' input','1' if c['kind']=='number' else 'BP10')
  if step['kind']=='geometry':
   click('进入绘制');b.evaluate(PROBE);point=b.evaluate('('+POINT+')(15,17)')
   for typ in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':typ,'button':'left','clickCount':1,**point})
  click('确认保存输出' if step is workflow['steps'][-1] else '下一页')
 b.wait(PROBE.replace('return map&&projection?', 'return map&&projection&&measurement?'),30)
 b.wait('window.appProbe.measurement.getCommittedFeatures().length===1')
 record=b.evaluate('window.appProbe.measurement.getCommittedFeatures()[0]')
 assert record['Class']=='WRP' and record['World']=='zth' and record['Name']=='BP10UI',record
 checks.append('actual App -> Lab -> lazy tool -> composed Runner -> drawing click -> complete commit')
 click('临时挂载');b.wait("document.body.innerText.includes('enabled=true')",60)
 b.wait("document.querySelector('.leaflet-container').innerText.includes('BP10UI')",40)
 b.evaluate(PROBE)
 assert any(r['featureInfo']['ID']==record['ID'] for r in b.evaluate('window.appProbe.records'))
 click('enabled=true');b.wait("!document.querySelector('.leaflet-container').innerText.includes('BP10UI')")
 click('enabled=false');b.wait("document.querySelector('.leaflet-container').innerText.includes('BP10UI')")
 checks.append('actual global mount and enabled true/false/true refresh the native labels and search data')
 pos=b.evaluate("(()=>{const e=[...document.querySelectorAll('.leaflet-marker-icon span')].find(e=>!e.children.length&&e.textContent.includes('BP10UI'));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
 for typ in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':typ,'button':'left','clickCount':1,**pos})
 b.wait("[...document.querySelectorAll('button[title=\"导入图层\"]')].some(e=>e.getBoundingClientRect().height)")
 assert b.evaluate("[...document.querySelectorAll('button[title=\"导入图层\"]')].find(e=>e.getBoundingClientRect().height).parentElement.parentElement.innerText.includes('BP10UI')")
 b.evaluate("(()=>{let p=[...document.querySelectorAll('button[title=\"导入图层\"]')].find(e=>e.getBoundingClientRect().height).parentElement;while(p){const e=[...p.querySelectorAll('button[aria-label=关闭],button[title=关闭]')].find(e=>e.getBoundingClientRect().height);if(e){e.click();return true;}p=p.parentElement;}throw Error('No card close');})()")
 checks.append('real pointer on the mounted label opens its actual native feature card')
 b.screenshot('app-workflow-mounted.png')
 # Delete selection is the existing UI; no storage injection creates the mark.
 click('删除要素');b.wait("document.body.innerText.includes('选择待删除要素')")
 value('input[placeholder="搜索 Name / ID / Class"]',record['ID'])
 b.wait("!!document.querySelector('input[placeholder=\"搜索 Name / ID / Class\"]')?.parentElement.parentElement.querySelector('[class*=\"max-h-\"] button')")
 b.evaluate("document.querySelector('input[placeholder=\"搜索 Name / ID / Class\"]').parentElement.parentElement.querySelector('[class*=\"max-h-\"] button').click();true")
 click('确认')
 b.wait('JSON.parse(localStorage.getItem("ria_temp_rule_delete_ids_v1")||"{}").zth?.includes('+json.dumps(record['ID'])+')')
 click('删除要素');b.wait("document.body.innerText.includes('选择待删除要素')")
 b.evaluate("(()=>{const h=[...document.querySelectorAll('div')].find(e=>e.className==='font-bold'&&e.textContent.startsWith('待删除标记'));const row=[...h.parentElement.querySelectorAll('div.flex')].find(e=>e.textContent.includes("+json.dumps(record['ID'])+"));row.querySelector('button').click();return true;})()")
 click('确认');b.wait('!JSON.parse(localStorage.getItem("ria_temp_rule_delete_ids_v1")||"{}").zth?.includes('+json.dumps(record['ID'])+')')
 checks.append('actual delete selection and removal recover the mounted record')
 click('取消临时挂载');b.wait('!(JSON.parse(localStorage.getItem("ria_temp_rule_sources_v1")||"{}").zth||[]).some(s=>s.uid.startsWith("layer-"))')
 click('临时挂载');b.wait("document.body.innerText.includes('enabled=true')",60)
 world=b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='奈落');return e?.textContent;})()")
 if not world:
  world=b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().includes('奈落'));return e?.textContent.trim();})()")
 assert world,'Alternate world control not found'
 click(world);b.wait(PROBE.replace('return map&&projection?', "return map&&projection&&world==='naraku'?"),30)
 assert not b.evaluate("document.querySelector('.leaflet-container').innerText.includes('BP10UI')")
 assert not b.evaluate('(JSON.parse(localStorage.getItem("ria_temp_rule_sources_v1")||"{}").zth||[]).some(s=>s.uid.startsWith("layer-"))')
 checks.append('actual world switch closes measuring, unmounts original-world sources and prevents label leakage')
 result={'checks':checks,'record':record,'scope':'actual App and tool UI; field/geometry/same-ID protocol matrix recorded separately','alerts':b.evaluate('window.alerts'),'runtimeErrors':b.errors}
 (OUT/'app-mount-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 assert not b.errors,b.errors
 print(json.dumps({'checks':checks},ensure_ascii=False),flush=True)
finally:
 b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>v===null?localStorage.removeItem(k):localStorage.setItem(k,v));'+('sessionStorage.removeItem("cairnmap-config-studio-draft")' if draftBackup is None else 'sessionStorage.setItem("cairnmap-config-studio-draft",'+json.dumps(draftBackup)+')'))
