import base64,json
from browser_check import Browser,OUT
b=Browser();checks=[]
def value(selector,data):
 b.evaluate("(()=>{const e=document.querySelector("+json.dumps(selector)+");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,"+json.dumps(data)+");e.dispatchEvent(new Event('change',{bubbles:true}));})()")
def upload(path):
 doc=b.call('DOM.getDocument')['root']['nodeId'];node=b.call('DOM.querySelector',{'nodeId':doc,'selector':'input[accept=".json,.zip"]'})['nodeId'];b.call('DOM.setFileInputFiles',{'nodeId':node,'files':[str(path.resolve())]})
b.navigate('?workspace=config-studio')
if b.evaluate("!!document.querySelector('[aria-label=\"Class 树导入总控\"]')"):
 b.click('放弃导入 Class 树');b.wait("!document.querySelector('[aria-label=\"Class 树导入总控\"]')")
if b.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent==='放弃草稿'&&!e.disabled)"):b.click('放弃草稿')
encoded=b.evaluate("""(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),m=await import('/src/configStudio/r9Migration.ts'),c=await import('/src/configStudio/categoryInitialization.ts'),a=await import('/src/configStudio/categoryArtifact.ts');let cfg=m.migrateConfigToR9(await p.loadDefaultConfig());const r={code:'TREE_ACCEPT',labels:{zh:'树验收',en:''},mode:'blank',sync:{fields:false,geometry:false,display:false,card:false},geometry:'Point',multiple:false,anchor:'featureBbox'};const root=c.initializeCategory(cfg,r);cfg=c.initializeCategory(root.config,{...r,parentId:root.node.nodeId,code:'FIRST'}).config;const second=c.initializeCategory(cfg,{...r,parentId:root.node.nodeId,code:'SECOND'});cfg=second.config;await p.persistActiveConfig(cfg,true);const staged=structuredClone(cfg);staged.nodes=staged.nodes.filter(n=>n.nodeId!==second.node.nodeId);staged.nodes.find(n=>n.nodeId===root.node.nodeId).children=staged.nodes.find(n=>n.nodeId===root.node.nodeId).children.filter(id=>id!==second.node.nodeId);const bytes=new Uint8Array(await(await a.categoryArtifactBlob(await a.createCategoryArtifact(staged,root.node.nodeId,'classTree'))).arrayBuffer());return btoa(String.fromCharCode(...bytes));})()""")
path=OUT/'r9-tree-import-fixture.zip';path.write_bytes(base64.b64decode(encoded));b.navigate('?workspace=config-studio');upload(path)
b.wait("!!document.querySelector('[aria-label=\"Class 树导入总控\"]')")
assert b.evaluate("document.querySelector('select[aria-label=\"编辑分类 Class\"]').disabled")
assert b.evaluate("document.querySelector('[aria-label=\"Class 树隔离编辑容器\"]')!==null")
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return p.getActiveConfigSnapshot().nodes.some(n=>n.path.class==='TREE_ACCEPT'&&n.path.kind==='SECOND')})()")
value('select[aria-label="编辑分类 Kind"]','FIRST');b.click('读取分类');b.click('添加字段');b.click('核验');b.click('保存')
b.wait("document.querySelector('nav [role=status]')?.textContent.includes('已保存节点到暂存')")
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return !p.getActiveConfigSnapshot().nodes.find(n=>n.path.class==='TREE_ACCEPT'&&n.path.kind==='FIRST').fields.length})()")
checks.append('actual ZIP enters locked Class container; inner save only updates staged tree; saved main tree retains removed child until outer save')
b.wait("(async()=>{const s=await import('/src/configStudio/configLabStorage.ts');const e=await s.readStudioEditingSession();return Boolean(e?.tree)&&!e.draft&&!e.editing})()")
b.navigate('?workspace=config-studio')
assert b.evaluate("document.querySelector('select[aria-label=\"编辑分类 Kind\"]').value")=='FIRST'
assert b.evaluate("!!document.querySelector('[aria-label=\"Class 树导入总控\"]')")
b.click('工作流设计');assert b.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent")=='要素设计'
checks.append('refresh restores staged tree and selection; unfinished outer transaction blocks tab switch')
b.click('核验整棵 Class 树');b.wait("!document.querySelector('[aria-label=\"Class 树导入总控\"] button:nth-of-type(2)').disabled")
b.click('保存 Class 树到总配置');b.wait("!document.querySelector('[aria-label=\"Class 树导入总控\"]')")
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');const c=p.getActiveConfigSnapshot();return !c.nodes.some(n=>n.path.class==='TREE_ACCEPT'&&n.path.kind==='SECOND')&&c.nodes.find(n=>n.path.class==='TREE_ACCEPT'&&n.path.kind==='FIRST').fields.length===1})()")
checks.append('outer Save atomically replaces the Class tree, removes omitted old child and preserves inner edits')
upload(path);b.wait("!!document.querySelector('[aria-label=\"Class 树导入总控\"]')");b.click('放弃导入 Class 树');b.wait("!document.querySelector('[aria-label=\"Class 树导入总控\"]')")
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');return p.getActiveConfigSnapshot().nodes.find(n=>n.path.class==='TREE_ACCEPT'&&n.path.kind==='FIRST').fields.length===1})()")
checks.append('outer discard restores the complete saved main package instead of applying staged content')
encoded=b.evaluate("""(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts'),a=await import('/src/configStudio/categoryArtifact.ts');const c=structuredClone(p.getActiveConfigSnapshot()),root=c.nodes.find(n=>n.path.class==='TREE_ACCEPT'&&!n.path.kind),child=c.nodes.find(n=>n.path.class==='TREE_ACCEPT'&&n.path.kind==='FIRST');const f={fieldId:'fixed-ui-test',key:'tags.fixed',type:'string',cardinality:'single',input:'text',labels:{zh:'上游固定定义',en:''},description:{zh:'',en:''},inheritance:'sealed'};root.fields.push(f);await p.persistActiveConfig(c,true);const exported=structuredClone(c);exported.nodes.find(n=>n.nodeId===root.nodeId).fields=[];exported.nodes.find(n=>n.nodeId===child.nodeId).fields.push({...f,fieldId:'local-file-field',labels:{zh:'导入的不同定义',en:''},inheritance:undefined});const bytes=new Uint8Array(await(await a.categoryArtifactBlob(await a.createCategoryArtifact(exported,child.nodeId,'node'))).arrayBuffer());return btoa(String.fromCharCode(...bytes));})()""")
single=OUT/'r9-single-conflict-fixture.zip';single.write_bytes(base64.b64decode(encoded));b.navigate('?workspace=config-studio');upload(single)
b.wait("!!document.querySelector('[role=dialog][aria-label=\"分类导入冲突\"]')")
assert b.evaluate('document.getElementById("root").inert')
b.click('取消导入');assert not b.evaluate('document.getElementById("root").inert')
upload(single);b.wait("!!document.querySelector('[role=dialog][aria-label=\"分类导入冲突\"]')");b.click('按上游约束修正后继续');b.wait("!document.querySelector('[role=dialog]')")
b.click('核验');b.click('保存');b.wait("document.querySelector('nav [role=status]')?.textContent.includes('已保存本地活动配置')")
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');const c=p.getActiveConfigSnapshot();return c.nodes.find(n=>n.path.class==='TREE_ACCEPT'&&!n.path.kind).fields[0].labels.zh==='上游固定定义'&&!c.nodes.find(n=>n.path.class==='TREE_ACCEPT'&&n.path.kind==='FIRST').fields.some(f=>f.key==='tags.fixed')})()")
checks.append('actual single-node ZIP shows a blocking conflict modal; cancel preserves main; accept uses upstream fixed field and saves without changing parent')
assert b.evaluate("(async()=>{const p=await import('/src/configStudio/defaultConfigProvider.ts');const expected=await p.readDurableActiveConfig(),changed=structuredClone(expected.config);changed.displayName.zh='并发保存验证';await p.persistActiveConfig(changed,true);try{await p.persistActiveConfig(expected.config,true,expected);return false;}catch(error){return String(error).includes('在核验后已变化');}})()")
checks.append('durable save transaction rejects a stale expected package after another completed save')
b.screenshot('r9-class-tree-transaction.png');assert not b.errors,b.errors
(OUT/'r9-category-tree-acceptance.json').write_text(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'runtimeErrors':b.errors},ensure_ascii=False))
