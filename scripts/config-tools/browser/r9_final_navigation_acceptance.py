"""Actual App search and route planning, consuming temporary native records."""
import json,time
from browser_check import Browser,OUT
from app_probe import PROBE
b=Browser();keys=['ria_temp_rule_sources_v1','ria_temp_rule_override_ids_v1','ria_temp_rule_delete_ids_v1'];checks=[]
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/?workspace=config-lab&configMode=v3'});b.wait("!!document.querySelector('.leaflet-container')",40)
backup=b.evaluate('Object.fromEntries('+json.dumps(keys+['cairnmap-config-studio-draft'])+'.map(k=>[k,k.startsWith("ria_")?localStorage.getItem(k):sessionStorage.getItem(k)]))')
def value(selector,text):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+json.dumps(text)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()")
try:
 from pathlib import Path
 config=json.loads((Path(__file__).resolve().parents[3]/'src/configStudio/defaults/r9-r5.config.json').read_text(encoding='utf-8'))
 b.evaluate('sessionStorage.setItem("cairnmap-config-studio-draft",'+json.dumps(json.dumps(config))+');true');b.call('Page.reload');b.wait("!!document.querySelector('.leaflet-container')",40)
 b.wait(PROBE.replace('return map&&projection?','return map&&projection&&config?.contractRevision===9&&config?.revision===5?'),30)
 b.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='零洲'&&e.getBoundingClientRect().height)",30)
 b.evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='零洲'&&e.getBoundingClientRect().height).click();true")
 b.wait(PROBE.replace('return map&&projection?',"return map&&projection&&world==='zth'?"),30)
 native=json.loads((OUT/'r9-final-native-workflow-matrix.json').read_text(encoding='utf-8'))['cases'][-1]['record']
 road=next(row['record'] for row in json.loads((OUT/'r9-final-native-workflow-matrix.json').read_text(encoding='utf-8'))['cases'] if row['schemaKey']=='rod_road')
 road={**road,'ID':'R8_NAV_ROAD','Name':'R8 navigation road','Level':0,'Oneway':False,'Enter':True,'Exit':True,'Mode':[],'ConnectL':[],'Blacklist':[],'CoordL':[[[20,-64,13],[70,-64,38]]]}
 records=[road,{**native,'ID':'R8_NAV_A','Name':'R8_NAV_ALPHA','CoordP':[[20,-64,13]]},{**native,'ID':'R8_NAV_B','Name':'R8_NAV_BETA','CoordP':[[70,-64,38]]}]
 b.evaluate('(()=>{localStorage.setItem("ria_temp_rule_sources_v1",JSON.stringify({zth:[{uid:"r8-nav-acceptance",worldId:"zth",enabled:true,items:'+json.dumps(records)+'}]}));localStorage.setItem("ria_temp_rule_override_ids_v1","{}");localStorage.setItem("ria_temp_rule_delete_ids_v1","{}");window.dispatchEvent(new CustomEvent("ria-temp-rule-sources-changed",{detail:{worldId:"zth"}}));return true;})()')
 b.wait(PROBE.replace('return map&&projection?',"return map&&projection&&records.some(r=>r.featureInfo.ID==='R8_NAV_A')?"),40)
 b.evaluate("document.querySelector('button[title=路径规划]').click();true");b.wait("!!document.querySelector('input[placeholder^=搜索起点]')")
 b.evaluate("(()=>{window.routePanel=[...document.querySelectorAll('h3')].find(e=>e.textContent==='路径规划').parentElement.parentElement;[...window.routePanel.querySelectorAll('button')].find(e=>e.textContent.trim()==='道路').click();return true;})()")
 for prefix,name in [('搜索起点','R8_NAV_ALPHA'),('搜索终点','R8_NAV_BETA')]:
  selector='input[placeholder^='+prefix+']';value(selector,name);time.sleep(.15)
  b.evaluate("(()=>{const input=document.querySelector("+json.dumps(selector)+");const root=input.closest('div.relative');const button=[...root.querySelectorAll('button')].find(e=>e.textContent.includes("+json.dumps(name)+"));if(!button)throw Error('Native record absent from route search');button.click();return true;})()")
 b.evaluate("[...window.routePanel.querySelectorAll('button')].find(e=>e.textContent.trim()==='搜索').click();true")
 b.wait("window.routePanel.innerText.includes('道路')&&window.routePanel.innerText.includes('全程')",30)
 result=b.evaluate("({text:window.routePanel.innerText,paths:document.querySelectorAll('.leaflet-pane path').length})")
 assert result['paths']>0 and '未找到' not in result['text'],result
 checks.append('temporary native records appear in actual route endpoint search; road route is computed and drawn in App')
 b.screenshot('r8-navigation.png');assert not b.errors,b.errors
 (OUT/'r9-final-r8-navigation-acceptance.json').write_text(json.dumps({'checks':checks,'route':result,'scope':'actual search and road route UI; road/rail topology algorithms unchanged and external records compared separately','runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
finally:
 b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>{const store=k.startsWith("ria_")?localStorage:sessionStorage;v===null?store.removeItem(k):store.setItem(k,v);});true')
