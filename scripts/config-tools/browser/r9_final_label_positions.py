"""Nine directions and signed screen offsets in both production and validator paths."""
import json,time
from browser_check import Browser,OUT
b=Browser();cases=[]
for mode in ['main','preview']:
 b.call('Page.navigate',{'url':f'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?final=1&class=TPP&scenario=singlePoint&mode={mode}'})
 b.wait('!!window.acceptance?.map',40)
 for placement in ['center','N','S','E','W','NE','NW','SE','SW']:
  for x,y in [(0,0),(12,15),(-12,-15),(12,-15),(-12,15)]:
   b.evaluate("(()=>{const c=structuredClone(window.acceptance.config);for(const n of c.nodes.filter(n=>n.path.class==='TPP'))for(const r of n.geometryProfiles.Point?.zoomPriority.rules??[]){r.label.visible=true;r.label.placement="+json.dumps(placement)+";r.label.offsetX="+str(x)+";r.label.offsetY="+str(y)+";r.label.collision.hideWhenColliding=false;r.extensions={...r.extensions,anchor:{strategy:'featureCenter',candidates:['C']},collision:{hidePolicy:'forceShow',allowOverlap:true},density:{mode:'override',gridSizePx:1,maxLabelsPerGrid:999,preserveRequired:true}};}window.acceptance.setConfig(c);})()")
   fx=0 if placement in ['E','NE','SE'] else -1 if placement in ['W','NW','SW'] else -.5
   fy=-1 if placement in ['N','NE','NW'] else 0 if placement in ['S','SE','SW'] else -.5
   probe="(()=>{const a=window.acceptance,l=Object.values(a.map._layers).find(l=>l.getElement?.()?.classList.contains('leaflet-marker-icon')&&l.getElement().textContent.trim());if(!l)throw Error('Missing label');const e=l.getElement().firstElementChild,r=e.getBoundingClientRect(),m=a.map.getContainer().getBoundingClientRect(),p=a.map.latLngToContainerPoint(l.getLatLng());return {x:r.x-m.x,y:r.y-m.y,w:r.width,h:r.height,ax:p.x,ay:p.y,text:e.textContent};})()"
   b.wait("(()=>{const a="+probe+";return Math.abs(a.x-(a.ax+"+str(fx)+"*a.w+"+str(x)+"))<=1&&Math.abs(a.y-(a.ay+"+str(fy)+"*a.h+"+str(y)+"))<=1;})()",8)
   actual=b.evaluate(probe)
   expected=[actual['ax']+fx*actual['w']+x,actual['ay']+fy*actual['h']+y]
   assert abs(actual['x']-expected[0])<=1 and abs(actual['y']-expected[1])<=1,(mode,placement,x,y,actual,expected)
   cases.append({'mode':mode,'placement':placement,'offset':[x,y],'expected':expected,'actual':actual})
 b.screenshot('r9-final-label-'+mode+'.png')
assert not b.errors,b.errors
(OUT/'r9-final-label-positions.json').write_text(json.dumps({'cases':cases,'runtimeErrors':b.errors,'scope':'90 actual label outer-box positions, shared main/validator code; no whole-map pixel-equality claim'},ensure_ascii=False,indent=2),encoding='utf-8')
print('Nine directions / signed X,Y: 90 real main/validator DOM bounds passed',flush=True)
