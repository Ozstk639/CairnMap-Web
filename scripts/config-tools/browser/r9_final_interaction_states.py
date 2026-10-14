"""Five native interaction states through pointer, search and production temp-source events."""
import json,time
from browser_check import Browser,OUT
b=Browser();results=[]
def colors():
 return b.evaluate("[...document.querySelectorAll('.leaflet-overlay-pane path,.leaflet-pane svg path')].map(e=>({stroke:e.getAttribute('stroke'),fill:e.getAttribute('fill'),width:e.getAttribute('stroke-width')}))")
def mouse(typ,pos,button=False):
 b.call('Input.dispatchMouseEvent',{'type':typ,**pos,**({'button':'left','clickCount':1} if button else {})})
def temp(items,overrides,deletes):
 b.evaluate("""(() => {localStorage.setItem('ria_temp_rule_sources_v1',JSON.stringify({zth:[{uid:'acceptance-state',worldId:'zth',enabled:true,items:"""+json.dumps(items)+"""}]}));localStorage.setItem('ria_temp_rule_override_ids_v1',JSON.stringify({zth:"""+json.dumps(overrides)+"""}));localStorage.setItem('ria_temp_rule_delete_ids_v1',JSON.stringify({zth:"""+json.dumps(deletes)+"""}));window.dispatchEvent(new CustomEvent('ria-temp-rule-sources-changed',{detail:{worldId:'zth'}}));})()""")
keys=['ria_temp_rule_sources_v1','ria_temp_rule_override_ids_v1','ria_temp_rule_delete_ids_v1']
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?final=1&class=TPP&scenario=singlePoint'});b.wait('!!window.acceptance?.map')
backup=b.evaluate('Object.fromEntries('+json.dumps(keys)+'.map(k=>[k,localStorage.getItem(k)]))')
try:
 for state in ['hover','selected','searchResult','editing','deletionMarked']:
  temp([],[],[])
  b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?final=1&class=TPP&scenario=singlePoint&transient=1'});b.wait('!!window.acceptance?.map');time.sleep(.4)
  b.evaluate("(() => {const c=structuredClone(window.acceptance.config);for(const g of Object.values(c.engine.interactionBaselines)){for(const s of ['hover','selected','searchResult','editing','deletionMarked'])g[s].enabled=false;g["+json.dumps(state)+"]={enabled:true,strokeColor:'#e6007e',fillColor:'#e6007e',strokeWidth:6,strokeOpacity:1,fillOpacity:1,symbol:{kind:'circle',radius:9}};}window.acceptance.setConfig(c);})()")
  time.sleep(.4)
  record=b.evaluate('window.acceptance.dataset.features[0]')
  pos=b.evaluate("(() => {const e=[...document.querySelectorAll('.leaflet-marker-icon span')].find(e=>e.textContent.trim()&&!e.children.length);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
  if state=='hover':mouse('mouseMoved',pos)
  elif state=='selected':mouse('mouseMoved',pos);mouse('mousePressed',pos,True);mouse('mouseReleased',pos,True)
  elif state=='searchResult':
   b.evaluate("(async()=>{const {getRuleSearchPool}=await import('/src/components/Rules/search/ruleSearchRegistry.ts');window.dispatchEvent(new CustomEvent('ria:ruleFeatureSelect',{detail:{uid:getRuleSearchPool('zth')[0].uid}}));})()")
  elif state=='editing':temp([record],[record['ID']],[])
  else:temp([],[],[record['ID']])
  b.wait("[...document.querySelectorAll('.leaflet-pane path')].some(e=>e.getAttribute('stroke')==='#e6007e')")
  entered=colors();b.screenshot('interaction-'+state+'.png')
  b.evaluate("(() => {const c=structuredClone(window.acceptance.config);for(const g of Object.values(c.engine.interactionBaselines))g["+json.dumps(state)+"].enabled=false;window.acceptance.setConfig(c);})()")
  b.wait("![...document.querySelectorAll('.leaflet-pane path')].some(e=>e.getAttribute('stroke')==='#e6007e')")
  disabled=colors()
  # Re-enable while the event/state is still active, then leave/recover it.
  b.evaluate("(() => {const c=structuredClone(window.acceptance.config);for(const g of Object.values(c.engine.interactionBaselines))g["+json.dumps(state)+"].enabled=true;window.acceptance.setConfig(c);})()")
  b.wait("[...document.querySelectorAll('.leaflet-pane path')].some(e=>e.getAttribute('stroke')==='#e6007e')")
  if state=='hover':mouse('mouseMoved',{'x':1300,'y':950})
  elif state in ['selected','searchResult']:
   mouse('mouseMoved',{'x':1300,'y':950});b.evaluate("window.dispatchEvent(new CustomEvent('ria:ruleFeatureCardClose'))")
  else:temp([],[],[])
  b.wait("![...document.querySelectorAll('.leaflet-pane path')].some(e=>e.getAttribute('stroke')==='#e6007e')")
  results.append({'state':state,'entered':entered,'disabled':disabled,'recovered':colors()});print(state+': enter / disable / re-enable / leave: OK',flush=True)
 assert not b.errors,b.errors
 (OUT/'r9-final-interaction-states.json').write_text(json.dumps({'cases':results,'errors':b.errors,'events':'CDP real pointer; production search-select/close; MeasuringModule temp-source storage and change events'},ensure_ascii=False,indent=2),encoding='utf-8')
finally:
 b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>v===null?localStorage.removeItem(k):localStorage.setItem(k,v))')
