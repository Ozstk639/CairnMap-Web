"""Independent frozen V1 vs candidate V3 DOM/geometry matrix.
The reference imports only production code at the recorded source commit.
This is a browser comparison, not a substitute for dense/context/lifecycle tests.
"""
import json, time, sys, argparse
from pathlib import Path
from browser_check import Browser, OUT

ROOT = Path(__file__).resolve().parents[3]
fixtures = json.loads((ROOT/'scripts/config-tools/fixtures/v1-independent-card-baseline.json').read_text(encoding='utf-8'))
b = Browser()
SNAP = """(() => {
 const labels=[];const paths=[];const mr=window.acceptance.map.getContainer().getBoundingClientRect();
 window.acceptance.map.eachLayer(l=>{const e=l.getElement?.();if(!e)return;
 if(e.tagName.toLowerCase()==='path') {const opacity=Number(e.getAttribute('stroke-opacity')??1);if(opacity<.05)return;paths.push({stroke:e.getAttribute('stroke'),fill:e.getAttribute('fill'),opacity,weight:Number(e.getAttribute('stroke-width')),d:e.getAttribute('d')});}
 else {for(const s of e.querySelectorAll('span,text')) {if(!s.textContent.trim()||s.querySelector('span,text'))continue;const r=s.getBoundingClientRect();if(!r.width||!r.height||r.right<=mr.left||r.left>=mr.right||r.bottom<=mr.top||r.top>=mr.bottom)continue;const c=getComputedStyle(s);labels.push({text:s.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height,color:c.color,font:c.fontSize,weight:c.fontWeight});}}
 });labels.sort((a,b)=>a.text.localeCompare(b.text)||a.x-b.x||a.y-b.y);
 return {labels,paths};
})()"""
parser=argparse.ArgumentParser();parser.add_argument('classes',nargs='?',default='');parser.add_argument('--reuse-reference',action='store_true');parser.add_argument('--hierarchy',action='store_true');args=parser.parse_args()
if args.hierarchy:
 baseline=json.loads((ROOT/'scripts/config-tools/fixtures/v1-independent-baseline.json').read_text(encoding='utf-8'))
 paths={(c['record'].get('Class'),c['record'].get('Kind',''),c['record'].get('SKind',''),c['record'].get('SKind2','')) for c in fixtures['cases']}
 additions=[]
 for n in baseline['candidateInventory']['nodes']:
  p=n['classification'];key=(p['class'],p.get('kind',''),p.get('skind',''),p.get('skind2',''))
  if key in paths:continue
  r=dict(next(c['record'] for c in fixtures['cases'] if c['record']['Class']==p['class']));r.update({'Kind':key[1],'SKind':key[2],'SKind2':key[3]})
  additions.append({'key':'hierarchy:'+'/'.join(key),'record':r})
 fixtures['cases']=additions
cases=[]
for fixture in fixtures['cases']:
 if args.classes and fixture['record']['Class'] not in args.classes.split(','):continue
 r=dict(fixture['record']);r['World']='zth';r['Name']='核验要素';r['ID']='matrix-'+fixture['key']
 for key in ['CoordP','CoordL','CoordG','Geometry']:r.pop(key,None)
 typ=r.get('Type','Points')
 if typ=='Points':r['CoordP']=[[0,-64,0]]
 elif typ=='Polyline':r['CoordL']=[[[-160,-64,0],[160,-64,0]]]
 else:r['CoordG']=[[[[-160,-64,-100],[160,-64,-100],[160,-64,100],[-160,-64,100],[-160,-64,-100]]]]
 for zoom in range(9):cases.append({'key':fixture['key'],'class':r['Class'],'zoom':zoom,'record':r})
snapshots={}
if args.reuse_reference:
 reference_name='independent-hierarchy.json' if args.hierarchy else 'independent-matrix.json'
 recorded=json.loads((OUT/reference_name).read_text(encoding='utf-8'))
 assert recorded['sourceSha']==fixtures['sourceSha']
 references=[r for r in recorded['results'] if not args.classes or r['class'] in args.classes.split(',')]
 assert len(references)==len(cases)
 for i,row in enumerate(references):
  assert (row['key'],row['zoom'])==(cases[i]['key'],cases[i]['zoom'])
  snapshots[('v1',i)]=row['v1']
for mode,port,page in [('v1',5189,'v1-oracle'),('v3',5188,'render-acceptance')]:
 if mode=='v1' and args.reuse_reference:continue
 b.call('Page.navigate',{'url':f'http://127.0.0.1:{port}/scripts/config-tools/{page}.html'})
 b.wait('!!window.acceptance?.map',40);b.evaluate('document.fonts.ready.then(()=>true)')
 for i,case in enumerate(cases):
  b.wait('!!window.acceptance?.map')
  b.evaluate('window.acceptance.setDataset('+json.dumps({'features':[case['record']]})+');void window.acceptance.map.setView([0,0],'+str(case['zoom']-3)+')')
  time.sleep(.22)
  snapshots[(mode,i)]=b.evaluate(SNAP)
  if i%90==0:print(f'{mode}: {i+1}/{len(cases)}',flush=True)
results=[];failures=[]
for i,case in enumerate(cases):
 a=snapshots[('v1',i)];c=snapshots[('v3',i)];issues=[]
 # Reference DOM outside the map's overflow clip is not a visible label.
 for snapshot in [a,c]:snapshot['labels']=[l for l in snapshot['labels'] if l['x']+l['w']>20 and l['x']<1220 and l['y']+l['h']>20 and l['y']<920]
 if len(a['labels'])!=len(c['labels']):issues.append('label count')
 for x,y in zip(a['labels'],c['labels']):
  if any(x[k]!=y[k] for k in ['text','color','font','weight']):issues.append('label text/style')
  if any(abs(x[k]-y[k])>1 for k in ['x','y','w','h']):issues.append('label bounds')
 # BUD/STB point symbols intentionally replace inline CSS decoration.
 if case['class'] not in ['BUD','STB']:
  if len(a['paths'])!=len(c['paths']):issues.append('geometry count')
  for x,y in zip(a['paths'],c['paths']):
   if any(x[k]!=y[k] for k in ['stroke','fill','opacity','weight','d']):issues.append('geometry/style')
 row={'key':case['key'],'class':case['class'],'zoom':case['zoom'],'issues':sorted(set(issues)),'v1':a,'v3':c}
 results.append(row)
 if issues:failures.append(row)
report={'sourceSha':fixtures['sourceSha'],'cases':len(results),'passed':len(results)-len(failures),'failed':len(failures),'runtimeErrors':b.errors,'results':results}
(OUT/('independent-hierarchy.json' if args.hierarchy else 'independent-matrix-'+args.classes+'.json' if args.classes else 'independent-matrix.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'cases':len(results),'failed':len(failures),'failureExamples':[(r['key'],r['zoom'],r['issues']) for r in failures[:30]],'runtimeErrors':len(b.errors)},ensure_ascii=False),flush=True)
if failures or b.errors:raise SystemExit(1)
