import json, os, time
from pathlib import Path
from browser_check import Browser
OUT=Path(os.environ.get('CAIRNMAP_ACCEPTANCE_OUT',str(Path(__file__).parent/'artifacts')));OUT.mkdir(parents=True,exist_ok=True)
b=Browser();checks=[]
b.navigate('?workspace=config-studio');b.click('读取/新建')
b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('仅显示启用状态'));if(e)e.click();return true;})()")
b.wait("!!document.querySelector('section[aria-label=\"字段组合条件\"]')")
assert not b.evaluate("[...document.querySelectorAll('section[aria-label=\"字段组合条件\"] select[aria-label=\"条件字段\"] option')].some(e=>['Class','Kind','Skind','Skind2','SKind','SKind2'].includes(e.value))")
b.click('添加渲染规则');b.wait("!!document.querySelector('section[aria-label=\"新增渲染规则\"]')")
scope="document.querySelector('section[aria-label=\"新增渲染规则\"]')"
for label in ['新增规则 Zoom 下界','新增规则 Zoom 上界']:
 b.evaluate("(()=>{const e="+scope+".querySelector('input[aria-label="+json.dumps(label)+"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'8');e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()")
b.evaluate("(()=>{const e="+scope+".querySelector('select[aria-label=\"规则内容模板\"]');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
assert b.evaluate(scope+".querySelector('input[aria-label=\"新增规则 Zoom 下界\"]').value")=='8'
assert b.evaluate(scope+".querySelectorAll('section[aria-label=\"字段组合条件\"] input[type=checkbox]')[0].checked") is False
b.evaluate(scope+".querySelector('section[aria-label=\"字段组合条件\"] input[type=checkbox]').click();true")
b.evaluate("(()=>{const e="+scope+".querySelector('select[aria-label=\"条件字段\"]');e.value='Name';e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
b.evaluate("(()=>{const e="+scope+".querySelector('input[aria-label=\"字段条件保存值\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'new-rule');e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()")
b.click('加入规则草稿');b.wait("!document.querySelector('section[aria-label=\"新增渲染规则\"]')")
checks.append('single-level rule content copy preserves target Zoom and excludes source conditions')
b.click('核验');b.wait("document.body.innerText.includes('核验通过')")
checks.append('r7 non-classification field rule validates in actual editor')
b.click('工作流设计');assert b.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent")=='要素设计'
checks.append('new-rule draft blocks top-level tab switching')
b.screenshot('r7-rule-editor.png');b.click('放弃草稿')
result={'checks':checks,'runtimeErrors':b.errors};(OUT/'r7-editor-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');assert not b.errors,b.errors;print(json.dumps(result,ensure_ascii=False))
