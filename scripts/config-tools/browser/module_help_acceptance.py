import json, os
from pathlib import Path
from browser_check import Browser
OUT=Path(os.environ.get('CAIRNMAP_ACCEPTANCE_OUT',str(Path(__file__).parent/'artifacts')));OUT.mkdir(parents=True,exist_ok=True)
b=Browser();b.navigate('?workspace=config-studio');b.evaluate("(()=>{const s=document.querySelector('select[aria-label=\"编辑分类 Class\"]');s.value='BUD';s.dispatchEvent(new Event('change',{bubbles:true}));})()");b.click('读取/新建');b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('仅显示启用状态'));if(e)e.click();const g=document.querySelector('[data-rule-extensions]');g.open=true;return true;})()")
capture="""(()=>{let f=document.querySelector('main')[Object.keys(document.querySelector('main')).find(k=>k.startsWith('__reactFiber'))];while(f&&f.type?.name!=='ConfigStudio')f=f.return;let h=f.memoizedState,c;while(h){if(h.memoizedState?.schemaVersion==='cairnmap.config-package.v3')c=h.memoizedState;h=h.next;}return JSON.stringify(c);})()"""
before=b.evaluate(capture)
coverage=b.evaluate("(()=>{const s=[...document.querySelectorAll('[data-rule-extensions] summary')];return {modules:s.map(e=>e.dataset.moduleTitle||e.textContent),missing:s.filter(e=>!e.querySelector('button[aria-label$=\"说明\"]')).map(e=>e.textContent),collisionMetric:[...document.querySelectorAll('button')].some(e=>e.getAttribute('aria-label')==='Label 独立碰撞指标说明')};})()")
assert not coverage['missing'] and coverage['collisionMetric'],coverage
button="document.querySelector('[data-rule-extensions] > summary button')"
b.evaluate(button+".scrollIntoView({block:'center'});"+button+".focus();true")
b.wait("!!document.querySelector('[role=tooltip]')")
assert b.evaluate("document.querySelector('[data-rule-extensions]').open") is True
assert b.evaluate(capture)==before
text=b.evaluate("document.querySelector('[role=tooltip]').innerText")
assert b.evaluate("document.querySelector('[role=tooltip]').querySelectorAll('p').length")==1,text
assert not any(part in text for part in ['意义：','效果：','编辑：','示例：']),text
b.call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
b.call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
b.wait("!document.querySelector('[role=tooltip]')")
b.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
b.call('Emulation.setTouchEmulationEnabled',{'enabled':True,'maxTouchPoints':1})
b.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
b.click('编辑器全屏')
b.evaluate(button+".scrollIntoView({block:'center'});true")
b.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
rect=b.evaluate("(()=>{const e="+button+";const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y};})()")
assert b.evaluate("(()=>{const e="+button+";return e.contains(document.elementFromPoint("+str(rect['x'])+","+str(rect['y'])+"));})()"),rect
b.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,**rect}]});b.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
b.wait("!!document.querySelector('[role=tooltip]')")
popup=b.evaluate("(()=>{const r=document.querySelector('[role=tooltip]').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};})()")
assert popup['x']>=0 and popup['y']>=0 and popup['right']<=popup['w'] and popup['bottom']<=popup['h'],popup
assert b.evaluate(capture)==before
b.screenshot('diamond-help-narrow.png');b.click('关闭模块说明');b.call('Emulation.setTouchEmulationEnabled',{'enabled':False});b.click('放弃草稿')
result={'coverage':coverage,'keyboardFocusEscape':True,'touchVisibleInViewport':popup,'draftUnchanged':True,'parentFoldUnchanged':True,'runtimeErrors':b.errors};(OUT/'module-help-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');assert not b.errors,b.errors;print(json.dumps(result,ensure_ascii=False))
