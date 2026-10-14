import json,sys,time
from browser_check import Browser,OUT
sys.stdout.reconfigure(encoding='utf-8')
b=Browser();checks=[]
def set_value(selector,value):
    b.evaluate('''(() => {const e=document.querySelector('''+json.dumps(selector)+''');if(!e)throw Error('missing input');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,'''+json.dumps(value)+''');e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()''');time.sleep(.2)
def click_selector(selector):
    r=b.evaluate('''(() => {const e=document.querySelector('''+json.dumps(selector)+''');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()''')
    for t in ['mousePressed','mouseReleased']:b.call('Input.dispatchMouseEvent',{'type':t,'button':'left','clickCount':1,**r})
    time.sleep(.2)
b.navigate('?workspace=config-studio&tab=workflows')
b.evaluate('window.alerts=[];window.alert=m=>window.alerts.push(m)')
b.evaluate("(() => {const s=document.querySelector('section[aria-label=\"工作流编辑区域\"] select');s.value=[...s.options].find(o=>o.textContent.toUpperCase().includes('ROD')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()")
b.click('读取');b.wait('!!document.querySelector("input[aria-label=\\"组装目标 1\\"]")')
original=b.evaluate('[...document.querySelectorAll("input[aria-label^=\\"组装目标 \\"]")].map(e=>e.value)')
set_value('input[aria-label="组装目标 1"]','tags.constructor.bad');b.click('保存')
assert b.evaluate('!!document.querySelector("input[aria-label=\\"组装目标 1\\"]")')
assert '组装目标' in b.evaluate('document.body.innerText');checks.append('unsafe target blocks save')
set_value('input[aria-label="组装目标 1"]',original[0])
expression=b.evaluate('document.querySelector("textarea[aria-label=\\"组装表达式 1\\"]").value')
set_value('textarea[aria-label="组装表达式 1"]','UNKNOWN_TOKEN');b.click('保存')
assert b.evaluate('!!document.querySelector("input[aria-label=\\"组装目标 1\\"]")');checks.append('unknown token blocks save')
set_value('textarea[aria-label="组装表达式 1"]',expression)
b.click('添加组装行')
last=len(original)+1
set_value(f'input[aria-label="组装目标 {last}"]','tags.acceptance')
set_value(f'textarea[aria-label="组装表达式 {last}"]','"saved value"')
article=f'input[aria-label="组装目标 {last}"]'
b.evaluate('document.querySelector('+json.dumps(article)+').closest("article").scrollIntoView({block:"center"})')
assert b.evaluate('document.querySelector('+json.dumps(article)+').closest("article").textContent.includes("saved value")')
b.screenshot('workflow-assignments-edit.png')
checks.append('assignment constant preview reflects saved expression')
# Exercise copy and delete on the assignment card.
b.evaluate('document.querySelector('+json.dumps(article)+').closest("article").querySelectorAll("button")[3].textContent')
b.evaluate('''(() => {const a=document.querySelector('''+json.dumps(article)+''').closest('article');[...a.querySelectorAll('button')].find(e=>e.textContent==='复制行').click();})()''')
assert b.evaluate('document.querySelectorAll("input[aria-label^=\\"组装目标 \\"]").length')==last+1
b.evaluate('''(() => {const a=document.querySelector('''+json.dumps(f'input[aria-label="组装目标 {last+1}"]')+''').closest('article');[...a.querySelectorAll('button')].find(e=>e.textContent==='删除行').click();})()''')
checks.append('assignment add/copy/delete preserve row count')
# Grip drag can reorder. Ordinary inputs never opt into draggable.
assert b.evaluate('[...document.querySelectorAll("[draggable=true]")].every(e=>e.tagName==="SPAN"&&!!e.querySelector("svg"))')
b.evaluate('''(() => {const a=document.querySelector('''+json.dumps(article)+''').closest('article');const target=document.querySelector('input[aria-label="组装目标 1"]').closest('article');a.querySelector('[draggable=true]').dispatchEvent(new DragEvent('dragstart',{bubbles:true}));})()''')
time.sleep(.2)
b.evaluate("document.querySelector('input[aria-label=\"组装目标 1\"]').closest('article').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}))")
b.wait('document.querySelector("input[aria-label=\\"组装目标 1\\"]").value==="tags.acceptance"')
checks.append('grip-only row reorder')
# Capture the real exported artifact and feed it back through the file input.
b.evaluate('''window.exportedBlob=null;URL.createObjectURL=(blob)=>{window.exportedBlob=blob;return 'blob:acceptance';};HTMLAnchorElement.prototype.click=function(){};''')
b.click('导出');artifact=b.evaluate('window.exportedBlob.text().then(JSON.parse)')
assert artifact['workflow']['outputs'][0]['assignments'][0]['target']=='tags.acceptance'
file=OUT/'workflow-roundtrip.cairn-workflow-v3.json';file.write_text(json.dumps(artifact,ensure_ascii=False,indent=2),encoding='utf-8')
b.click('保存');b.wait('!document.querySelector("input[aria-label=\\"组装目标 1\\"]")')
b.click('要素设计');b.click('工作流设计');b.evaluate("(() => {const s=document.querySelector('section[aria-label=\"工作流编辑区域\"] select');s.value=[...s.options].find(o=>o.textContent.toUpperCase().includes('ROD')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()");b.click('读取')
b.wait('document.querySelector("input[aria-label=\\"组装目标 1\\"]")?.value==="tags.acceptance"')
doc=b.call('DOM.getDocument');node=b.call('DOM.querySelector',{'nodeId':doc['root']['nodeId'],'selector':'section[aria-label="工作流编辑区域"] input[type=file]'})['nodeId']
b.call('DOM.setFileInputFiles',{'nodeId':node,'files':[str(file)]})
b.wait('document.querySelector("input[aria-label=\\"组装目标 1\\"]")?.value==="tags.acceptance"')
b.click('保存');b.wait('!document.querySelector("input[aria-label=\\"组装目标 1\\"]")')
checks.append('actual workflow export/import/save roundtrip')
b.click('要素设计');b.click('读取/新建')
b.wait('!!document.querySelector("article[aria-label^=\\"字段 \\"]")')
for width in [1440,1100]:
    b.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':1000,'deviceScaleFactor':1,'mobile':False});time.sleep(.4)
    bounds=b.evaluate('''[...document.querySelectorAll('article[aria-label^="字段 "]')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,scroll:e.scrollWidth,client:e.clientWidth,rows:[...e.children].slice(0,2).map(e=>e.textContent)}})''')
    assert all(x['scroll']<=x['client']+2 for x in bounds),bounds
    assert all('必填' not in x['rows'][0] and '必填' in x['rows'][1] for x in bounds),bounds
    for scope in ['tags','extensions']:
        assert b.evaluate('!!document.querySelector('+json.dumps(f'section[aria-label="{scope} 字段组"]')+')')
    checks.append(f'field rows and permanent groups at viewport {width}')
    b.evaluate('document.querySelector(\"article[aria-label^=\\\"字段 \\\"]\").scrollIntoView({block:\"center\"})');time.sleep(.2)
    b.screenshot(f'field-editor-{width}.png')
english=b.evaluate('''[...document.querySelectorAll('article[aria-label^="字段 "] label')].filter(e=>e.textContent.includes('（en）')).map(e=>e.querySelector('input,textarea').value)''')
assert any(value=='' for value in english);checks.append('empty English inputs stay empty in DOM')
b.click('放弃草稿')
assert not b.errors,b.errors
result={'checks':checks,'runtimeErrors':b.errors}
(OUT/'studio-extended-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
