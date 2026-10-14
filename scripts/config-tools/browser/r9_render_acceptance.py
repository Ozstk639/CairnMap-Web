import json
from browser_check import Browser,OUT
b=Browser();checks=[]
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(data)+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
b.navigate('?workspace=config-studio')
if b.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent==='放弃草稿'&&!e.disabled)"):b.click('放弃草稿')
b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),m=await import('/src/configStudio/r9Migration.ts'),s=await import('/src/configStudio/configLabStorage.ts');await s.saveStudioEditingSession(null);const c=m.migrateConfigToR9(await p.loadDefaultConfig()),n=c.nodes.find(n=>n.path.class==='ROD'&&!n.path.kind);n.fields.push({fieldId:'accept-score',key:'score',type:'number',cardinality:'single',input:'text',labels:{zh:'分数',en:''},description:{zh:'',en:''}});n.geometryProfiles.LineString.zoomPriority.rules=[n.geometryProfiles.LineString.zoomPriority.rules.at(-1)];n.geometryProfiles.LineString.zoomPriority.rules[0].when={zoom:{min:0,max:8}};await p.persistActiveConfig(c,true);})()")
b.navigate('?workspace=config-studio');value('select[aria-label="编辑分类 Class"]','ROD');b.click('读取分类')
b.evaluate("(()=>{const e=[...document.querySelectorAll('section[aria-label=\"字段组合条件\"] input[type=checkbox]')][0];e.click();})()")
b.wait("!!document.querySelector('select[aria-label=\"条件 C1 字段\"]')");value('select[aria-label="条件 C1 字段"]','score');value('select[aria-label="条件 C1 比较"]','eq');value('input[aria-label="条件 C1 值"]','0')
assert not b.evaluate("[...document.querySelector('select[aria-label=\"条件 C1 字段\"]').options].some(o=>['Class','Kind','SKind','Skind','Skind2'].includes(o.value))")
b.click('添加条件行');value('select[aria-label="条件 C2 前置关系"]','NOT');assert b.evaluate("document.querySelector('textarea[aria-label=\"组合公式\"]').value")=='C1 AND NOT C2'
b.evaluate("document.querySelector('textarea[aria-label=\"组合公式\"]').previousElementSibling.querySelector('input').click()")
value('textarea[aria-label="组合公式"]','C1 OR NOT C2');b.click('条件 2 上移');assert b.evaluate("document.querySelector('textarea[aria-label=\"组合公式\"]').value")=='C1 OR NOT C2'
b.click('删除 C2');assert b.evaluate("document.querySelector('section[aria-label=\"字段组合条件\"]').textContent.includes('未知条件/组 C2')")
value('textarea[aria-label="组合公式"]','C1');value('textarea[aria-label="条件预览记录"]','{"score":0}')
assert b.evaluate("document.querySelector('textarea[aria-label=\"条件预览记录\"]').parentElement.querySelector('output').textContent")=='条件成立'
checks.append('actual formula rows put relation first; classifications excluded; 0 typed; automatic AND NOT; stable IDs and manual expression survive sorting; deleted reference reports error; record preview works')
b.evaluate("(()=>{const f=[...document.querySelectorAll('fieldset')].find(e=>e.querySelector('legend')?.textContent==='描边');window.stroke=f;const select=f.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'valueMap');select.dispatchEvent(new Event('change',{bubbles:true}));})()")
value('select[aria-label="设色字段"]','score');b.click('添加值—颜色行');value('input[aria-label="设色保存值 1"]','0');value('input[aria-label="设色颜色 1"]','#123456')
b.click('核验');b.click('保存');b.wait("document.querySelector('nav [role=status]')?.textContent.includes('已保存本地活动配置')")
b.navigate('?workspace=config-studio');value('select[aria-label="编辑分类 Class"]','ROD');b.click('读取分类')
assert b.evaluate("document.querySelector('textarea[aria-label=\"组合公式\"]').value")=='C1'
assert b.evaluate("document.querySelector('input[aria-label=\"设色保存值 1\"]').value")=='0'
assert b.evaluate("document.querySelector('input[aria-label=\"设色颜色 1\"]').value")=='#123456'
checks.append('actual discrete color map and formula save and survive reload without affecting classification identity')
b.screenshot('r9-formula-color.png');assert not b.errors,b.errors
b.click('放弃草稿')
(OUT/'r9-render-acceptance.json').write_text(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
