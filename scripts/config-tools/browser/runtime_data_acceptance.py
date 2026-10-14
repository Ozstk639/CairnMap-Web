"""Dynamic data/cache probes supplement the separately tested actual tool UX."""
import json,time
from browser_check import Browser,OUT
from app_probe import PROBE
b=Browser();checks=[];keys=['ria_temp_rule_sources_v1','ria_temp_rule_override_ids_v1','ria_temp_rule_delete_ids_v1']
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?class=TPP&scenario=singlePoint&transient=1'})
b.wait('!!window.acceptance?.map')
backup=b.evaluate('Object.fromEntries('+json.dumps(keys)+'.map(k=>[k,localStorage.getItem(k)]))')
base={'ID':'BP10_BASE','Class':'TPP','Kind':'','SKind':'','Name':'正式','World':'zth','Type':'Points','CoordP':[[0,-64,0]]}

def temp(items,overrides=None,deletes=None,enabled=True):
 b.evaluate('(()=>{localStorage.setItem("ria_temp_rule_sources_v1",JSON.stringify({zth:[{uid:"bp10-data",worldId:"zth",enabled:'+str(enabled).lower()+',items:'+json.dumps(items)+'}]}));localStorage.setItem("ria_temp_rule_override_ids_v1",JSON.stringify({zth:'+json.dumps(overrides or [])+'}));localStorage.setItem("ria_temp_rule_delete_ids_v1",JSON.stringify({zth:'+json.dumps(deletes or [])+'}));for(const n of ["sources","overrides","deletes"])window.dispatchEvent(new CustomEvent("ria-temp-rule-"+n+"-changed",{detail:{worldId:"zth"}}));return true;})()')
 time.sleep(.35)

def snapshot():
 b.evaluate(PROBE)
 return b.evaluate('({stats:window.acceptance.compilationStats(),records:window.appProbe.records.map(r=>({id:r.featureInfo.ID,name:r.featureInfo.Name,coords:r.coords3})),labels:[...document.querySelectorAll(".leaflet-marker-icon")].map(e=>e.textContent.trim()),paths:[...document.querySelectorAll(".leaflet-pane path")].map(e=>({stroke:e.getAttribute("stroke"),fill:e.getAttribute("fill")}))})')

try:
 temp([])
 b.evaluate('window.acceptance.setDataset('+json.dumps({'features':[base]})+');true')
 b.evaluate("(()=>{const c=structuredClone(window.acceptance.config),g=c.nodes.find(n=>n.path.class==='TPP'&&!n.path.kind).geometryProfiles.Point;g.multiple=true;g.anchor='perPart';for(const r of g.zoomPriority.rules){r.label.visible=true;r.label.collision.role='required';r.extensions.anchor={strategy:'featureCenter',candidates:['C']};r.extensions.collision={hidePolicy:'forceShow',allowOverlap:true};r.extensions.density={mode:'override',gridSizePx:1,maxLabelsPerGrid:999,preserveRequired:true};}for(const n of c.nodes.filter(n=>n.path.class==='BUD')){const b=n.geometryProfiles.Polygon;if(b){b.multiple=true;b.anchor='perPart';for(const r of b.zoomPriority.rules)r.label.visible=true;}}const rule=structuredClone(g.zoomPriority.rules.at(-1));rule.id='bp10-name-condition';rule.when={zoom:{min:0,max:8},fields:{op:'all',items:[{kind:'fieldEquals',field:'Name',value:'变更后'}]}};rule.style.fill={mode:'fixed',color:'#e6007e'};rule.style.stroke={mode:'fixed',color:'#e6007e'};g.zoomPriority.rules.push(rule);window.acceptance.setConfig(c);return true;})()")
 time.sleep(.5);initial=snapshot();epoch=initial['stats']['epoch']
 assert initial['labels']==['正式'],initial
 changed={**base,'Name':'变更后','CoordP':[[8,-64,4],[16,-64,4]]}
 temp([changed],[base['ID']]);s=snapshot()
 assert s['labels']==['变更后','变更后'] and len(s['records'])==1,s
 assert any(p['fill']=='#e6007e' for p in s['paths']),s
 assert s['stats']['epoch']==epoch
 checks.append('same-ID field and geometry replacement changes r7 condition, color, per-part labels and indexed record without recompiling config')
 temp([changed],[base['ID']],enabled=False);s=snapshot();assert s['labels']==['正式'] and s['records'][0]['name']=='正式',s
 temp([changed],[base['ID']]);assert len(snapshot()['labels'])==2
 temp([]);s=snapshot();assert s['labels']==['正式'] and s['records'][0]['name']=='正式',s
 checks.append('disable/enable and removing override restore the existing fixed-source masking semantics and original record')
 expanded=[]
 for size in [1000,5000]:
  features=[]
  for i in range(size):
   x=(i%50)*10-250;z=(i//50)*10-100
   features.append({'ID':'scale-'+str(i),'Class':'BUD','Kind':'','SKind':'','Name':'密集多部件'+str(i),'Type':'Polygon','World':'zth','CoordG':[[[[x,-64,z],[x+4,-64,z],[x+4,-64,z+4],[x,-64,z+4]]],[[[x+5,-64,z],[x+8,-64,z],[x+8,-64,z+3],[x+5,-64,z+3]]]]})
  b.call('HeapProfiler.collectGarbage');start=b.evaluate('performance.memory?.usedJSHeapSize')
  started=time.perf_counter();b.evaluate('window.acceptance.setDataset('+json.dumps({'features':features})+');true')
  b.wait(PROBE.replace('return map&&projection?', 'return map&&projection&&records.length==='+str(size)+'?'),40)
  time.sleep(.25);firstPaint=time.perf_counter()-started
  b.call('Performance.enable');before={m['name']:m['value'] for m in b.call('Performance.getMetrics')['metrics']}
  for zoom in [2,3,2,3,2,3]:
   b.evaluate('(async()=>{window.acceptance.map.setZoom('+str(zoom)+',{animate:false});await new Promise(r=>setTimeout(r,180));return true;})()')
  after={m['name']:m['value'] for m in b.call('Performance.getMetrics')['metrics']}
  s=snapshot();assert s['stats']['epoch']==epoch and s['stats']['cachedPaths']<=1024,s['stats']
  b.call('HeapProfiler.collectGarbage');heap=b.evaluate('performance.memory?.usedJSHeapSize')
  expanded.append({'records':size,'polygonParts':size*2,'firstDataVisibleSeconds':firstPaint,'sixZoomScriptSeconds':after['ScriptDuration']-before['ScriptDuration'],'visibleLabels':len(s['labels']),'configStats':s['stats'],'gcHeapBeforeBytes':start,'gcHeapAfterBytes':heap})
  print(json.dumps(expanded[-1]),flush=True)
 b.evaluate('window.acceptance.setDataset({features:[]});true');time.sleep(.5);b.evaluate(PROBE)
 assert b.evaluate('window.appProbe.records.length')==0
 b.call('HeapProfiler.collectGarbage');released=b.evaluate('performance.memory?.usedJSHeapSize')
 checks.append('1000/5000 two-part polygons use bounded static metadata and unchanged compile epoch; unloading clears renderer records')
 result={'checks':checks,'initial':initial,'expanded':expanded,'heapAfterUnloadBytes':released,'memoryScope':'browser GC observations and renderer record release; retained application world source caches are not claimed to disappear','protocolScope':'storage/events using production protocol, supplement to actual App/tool UI evidence','runtimeErrors':b.errors}
 (OUT/'runtime-data-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 assert not b.errors,b.errors
finally:
 b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>v===null?localStorage.removeItem(k):localStorage.setItem(k,v))')
