import json, sys, time
from browser_check import Browser, OUT
sys.stdout.reconfigure(encoding='utf-8')
b=Browser()
def navigate(query):
    b.call('Page.navigate', {'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?'+query})
    b.wait('!!window.acceptance?.map'); time.sleep(.5); b.errors=[]
def metrics():
    return b.evaluate('''(() => { const a=window.acceptance; const map=a.map; const container=map.getContainer(); const cr=container.getBoundingClientRect(); const layers=[]; map.eachLayer(l=>{if(l.getLatLng && l.getElement?.()) {const el=l.getElement(); const inner=el.classList.contains('leaflet-marker-icon')?el.firstElementChild:null;const r=(inner||el).getBoundingClientRect();const anchor=map.latLngToContainerPoint(l.getLatLng());layers.push({kind:l.constructor.name,label:!!inner,text:el.textContent.trim(),x:r.x-cr.x,y:r.y-cr.y,w:r.width,h:r.height,ax:anchor.x,ay:anchor.y,radius:l.getRadius?.(),opacity:l.options.opacity});}}); return {zoom:map.getZoom(),size:[map.getSize().x,map.getSize().y],layers,tiles:container.querySelectorAll('img.leaflet-tile-loaded').length,tileErrors:[...container.querySelectorAll('img.leaflet-tile')].filter(e=>e.complete && !e.naturalWidth).length,paths:container.querySelectorAll('path').length};})()''')
def change_geometry(source):
    b.evaluate('''(() => {const a=window.acceptance;const c=structuredClone(a.config);const n=c.nodes.find(n=>n.path.class==='BUD'&&!n.path.kind);const g=n.geometryProfiles.Polygon;'''+source+''';a.setConfig(c);})()''')
    time.sleep(.6)
results={}
fractions={'center':(-.5,-.5),'N':(-.5,-1),'S':(-.5,0),'E':(0,-.5),'W':(-1,-.5),'NE':(0,-1),'NW':(-1,-1),'SE':(0,0),'SW':(-1,0)}
navigate('class=BUD&scenario=smallPolygon')
positions=[]
for placement,(fx,fy) in ([] if '--parts' in sys.argv else fractions.items()):
    for x,y in [(0,0),(18,12),(-18,-12),(18,-12),(-18,12)]:
        change_geometry("for(const r of g.zoomPriority.rules) if(r.label){r.label.placement="+json.dumps(placement)+";r.label.offsetX="+str(x)+";r.label.offsetY="+str(y)+";r.extensions.anchor={strategy:'featureCenter',candidates:['C']};r.extensions.polygonCandidates={mode:'none'};r.extensions.collision={hidePolicy:'forceShow',allowOverlap:true};}")
        m=metrics(); label=next(l for l in m['layers'] if l['label'])
        dx=label['x']-(label['ax']+label['w']*fx+x);dy=label['y']-(label['ay']+label['h']*fy+y)
        assert abs(dx)<1 and abs(dy)<1,(placement,x,y,label,dx,dy)
        positions.append({'placement':placement,'offset':[x,y],'error':[dx,dy]})
families=[]
for family in ['structure-label','gm-outline','gm-bw','gm-wtb','bubble-dark','rle-line-color','rle-pill-color']:
    change_geometry("for(const r of g.zoomPriority.rules)if(r.label){r.label.style={family:"+json.dumps(family)+",size:14,color:{mode:'fixed',color:'#00ccff'}};r.label.placement='center';r.label.offsetX=12;r.label.offsetY=-9;r.extensions.anchor={strategy:'featureCenter',candidates:['C']};}")
    label=next(l for l in metrics()['layers'] if l['label'])
    dx=label['x']-(label['ax']-label['w']/2+12);dy=label['y']-(label['ay']-label['h']/2-9)
    assert abs(dx)<1 and abs(dy)<1,(family,label,dx,dy)
    families.append({'family':family,'error':[dx,dy]})
results['styleFamilies']=families
results['positions']=positions
b.screenshot('label-nine-directions.png')
for scenario in ['multiSmallPolygon','multiPoint','multiLine']:
    navigate('class=BUD&scenario='+scenario)
    b.evaluate("(() => {const a=window.acceptance; const c=structuredClone(a.config); const n=c.nodes.find(n=>n.path.class==='BUD'&&!n.path.kind); delete n.geometryType;n.geometryProfiles.Point=structuredClone(n.geometryProfiles.Polygon);n.geometryProfiles.LineString=structuredClone(n.geometryProfiles.Polygon);for(const g of Object.values(n.geometryProfiles)) {g.enabled=true;g.anchor='perPart';for(const r of g.zoomPriority.rules){r.representation='geometry';r.label.visible=true;r.label.collision={role:'required',basePriority:9000,hideWhenColliding:false};r.extensions.collision={hidePolicy:'forceShow',allowOverlap:true};r.extensions.anchor={strategy:'featureCenter',candidates:['C'],requireInsideGeometry:false};r.extensions.lineLabel={profile:'standard',mode:'free',textMode:'rotatedLabel',minLengthPx:0,repositionMode:'off',repositionStrictSvg:false};r.extensions.polygonCandidates={mode:'none'};r.extensions.screenGate={mode:'override',minScreenAreaPx:0,minScreenLengthPx:0};r.extensions.density={mode:'override',gridSizePx:1,maxLabelsPerGrid:99,preserveRequired:true};}}a.setConfig(c);})()")
    time.sleep(.7); m=metrics(); count=sum(l['label'] for l in m['layers']);expected=2 if scenario=='multiLine' else 3
    assert count==expected,(scenario,m)
    results[scenario]=m;b.screenshot(scenario+'.png')
    b.evaluate("(() => {const a=window.acceptance; const c=structuredClone(a.config); for(const g of Object.values(c.nodes.find(n=>n.path.class==='BUD'&&!n.path.kind).geometryProfiles))g.anchor='featureBbox';a.setConfig(c);})()")
    time.sleep(.7); m=metrics(); assert sum(l['label'] for l in m['layers'])==1,(scenario,m)
    results[scenario+'Whole']=m
for mode in ['v1','main','preview']:
    navigate('class=BUD&scenario=smallPolygon&mode='+mode)
    rows=[]
    for zoom in [0,2,3,5,6,8]:
        b.evaluate('void window.acceptance.map.setZoom('+str(zoom-3)+', {animate:false})');time.sleep(.6)
        b.wait('Object.values(window.acceptance.map._layers).filter(l=>l._tiles).every(l=>!l.isLoading())');rows.append({'logicalZoom':zoom,**metrics()});b.screenshot('bud-'+mode+'-zoom'+str(zoom)+'.png')
    results['BUD-'+mode]=rows
    if mode=='main': assert len(rows[2]['layers'])>=2 and any(l.get('radius')==4.5 and l.get('opacity')==.85 for l in rows[2]['layers']),rows[2]
parity=[]
for main,preview in zip(results['BUD-main'],results['BUD-preview']):
    assert main['logicalZoom']==preview['logicalZoom'] and len(main['layers'])==len(preview['layers'])
    for left,right in zip(main['layers'],preview['layers']):
        assert left['label']==right['label'] and left.get('radius')==right.get('radius') and left['text']==right['text']
        for key,axis in [('x',0),('y',1),('ax',0),('ay',1)]:
            assert abs((left[key]-main['size'][axis]/2)-(right[key]-preview['size'][axis]/2))<1,(main['logicalZoom'],key,left,right)
        assert abs(left['w']-right['w'])<1 and abs(left['h']-right['h'])<1
    parity.append(main['logicalZoom'])
results['mainPreviewParityZooms']=parity
navigate('class=BUD&scenario=largePolygon&mode=preview')
low=[]
for zoom in [0,1,2]:
    b.evaluate('void window.acceptance.map.setZoom('+str(zoom-3)+', {animate:false})')
    b.wait('Object.values(window.acceptance.map._layers).filter(l=>l._tiles).every(l=>!l.isLoading())');time.sleep(.3)
    m=metrics();assert m['tiles']>0 and m['tileErrors']==0,m;low.append({'logicalZoom':zoom,**m})
    b.screenshot('preview-low-zoom'+str(zoom)+'.png')
results['lowZoomTiles']=low
results['roundTrip']=b.evaluate('window.acceptance.roundTrip().then(c=>({same:JSON.stringify(c.workflows,(k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort()):v)===JSON.stringify(window.acceptance.config.workflows,(k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort()):v),revision:c.contractRevision}))')
assert results['roundTrip']=={'same':True,'revision':8},results['roundTrip']
assert not b.errors,b.errors
results['runtimeErrors']=b.errors
(OUT/'render-browser-result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'positions':len(positions),'multipart':['multiSmallPolygon','multiPoint','multiLine'],'budZooms':[0,2,3,5,6,8],'lowZoomTiles':low,'roundTrip':results['roundTrip']},ensure_ascii=False))
