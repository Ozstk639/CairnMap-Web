import json,os
from browser_check import Browser,OUT
b=Browser();checks=[]
def set_value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e)throw Error('Missing '+"+json.dumps(selector)+");const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,"+json.dumps(data)+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()")
b.navigate('?workspace=config-studio')
b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),m=await import('/src/configStudio/r9Migration.ts');const c=m.migrateConfigToR9(await p.loadDefaultConfig());const n=c.nodes.find(n=>n.path.class==='WRP'&&!n.path.kind);n.fields.push({fieldId:'prefill-status-test',key:'tags.status',type:'enum',cardinality:'single',input:'select',labels:{zh:'验收状态',en:''},description:{zh:'',en:''},optionValueType:'number',options:[{value:'0',label:{zh:'关闭',en:''}},{value:'1',label:{zh:'开启',en:'On'}}]});await p.persistActiveConfig(c,true);})()")
b.navigate('?workspace=config-studio&tab=workflows')
set_value('section[aria-label="工作流编辑区域"] select','v3-wrp_warp');b.click('读取');b.click('添加控件')
b.evaluate("window.prefillUnit=[...document.querySelectorAll('textarea[placeholder=\"控件标题\"]')].find(e=>e.value==='新输入项').closest('article');[...window.prefillUnit.querySelectorAll('button')].find(e=>e.textContent==='预填').click()")
b.wait("!!document.querySelector('[role=dialog][aria-label=\"字段预填\"]')")
assert b.evaluate('document.getElementById("root").inert')
set_value('input[aria-label="预填字段搜索"]','status')
assert b.evaluate("document.activeElement?.tagName")!='BODY'
set_value('select[aria-label="预填字段"]','tags.status');b.evaluate("window.prefillUnit.querySelector('input[type=checkbox]').click()");b.click('导入预填')
assert b.evaluate("window.prefillUnit.querySelector('textarea[placeholder=\"控件标题\"]').value")=='验收状态'
assert not b.evaluate('document.getElementById("root").inert')
assert not b.evaluate("document.body.innerText.includes('恢复全部跟随')")
b.click('保存');b.wait("!document.querySelector('section[aria-label=\"工作流编辑区域\"] textarea')")
saved=b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return p.getActiveConfigSnapshot().workflows.find(w=>w.id==='v3-wrp_warp').steps.flatMap(s=>s.controls??[]).find(c=>c.prefillField==='tags.status')})()")
assert saved['kind']=='select' and saved['optionValueType']=='number' and 'fieldSource' not in saved
checks.append('real control prefill injects numeric options and empty English; modal isolates background; save stores no live relation')
b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');const c=structuredClone(p.getActiveConfigSnapshot()),n=c.nodes.find(n=>n.path.class==='WRP'&&!n.path.kind);n.fields.find(f=>f.key==='tags.status').labels.zh='来源更新';await p.persistActiveConfig(c,true);})()")
b.navigate('?workspace=config-studio&tab=workflows');set_value('section[aria-label="工作流编辑区域"] select','v3-wrp_warp');b.click('读取')
assert b.evaluate("[...document.querySelectorAll('textarea[placeholder=\"控件标题\"]')].some(e=>e.value==='验收状态')")
b.click('放弃草稿');b.click('要素设计');set_value('select[aria-label="编辑分类 Class"]','WRP');b.click('读取分类')
assert not b.evaluate("document.body.innerText.includes('默认值、提示、条件与引用')")
assert not b.evaluate("document.body.innerText.includes('信息卡手动覆写对照')")
assert not b.evaluate("document.body.innerText.includes('覆写值对照')")
checks.append('source changes do not update imported controls; r9 fields and cards omit legacy input defaults and override panels')
b.click('添加卡片项')
b.evaluate("(()=>{const s=[...document.querySelectorAll('h3')].find(e=>e.textContent==='信息卡设置').closest('section');window.cardUnit=[...s.querySelectorAll('article')].at(-1);[...window.cardUnit.querySelectorAll('button')].find(e=>e.textContent==='预填').click();})()")
b.wait("!!document.querySelector('[role=dialog][aria-label=\"字段预填\"]')")
set_value('input[aria-label="预填字段搜索"]','status');set_value('select[aria-label="预填字段"]','tags.status');b.click('导入预填')
assert b.evaluate("window.cardUnit.querySelector('label input').value")=='tags.status'
b.click('核验');b.click('保存');b.wait("document.querySelector('nav [role=status]')?.textContent.includes('已保存本地活动配置')")
card=b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return p.getActiveConfigSnapshot().nodes.find(n=>n.path.class==='WRP'&&!n.path.kind).card.items.at(-1)})()")
assert card['label']['zh']=='来源更新' and card['valueOptions'][0]['label']['zh']=='关闭' and 'valueMode' not in card and 'labelMode' not in card
checks.append('actual card prefill injects its source/title/format/dictionary once and saves without follow or override state')
b.screenshot('r9-prefill-independent.png');assert not b.errors,b.errors
(OUT/'r9-final-prefill-acceptance.json').write_text(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
