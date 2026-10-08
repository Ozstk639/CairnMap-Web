import json, time
from browser_check import Browser, OUT
b = Browser(); cases = []
def layers():
    return b.evaluate("""(() => { const a=[];window.acceptance.map.eachLayer(l=>{const e=l.getElement?.();if(e)a.push({tag:e.tagName,pane:l.options.pane,stroke:e.getAttribute('stroke'),weight:e.getAttribute('stroke-width'),dash:e.getAttribute('stroke-dasharray'),html:e.innerHTML});});return a; })()""")
def click_label():
    pos=b.evaluate("""(() => { const e=[...document.querySelectorAll('.leaflet-marker-icon')].find(e=>e.textContent.trim() && e.querySelector('span'));const r=[...e.querySelectorAll('span')].find(s=>!s.children.length&&s.textContent.trim()).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()""")
    b.call('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','clickCount':1,**pos});b.call('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','clickCount':1,**pos});time.sleep(.6)
for cls, scenario in [('TPP','singlePoint'),('ROD','singleLine')]:
    b.call('Page.navigate',{'url':f'http://127.0.0.1:5188/scripts/config-tools/render-acceptance.html?class={cls}&scenario={scenario}&mode=main'})
    b.wait('!!window.acceptance?.map');time.sleep(.8)
    if cls=='ROD':
        b.evaluate("window.acceptance.setFeaturePatch({Name:'核验道路',color:'#ff0022',CoordL:[[[-160,-64,-32],[160,-64,-32]]]});true");time.sleep(.5)
        # SVG text also has a real clickable parent marker.
        b.evaluate("[...document.querySelectorAll('.leaflet-marker-icon')].find(e=>e.textContent.trim()).dispatchEvent(new MouseEvent('click',{bubbles:true}));true");time.sleep(.6)
    else: click_label()
    enabled=layers()
    if cls=='TPP': assert any('M12 22' in l['html'] and '#3b82f6' in l['html'] for l in enabled), 'selected pin missing'
    else:
        assert any(l['stroke']=='#ffffff' and l['weight']=='9' for l in enabled), 'road outline missing'
        assert any(l['stroke']=='#ff0022' and l['weight']=='6' for l in enabled), 'road inner stroke missing'
    b.evaluate("(() => {const c=structuredClone(window.acceptance.config);for(const g of Object.values(c.engine.interactionBaselines))g.selected.enabled=false;window.acceptance.setConfig(c);return true;})()");time.sleep(.8)
    disabled=layers()
    assert not any(l['pane'] in ['ria-point-top','ria-overlay-top'] and ('M12 22' in l['html'] or l['weight'] in ['6','9']) for l in disabled), 'disabled selection still renders'
    cases.append({'class':cls,'enabled':enabled,'disabled':disabled})
(OUT/'interaction-parity.json').write_text(json.dumps({'cases':cases,'errors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
assert not b.errors
print('interaction browser: editable pin / two-stroke outline / disabled state: OK')
