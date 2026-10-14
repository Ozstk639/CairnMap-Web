"""Measure actual SVG glyphPath/textPath DOM movement, including inverse and zero offsets."""
import json,time
from browser_check import Browser,OUT
b=Browser();cases=[]
for family in ['glyphPath','textPath']:
 b.call('Page.navigate',{'url':'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?class=ROD&scenario=singleLine'});b.wait('!!window.acceptance?.map')
 b.evaluate('window.acceptance.setFeaturePatch('+json.dumps({'Name':'核验道路' if family=='glyphPath' else 'Road','CoordL':[[[-160,-64,-32],[160,-64,-32]]]})+')')
 if family=='textPath':
  b.evaluate("(() => {const c=structuredClone(window.acceptance.config);const n=c.nodes.find(n=>n.path.class==='ROD'&&!n.path.kind);for(const r of n.geometryProfiles.LineString.zoomPriority.rules){r.label.collision.hideWhenColliding=false;r.extensions.lineLabel={...r.extensions.lineLabel,textMode:'textPath',orientationPolicy:'alwaysTextPath',cjkGlyphPathMode:'off',textPathMinLengthPx:1,cjkGlyphAllowTextPathFallback:true,repositionMode:'off',mode:'free',profile:'standard',textPathMinHalfLengthWorld:1,textPathHalfLengthMultiplier:2,textPathMaxHalfLengthRatio:.9};}window.acceptance.setConfig(c);})()")
 selector='.ria-line-glyphpath-icon' if family=='glyphPath' else '.ria-line-textpath-icon:not(.ria-line-glyphpath-icon)'
 b.wait('!!document.querySelector('+json.dumps(selector)+')')
 def box():return b.evaluate("(() => {const e=document.querySelector("+json.dumps(selector)+");const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()")
 baseline=box()
 for x,y in [(80,30),(-80,-30),(0,0)]:
  b.evaluate("(() => {const c=structuredClone(window.acceptance.config);const n=c.nodes.find(n=>n.path.class==='ROD'&&!n.path.kind);for(const r of n.geometryProfiles.LineString.zoomPriority.rules){r.label.offsetX="+str(x)+";r.label.offsetY="+str(y)+";}window.acceptance.setConfig(c);})()");time.sleep(.5)
  actual=box();shift=[actual['x']-baseline['x'],actual['y']-baseline['y']]
  assert abs(shift[0]-x)<=1 and abs(shift[1]-y)<=1,(family,x,y,baseline,actual)
  cases.append({'family':family,'configured':[x,y],'actualShift':shift,'before':baseline,'after':actual})
 b.screenshot('svg-offset-'+family+'.png')
assert not b.errors,b.errors
(OUT/'svg-offsets.json').write_text(json.dumps({'cases':cases,'errors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print('actual SVG glyphPath/textPath: positive, negative and zero screen offsets: OK')
