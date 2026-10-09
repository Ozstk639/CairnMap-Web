import json, os
from pathlib import Path
from browser_check import Browser
OUT=Path(os.environ.get('CAIRNMAP_ACCEPTANCE_OUT',str(Path(__file__).parent/'artifacts')));OUT.mkdir(parents=True,exist_ok=True)
b=Browser();checks=[]
def choose_parent():
 b.navigate('?workspace=config-studio')
 b.evaluate("(()=>{const s=[...document.querySelectorAll('label')].find(e=>e.textContent.trim().startsWith('编辑分类')).querySelector('select');s.value=[...s.options].find(o=>o.textContent.includes('ROD')).value;s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
 b.click('读取/新建');b.click('新增要素分类')
 b.wait("!!document.querySelector('section[aria-label=\"新增要素分类\"]')")
def code(value):
 b.evaluate("(()=>{const e=document.querySelector('input[aria-label=\"新分类代码\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+json.dumps(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()")
choose_parent();code('TESTINHERIT');b.click('取消新增分类')
assert not b.evaluate("[...document.querySelectorAll('select option')].some(e=>e.textContent.includes('TESTINHERIT'))")
checks.append('cancel does not add a category')
b.click('新增要素分类');code('TESTINHERIT');b.click('创建分类草稿');b.click('核验');b.wait("document.body.innerText.includes('核验通过')")
checks.append('new category inherits actual parent and validates')
b.click('工作流设计');assert b.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent")=='要素设计'
b.click('放弃草稿');choose_parent();code('TESTCOPY')
groups=b.evaluate("[...document.querySelector('select[aria-label=\"分类显示规则模板\"]').querySelectorAll('optgroup')].map(g=>({name:g.label,count:g.querySelectorAll('option').length}))")
assert groups[0]['name']=='同父级平级分类（优先）'
b.evaluate("(()=>{const s=document.querySelector('select[aria-label=\"分类显示规则模板\"]');const options=s.querySelectorAll('optgroup[label=\"当前父级\"] option');s.value=options[0].value;s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
b.click('创建分类草稿');b.click('核验');b.wait("document.body.innerText.includes('核验通过')")
checks.append('compatible whole parent group copied with sibling-first selector and valid references')
b.screenshot('category-template-editor.png');b.click('放弃草稿')
result={'checks':checks,'groups':groups,'runtimeErrors':b.errors};(OUT/'category-editor-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');assert not b.errors,b.errors;print(json.dumps(result,ensure_ascii=False))
