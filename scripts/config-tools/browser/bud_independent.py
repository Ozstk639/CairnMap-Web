"""Independent frozen BUD dot vs V3 true geometry symbol, at six logical Zooms."""
import json,time
from browser_check import Browser,OUT
b=Browser();cases=[]
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?class=BUD&scenario=smallPolygon'})
b.wait('!!window.acceptance?.map')
dataset=b.evaluate('window.acceptance.dataset')
dataset['features'][0]['Name']='BUD'
for zoom in [0,2,3,5,6,8]:
 case={'zoom':zoom}
 for mode in ['v1','v3']:
  url='http://127.0.0.1:5189/scripts/config-tools/v1-oracle.html' if mode=='v1' else 'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?class=BUD&scenario=smallPolygon'
  b.call('Page.navigate',{'url':url});b.wait('!!window.acceptance?.map')
  if mode=='v1': b.evaluate('window.acceptance.setDataset('+json.dumps(dataset)+')')
  else: b.evaluate('window.acceptance.setFeaturePatch('+json.dumps(dataset['features'][0])+')')
  b.evaluate(f'void window.acceptance.map.setZoom({zoom-3})');time.sleep(.4)
  case[mode]=b.evaluate("""(() => {const markers=[...document.querySelectorAll('.leaflet-marker-icon')];const label=markers.find(e=>e.textContent.includes('BUD'));const span=label?[...label.querySelectorAll('span')].reverse().find(e=>e.textContent.trim()==='BUD'&&!e.children.length):null;const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};let point;window.acceptance.map.eachLayer(l=>{if(l.getRadius?.()&&l.options.fillColor==='#ffffff'){const r=l.getElement().getBoundingClientRect();point={x:r.x+r.width/2,y:r.y+r.height/2,radius:l.getRadius(),weight:l.options.weight,fill:l.options.fillColor,stroke:l.options.color};}});const dot=label?[...label.querySelectorAll('span')].find(e=>getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'):null;return {label:span?rect(span):null,dot:dot?rect(dot):null,point};})()""")
  b.screenshot(f'bud-parity-{zoom}-{mode}.png')
 a=case['v1'];c=case['v3']
 assert bool(a['label'])==bool(c['label']),case
 if a['label']:
  assert abs(a['label']['x']-c['label']['x'])<=1,case
  assert abs(a['label']['y']-c['label']['y'])<=1,case
 if zoom in [3,5]:
  assert c['dot'] is None and c['point'],case
  assert abs(a['dot']['x']+3-c['point']['x'])<=1,case
  assert abs(a['dot']['y']+3-c['point']['y'])<=1,case
 cases.append(case);print(json.dumps({'zoom':zoom,'labelParity':True,'truePoint':bool(c.get('point'))}),flush=True)
b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?class=BUD&scenario=smallPolygon'})
b.wait('!!window.acceptance?.map');b.evaluate("window.acceptance.setFeaturePatch({Name:''});void window.acceptance.map.setZoom(0)");time.sleep(.4)
assert b.evaluate("(() => {let n=0;window.acceptance.map.eachLayer(l=>{if(l.getRadius?.()&&l.options.fillColor==='#ffffff')n++;});return n;})()") == 0
(OUT/'bud-parity-browser.json').write_text(json.dumps({'cases':cases,'emptyNameHidesPoint':True,'errors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')

assert not b.errors,b.errors
print("frozen BUD vs native true point: six Zooms, centers and label bounds: OK")
