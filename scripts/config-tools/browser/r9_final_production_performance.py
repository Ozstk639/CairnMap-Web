"""Matched production App/ConfigLab V1/V3 timing with real pointer card opens."""
import json,time,statistics,math
from browser_check import Browser,OUT
from app_probe import PROBE
b=Browser();rows=[]
from pathlib import Path
config=json.loads((Path(__file__).resolve().parents[3]/'src/configStudio/defaults/r9-r5.config.json').read_text(encoding='utf-8'))
for mode,port in [('v1',5209),('v3',5208)]:
 b.call('Page.navigate',{'url':f'http://127.0.0.1:{port}/?workspace=config-lab&configMode={mode}'})
 b.wait("!!document.querySelector('.leaflet-container')",45)
 b.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='零洲'&&e.getBoundingClientRect().height)",30)
 b.click('零洲')
 b.wait(PROBE,30)
 b.wait(PROBE.replace('return map&&projection?', 'return map&&projection&&records.length>=463?'),45)
 initial=b.evaluate(PROBE)
 if mode=='v3':assert initial['contract']==9 and initial['packageRevision']==5,initial
 b.evaluate('window.appProbe.map.setView([765,-321.5],2,{animate:false});true');time.sleep(.5)
 batches=[]
 for batch in range(5):
  b.evaluate("window.perfTasks=[];window.perfObserver=new PerformanceObserver(l=>window.perfTasks.push(...l.getEntries().map(e=>e.duration)));window.perfObserver.observe({type:'longtask'});true")
  b.call('Performance.enable');start={m['name']:m['value'] for m in b.call('Performance.getMetrics')['metrics']}
  for zoom in [1,2,3,2,1,2]:
   b.evaluate('(async()=>{window.appProbe.map.setZoom('+str(zoom)+',{animate:false});await new Promise(r=>setTimeout(r,250));await new Promise(requestAnimationFrame);return true;})()')
  final={m['name']:m['value'] for m in b.call('Performance.getMetrics')['metrics']}
  b.evaluate('window.perfObserver.disconnect()')
  batches.append({'metricsDelta':{k:final.get(k,0)-start.get(k,0) for k in ['TaskDuration','ScriptDuration','LayoutDuration']},'longTasksMs':b.evaluate('window.perfTasks')})
 timings=[]
 for i in range(30):
  position=b.evaluate("""(()=>{const e=[...document.querySelectorAll('.leaflet-marker-icon span,.leaflet-marker-icon text')].find(e=>{const r=e.getBoundingClientRect();return !e.children.length&&e.textContent.trim()&&r.width&&r.height&&r.x>30&&r.y>130&&r.right<innerWidth-30&&r.bottom<innerHeight-30;});if(!e)throw Error('No visible label');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()""")
  b.evaluate("""(()=>{window.cardFeedback=new Promise((resolve,reject)=>{let started;
   const begin=()=>{started=performance.now();};document.addEventListener('click',begin,{capture:true,once:true});
   const observer=new MutationObserver(()=>{const button=[...document.querySelectorAll('button[title="当前要素 JSON"]')].find(e=>e.getBoundingClientRect().height);if(started&&button&&button.getBoundingClientRect().height){observer.disconnect();requestAnimationFrame(()=>resolve(performance.now()-started));}});
   observer.observe(document.body,{subtree:true,childList:true,attributes:true});setTimeout(()=>{observer.disconnect();document.removeEventListener('click',begin,true);reject(Error('Card feedback timeout'));},5000);
  });return true;})()""")
  for typ in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':typ,'button':'left','clickCount':1,**position})
  timings.append(b.evaluate('window.cardFeedback'))
  b.evaluate("(()=>{const e=[...document.querySelectorAll('button[title=\"当前要素 JSON\"]')].find(e=>e.getBoundingClientRect().height);let p=e.parentElement;while(p){const close=[...p.querySelectorAll('button[aria-label=关闭],button[title=关闭]')].find(e=>e.getBoundingClientRect().height);if(close){close.click();return true;}p=p.parentElement;}throw Error('Card close missing');})()")
  time.sleep(.05)
 sortedTimes=sorted(timings);p95=sortedTimes[math.ceil(len(sortedTimes)*.95)-1]
 hover=None
 if mode=='v3':
  assert all(not v['hover']['enabled'] for v in config['engine']['interactionBaselines'].values())
  hover=b.evaluate("""(async()=>{const a=window.appProbe;window.hoverData=a.records;window.hoverLayers=Object.values(a.map._layers);let changes=0;const count=()=>changes++;a.map.on('layeradd layerremove',count);
   const labels=[...document.querySelectorAll('.leaflet-marker-icon')].filter(el=>el.textContent.trim()&&el.querySelector('span,text'));if(!labels.length)throw Error('No native hover targets');
   for(let i=0;i<30;i++){for(const el of labels){el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));el.dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));}await new Promise(requestAnimationFrame);}
   a.map.off('layeradd layerremove',count);return {layerChanges:changes,sameData:window.hoverData===a.records,sameLayers:window.hoverLayers.every(l=>a.map.hasLayer(l)),iterations:30,targets:labels.length,scope:'native text labels; independent player-marker hover excluded'};})()""")
  assert hover['layerChanges']==0 and hover['sameData'] and hover['sameLayers'],hover
 row={'mode':mode,'source':'frozen V1 production' if mode=='v1' else 'r9/r5 candidate production','host':initial,'batches':batches,
      'medianScriptDuration':statistics.median(x['metricsDelta']['ScriptDuration'] for x in batches),
      'scriptRange':[min(x['metricsDelta']['ScriptDuration'] for x in batches),max(x['metricsDelta']['ScriptDuration'] for x in batches)],
      'cardVisibleNextFrameMs':timings,'cardP95Ms':p95,'cardScope':'30 repeated real pointer opens of the same first visible record; title and body rendered, next frame',
      'disabledHover':hover,'layers':b.evaluate('Object.keys(window.appProbe.map._layers).length'),'labels':b.evaluate("document.querySelectorAll('.leaflet-marker-icon').length")}
 rows.append(row);print(json.dumps({'mode':mode,'scriptMedian':row['medianScriptDuration'],'cardP95Ms':p95,'hover':hover},ensure_ascii=False),flush=True)
ratio=rows[1]['medianScriptDuration']/rows[0]['medianScriptDuration']
result={'environment':'matched minified production builds, actual App/ConfigLab; fixed world/camera; five six-zoom warm batches; isolated Edge','rows':rows,'scriptRatio':ratio,'runtimeErrors':b.errors,'target':{'maxV3V1ScriptRatio':2,'maxV3CardP95Ms':100}}
(OUT/'r9-final-production-performance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
assert rows[0]['host']['records']==rows[1]['host']['records'],rows
assert ratio<=2 and rows[1]['cardP95Ms']<=100,result
assert not b.errors,b.errors
print('Production performance and card-feedback targets: OK',flush=True)
