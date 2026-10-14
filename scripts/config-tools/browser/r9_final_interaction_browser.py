import json,sys,time
from browser_check import Browser,OUT
sys.stdout.reconfigure(encoding='utf-8')
b=Browser(); checks=[]
def navigate(query):
    b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?final=1&'+query});b.wait('!!window.acceptance?.map');time.sleep(.4);b.errors=[]
def modify(script):
    b.evaluate("(() => {const a=window.acceptance; const c=structuredClone(a.config);const n=c.nodes.find(n=>n.path.class==='BUD'&&!n.path.kind);const g=n.geometryProfiles.Polygon;"+script+";a.setConfig(c);})()");time.sleep(.5)
def click(x,y):
    for t in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':t,'button':'left','clickCount':1,'x':x,'y':y})
    time.sleep(.3)
def close():
    b.evaluate('[...document.querySelectorAll("button[aria-label=\\"关闭\\"]")].forEach(e=>e.click())');time.sleep(.3)
navigate('class=BUD&scenario=multiSmallPolygon')
assert b.evaluate('window.acceptance.dataset.features.length')==1;checks.append('host preview contains only selected host')
modify("g.anchor='perPart';for(const r of g.zoomPriority.rules){r.label.collision={role:'required',basePriority:9000,hideWhenColliding:false};r.extensions.collision={hidePolicy:'forceShow',allowOverlap:true};r.extensions.anchor={strategy:'featureCenter',candidates:['C']};r.extensions.polygonCandidates={mode:'none'};r.extensions.density={mode:'override',gridSizePx:1,maxLabelsPerGrid:99,preserveRequired:true};}")
for index in range(3):
    r=b.evaluate('''(() => {const e=[...document.querySelectorAll('.leaflet-marker-icon')].filter(e=>e.textContent.trim())[INDEX].firstElementChild;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()'''.replace('INDEX',str(index)))
    click(**r);b.wait('!!document.querySelector("button[aria-label=\\"关闭\\"]")')
    b.click('JSON');assert b.evaluate('[...document.querySelectorAll("textarea")].some(e=>e.value.includes("config-preview-context-host"))');close()
checks.append('each of three component labels opens original host record')
b.screenshot('multipart-click-closed.png')
modify("for(const r of g.zoomPriority.rules){r.representation='point';r.style.pointShape='circle';r.style.size=6;r.label.placement='center';r.label.offsetX=0;r.label.offsetY=0;}")
same=b.evaluate('''(() => {const layers=Object.values(window.acceptance.map._layers);const points=layers.filter(l=>l.getRadius?.()===6).map(l=>l.getLatLng());const labels=layers.filter(l=>l.getElement?.()?.classList.contains('leaflet-marker-icon')&&l.getElement().textContent.trim()).map(l=>l.getLatLng());return {points:points.map(p=>{const q=window.acceptance.map.latLngToContainerPoint(p);return [q.x,q.y]}),labels:labels.map(p=>{const q=window.acceptance.map.latLngToContainerPoint(p);return [q.x,q.y]})};})()''')
assert len(same['points'])==len(same['labels'])==3,same
assert sorted(same['points'])==sorted(same['labels']),same
checks.append('per-part point geometry and labels share identical screen anchors')
modify("g.anchor='featureBbox';for(const r of g.zoomPriority.rules){r.label.placement='NE';r.label.offsetX=80;r.label.offsetY=-40;}")
r=b.evaluate('''(() => {const r=[...document.querySelectorAll('.leaflet-marker-icon')].find(e=>e.textContent.trim()).firstElementChild.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()''')
click(**r);b.wait('!!document.querySelector("button[aria-label=\\"关闭\\"]")');b.click('JSON');assert b.evaluate('[...document.querySelectorAll("textarea")].some(e=>e.value.includes("config-preview-context-host"))');b.screenshot('signed-offset-click.png');close()
checks.append('positive X and negative Y label remains clickable at displayed position')
uri='data:image/svg+xml,'+__import__('urllib.parse',fromlist=['quote']).quote('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="24"><rect width="60" height="24" fill="orange"/></svg>')
b.evaluate('window.acceptance.setFeaturePatch('+json.dumps({'Name':uri})+')');time.sleep(.3)
for size,anchor in [([32,32],[16,16]),([60,24],[30,7])]:
    modify("g.interaction.triggers.point=true;for(const r of g.zoomPriority.rules){r.label.visible=false;r.style.symbolVisibility='independent';r.style.symbolAnchor='geometry';r.style.symbolOffsetPx={x:0,y:0};r.style.icon={source:'Name',size:"+json.dumps(size)+",anchor:"+json.dumps(anchor)+",fallback:'circle'};}")
    m=b.evaluate('''(() => {const a=window.acceptance;const l=Object.values(a.map._layers).find(l=>l.options.icon?.options.iconUrl);const e=l.getElement();const r=e.getBoundingClientRect();const cr=a.map.getContainer().getBoundingClientRect();const p=a.map.latLngToContainerPoint(l.getLatLng());return {x:r.x,y:r.y,w:r.width,h:r.height,relativeX:r.x-cr.x,relativeY:r.y-cr.y,ax:p.x,ay:p.y};})()''')
    assert [m['w'],m['h']]==size,m
    assert abs(m['relativeX']-(m['ax']-anchor[0]))<1 and abs(m['relativeY']-(m['ay']-anchor[1]))<1,m
click(m['x']+2,m['y']+2);b.wait('!!document.querySelector("button[aria-label=\\"关闭\\"]")');close();checks.append('same-URL icon size/anchor updates and rectangular hit proxy follow pixels')
navigate('class=FLR&scenario=smallPolygon&mode=preview')
assert b.evaluate('window.acceptance.dataset.features.length')==2;checks.append('member preview includes its larger external host')
assert not b.errors,b.errors
(OUT/'r9-final-interaction-browser-result.json').write_text(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(checks,ensure_ascii=False))
