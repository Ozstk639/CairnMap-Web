import json,time
from browser_check import Browser,OUT
b=Browser();checks=[]
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing '+"+json.dumps(selector)+");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(data)+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
def drag(source,target):
 b.evaluate(source+".querySelector('[draggable=true]').dispatchEvent(new DragEvent('dragstart',{bubbles:true}))");time.sleep(.15)
 b.evaluate(target+".dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}))");time.sleep(.15)
b.navigate('?workspace=config-studio')
backup=b.evaluate("Object.fromEntries(['cairnmap-config-studio-saved','cairnmap-config-studio-draft'].map(k=>[k,sessionStorage.getItem(k)]))")
try:
 b.evaluate("(async()=>{const {createEditableConfigPackageFromCurrentProject}=await import('/src/configStudio/renderRuleTemplates.ts');const c=createEditableConfigPackageFromCurrentProject();sessionStorage.setItem('cairnmap-config-studio-saved',JSON.stringify(c));sessionStorage.setItem('cairnmap-config-studio-draft',JSON.stringify(c));})()")
 b.navigate('?workspace=config-studio')
 assert b.evaluate("document.querySelector('select[aria-label=\"编辑分类 Class\"]').value")==''
 assert b.evaluate("document.querySelectorAll('main .leaflet-container').length")==0
 assert not b.evaluate("document.body.innerText.includes('共享下拉选项来源')")
 checks.append('initial Class is empty; validator is unmounted; removed global option panel is absent')
 value('select[aria-label="编辑分类 Class"]','ISG');value('select[aria-label="编辑分类 Kind"]','NGF');value('select[aria-label="编辑分类 SKind"]','LAD')
 labels=b.evaluate("[...document.querySelector('select[aria-label=\"编辑分类 SKind2\"]').options].map(o=>o.textContent)")
 assert any('CON' in label for label in labels) and all('ISG' not in label for label in labels)
 value('select[aria-label="编辑分类 Class"]','RLE')
 assert b.evaluate("[...document.querySelectorAll('select[aria-label^=\"编辑分类 \"]')].slice(1).every(e=>e.value==='')")
 checks.append('four-level path chooses only direct children, permits parent editing and clears lower levels after changing Class')
 b.click('读取分类');b.wait("!!document.querySelector('article[aria-label=\"字段 direction\"]')")
 row='document.querySelector(\'article[aria-label="字段 direction"]\')'
 field='article[aria-label="字段 direction"] [data-value-option="0"] input[aria-label="对照 1 zh"]'
 b.evaluate('window.focusedField=document.querySelector('+json.dumps(field)+');window.focusedField.focus()')
 value(field,'下行更新')
 assert b.evaluate('document.activeElement===window.focusedField')
 drag(row+".querySelector('[data-value-option=\"2\"]')",row+".querySelector('[data-value-option=\"0\"]')")
 assert b.evaluate(row+".querySelector('[data-value-option=\"0\"] input[placeholder=存储值]').value")=='2'
 assert b.evaluate(row+".querySelector('input[placeholder=\"名称（en）\"]').value")==''
 checks.append('field-local value rows retain input focus, use grip order and keep blank English')
 b.click('放弃草稿');b.click('工作流设计')
 value('section[aria-label="工作流编辑区域"] select','v3-isg_ngf_wtb');b.click('读取');b.wait("!!document.querySelector('textarea[aria-label=\"组装表达式 1\"]')")
 b.evaluate("(()=>{const a=document.querySelector('textarea[aria-label=\"组装表达式 1\"]').closest('article');[...a.querySelectorAll('summary')].find(e=>e.textContent==='表达式构造器').click();})()")
 value('textarea[aria-label="表达式构造编辑区"]','+ "_"')
 b.evaluate("(()=>{const e=document.querySelector('textarea[aria-label=\"表达式构造编辑区\"]');e.focus();e.setSelectionRange(0,0);})()")
 rect=b.evaluate("(()=>{const e=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.startsWith('A ·'));e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()")
 for count in [1,2]:
  for event in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':event,'button':'left','clickCount':count,**rect})
 time.sleep(.2)
 assert b.evaluate("document.querySelector('textarea[aria-label=\"表达式构造编辑区\"]').value")=='A+ "_"'
 b.click('撤销');assert b.evaluate("document.querySelector('textarea[aria-label=\"表达式构造编辑区\"]').value")=='+ "_"'
 b.click('重做');assert b.evaluate("document.querySelector('textarea[aria-label=\"表达式构造编辑区\"]').value")=='A+ "_"'
 checks.append('calculator inserts a double-clicked field at the caret and preserves undo/redo')
 b.evaluate("window.tagUnit=[...document.querySelectorAll('textarea[placeholder=控件标题]')].find(e=>e.value==='标签与扩展').closest('article');window.firstUnit=document.querySelector('input[placeholder=槽位]').closest('article');true")
 drag('window.tagUnit','window.firstUnit')
 assert b.evaluate("document.querySelector('input[placeholder=槽位]').closest('article').querySelector('textarea[placeholder=控件标题]').value")=='标签与扩展'
 assert not b.evaluate("document.querySelector('input[placeholder=槽位]').closest('article').querySelector('button')")
 b.click('要素设计');assert b.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent")=='工作流设计'
 checks.append('fixed annotations move by grip, remain nondeletable and workflow drafts block tab switches')
 b.screenshot('r8-studio-calculator.png');b.click('放弃草稿')
 assert not b.errors,b.errors
 (OUT/'r9-final-studio-acceptance.json').write_text(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
finally:
 b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>v===null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v))')
