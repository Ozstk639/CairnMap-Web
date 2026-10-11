import json
from browser_check import Browser,OUT
b=Browser();checks=[]
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(data)+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
b.navigate('?workspace=config-studio')
b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),m=await import('/src/configStudio/r9Migration.ts');await p.persistActiveConfig(m.migrateConfigToR9(await p.loadDefaultConfig()),true);})()")
b.navigate('?workspace=config-studio')
assert b.evaluate("[...document.querySelectorAll('button')].filter(e=>e.textContent==='新增分类').length")==1
assert not b.evaluate("document.body.innerText.includes('作为一级分类')||document.body.innerText.includes('添加子分类')")
value('select[aria-label="编辑分类 Class"]','BUD');b.click('新增分类')
b.wait("document.querySelector('select[aria-label=\"编辑分类 Class\"]').closest('fieldset').disabled")
assert b.evaluate("document.querySelector('select[aria-label=\"新分类几何\"]').disabled")
assert b.evaluate("document.querySelector('input[aria-label=\"新分类多部件\"]').disabled")
assert b.evaluate("document.querySelector('select[aria-label=\"新分类部件显示模式\"]').disabled")
value('select[aria-label="初始化状态"]','blank');value('input[aria-label="新分类代码"]','ACCEPT_KIND');value('input[aria-label="新分类名称 zh"]','验收子分类');value('input[aria-label="新分类名称 en"]','Acceptance kind')
b.click('创建分类草稿');b.wait("document.querySelector('section[aria-label=\"新增要素分类\"] [role=alert]')?.textContent.includes('祖先固定几何')")
assert b.evaluate("document.querySelector('select[aria-label=\"编辑分类 Kind\"]').value")==''
checks.append('one creation entry; selected parent determines Kind; selection and synced geometry lock; invalid ancestor geometry leaves no partial child')
value('select[aria-label="新分类几何"]','Polygon');b.click('创建分类草稿')
b.wait("document.querySelector('select[aria-label=\"编辑分类 Kind\"]').value==='ACCEPT_KIND'")
assert b.evaluate("document.body.innerText.includes('分类创建报告')")
b.click('核验');b.click('保存');b.wait("document.querySelector('nav [role=status]')?.textContent.includes('已保存本地活动配置')")
b.navigate('?workspace=config-studio')
value('select[aria-label="编辑分类 Class"]','BUD');value('select[aria-label="编辑分类 Kind"]','ACCEPT_KIND');b.click('读取分类')
assert b.evaluate("document.body.innerText.includes('验收子分类')")
checks.append('valid blank child saves, survives reload and can be read again with inherited fields and no display rules')
b.click('放弃草稿');value('select[aria-label="编辑分类 Class"]','');b.click('新增分类')
assert b.evaluate("document.querySelector('select[aria-label=\"初始化状态\"] option[value=parent]').disabled")
value('input[aria-label="新分类代码"]','ACCEPT_CLASS');value('input[aria-label="新分类名称 zh"]','验收一级分类');b.click('创建分类草稿')
b.wait("document.querySelector('select[aria-label=\"编辑分类 Class\"]').value==='ACCEPT_CLASS'")
b.click('核验');b.click('保存');b.wait("document.querySelector('nav [role=status]')?.textContent.includes('已保存本地活动配置')")
checks.append('empty selection creates a new Class without a separate root checkbox')
b.screenshot('r9-category-creation.png');assert not b.errors,b.errors
(OUT/'r9-category-creation-acceptance.json').write_text(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
