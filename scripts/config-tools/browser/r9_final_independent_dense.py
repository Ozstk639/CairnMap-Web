import json,time
from browser_check import Browser,OUT
b=Browser();results=[]
def poly(x,z,size=12):return [[[[x-size,-64,z-size],[x+size,-64,z-size],[x+size,-64,z+size],[x-size,-64,z+size]]]]
mixed=[]
for i in range(20):
 x=(i%5)*18-36;z=(i//5)*18-27
 mixed.append({'ID':'dense-bud-'+str(i),'Name':'建筑'+str(i),'Class':'BUD','Kind':'NOM','SKind':'NOM','Type':'Polygon','World':'zth','CoordG':poly(x,z)})
for i in range(8):
 mixed.append({'ID':'dense-isp-'+str(i),'Name':'地点'+str(i),'Class':'ISP','Kind':'NGF','SKind':'SCP','SKind2':'SPP','Type':'Points','World':'zth','CoordP':[[i*20-70,-64,20]]})
mixed.append({'ID':'surface','Name':'水域','Class':'ISG','Kind':'NGF','SKind':'WTB','SKind2':'LKE','Type':'Polygon','World':'zth','CoordG':poly(0,0,100)})
SNAP="""(() => {const mr=window.acceptance.map.getContainer().getBoundingClientRect();return [...document.querySelectorAll('.leaflet-marker-icon span,.leaflet-marker-icon text')].filter(e=>e.textContent.trim()&&!e.querySelector('span,text')).map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {text:e.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height,color:c.color,font:c.fontSize}}).filter(r=>r.w&&r.h&&r.x+r.w>mr.left&&r.x<mr.right&&r.y+r.h>mr.top&&r.y<mr.bottom).sort((a,b)=>a.text.localeCompare(b.text)||a.x-b.x||a.y-b.y)})()"""
snapshots={}
actions=[('zoom3',3,[0,0]),('zoom5',5,[0,0]),('zoom6',6,[0,0]),('small-pan',6,[8,-5]),('large-pan',6,[150,80]),('zoom8',8,[0,0])]
for mode,port,page in [('v1',5189,'v1-oracle'),('v3',5188,'render-acceptance')]:
 b.call('Page.navigate',{'url':f'http://127.0.0.1:{port}/scripts/config-tools/{page}.html'+('?final=1' if mode=='v3' else '')});b.wait('!!window.acceptance?.map')
 b.evaluate('window.acceptance.setDataset('+json.dumps({'features':mixed})+')');b.evaluate('document.fonts.ready.then(()=>true)');time.sleep(.4)
 for name,zoom,pan in actions:
  b.evaluate('void window.acceptance.map.setZoom('+str(zoom-3)+')');time.sleep(.3)
  if pan!=[0,0]:b.evaluate('void window.acceptance.map.panBy('+json.dumps(pan)+',{animate:false})');time.sleep(.3)
  snapshots[(mode,name)]=b.evaluate(SNAP)
  b.screenshot('dense-'+name+'-'+mode+'.png')
for name,zoom,pan in actions:
 a=snapshots[('v1',name)];c=snapshots[('v3',name)];issues=[]
 assert a and c,'Dense fixture did not produce visible labels'
 if len(a)!=len(c):issues.append('visible label count')
 for x,y in zip(a,c):
  if any(x[k]!=y[k] for k in ['text','color','font']):issues.append('label identity/style')
  if any(abs(x[k]-y[k])>1 for k in ['x','y','w','h']):issues.append('label bounds')
 results.append({'scenario':name,'issues':sorted(set(issues)),'v1':a,'v3':c})
report={'sourceSha':'0b82863d4fea3791f98917ba6d13f70e1f27eb15','features':len(mixed),'results':results,'errors':b.errors}
(OUT/'r9-final-independent-dense.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([(r['scenario'],len(r['v1']),len(r['v3']),r['issues']) for r in results],ensure_ascii=False))
assert not any(r['issues'] for r in results) and not b.errors
