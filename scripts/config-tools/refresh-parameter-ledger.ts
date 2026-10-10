/** Contract inventory with explicit ownership and scoped evidence.
 * Source references are inspection aids, never proof that every parameter value
 * has been exercised. Browser/test evidence applies to the named family. */
import fs from 'node:fs';
import ts from 'typescript';
const file = 'src/configStudio/types.ts';
const source = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
const studio = 'src/configStudio/';
const adapter = 'src/components/Rules/configRuntime/configPackageAdapter.ts';
const core = 'src/components/Rules/core/RuleDrivenLayer.tsx';
type Family = { owner: string; editor: string[]; consumer: string[]; evidence: string[] };
const families: Record<string,Family> = {
  render: {owner:'要素设计 / Zoom 规则 / 扩展；全局几何默认',editor:[studio+'ConfigStudio.tsx',studio+'RenderRuleExtensionsEditor.tsx',studio+'ExtraRuleSettings.tsx',studio+'UnifiedRuleExtensions.tsx',studio+'RenderFieldConditionsEditor.tsx',studio+'NewRenderRulePanel.tsx',studio+'NativeSymbolSettings.tsx',studio+'LabelPlacementSettings.tsx'],consumer:[adapter,core,'src/components/Rules/rendering/labelLayout.ts'],evidence:['test:render-r7','test:compiled-runtime','test:render-templates','runtime-data-result.json','production-performance.json','test:display-parity','test:density-stability','test:label-placement','independent-matrix.json','independent-hierarchy.json','independent-dense.json','svg-offsets.json','bud-parity-browser.json','render-browser-result.json']},
  field: {owner:'要素设计 / 字段及高级设置；新工作流输入的默认定义',editor:[studio+'ConfigStudio.tsx',studio+'FieldAdvancedSettings.tsx',studio+'WorkflowFieldImport.tsx',studio+'fieldMigration.ts'],consumer:[studio+'runtime.ts',studio+'workflowFieldControl.ts',studio+'V3CardRenderer.ts',studio+'workflowRecord.ts'],evidence:['test:config-activation','test:workflow-field-controls','studio-extended-result.json','field-binding-browser-result.json']},
  workflow: {owner:'工作流设计 / 输入 / 分类与字段组装 / 绘制策略',editor:[studio+'V3WorkflowEditor.tsx',studio+'WorkflowControlSettings.tsx',studio+'WorkflowOutputEditor.tsx',studio+'WorkflowDrawingSettings.tsx',studio+'WorkflowFieldImport.tsx',studio+'WorkflowExpressionEditor.tsx',studio+'WorkflowValueConditionEditor.tsx'],consumer:[studio+'V3WorkflowRunner.tsx',studio+'workflowExpression.ts',studio+'workflowRecord.ts','src/components/Mapping/core/MeasuringModule.tsx'],evidence:['test:field-reuse-r8','test:workflow-drawing-r8','test:workflow-forms-r8','test:unified-r8','test:workflow-calculator','test:workflow-practical','test:v1-workflow-output-parity','test:workflow-capture','test:native-workflow-commit','native-workflow-matrix.json','workflow-capture-parity.json','lifecycle-browser-result.json']},
  interaction: {owner:'全局 / 几何五态交互；规则内高级覆盖',editor:[studio+'ConfigStudio.tsx',studio+'InteractionShapeSettings.tsx',studio+'RenderRuleExtensionsEditor.tsx'],consumer:[adapter,core],evidence:['test:native-contract','test:config-activation','interaction-parity.json','interaction-states.json','interaction-browser-result.json']},
  card: {owner:'要素设计 / 信息卡',editor:[studio+'V3CardEditor.tsx'],consumer:[studio+'V3CardRenderer.ts'],evidence:['test:card-parity','test:package-roundtrip']},
  classification: {owner:'要素设计 / 分类树与继承',editor:[studio+'ConfigStudio.tsx'],consumer:[studio+'runtime.ts',adapter,studio+'V3CardRenderer.ts',studio+'V3WorkflowRunner.tsx'],evidence:['test:config-studio-v3','test:config-activation','independent-hierarchy.json']},
  context: {owner:'要素设计 / 全局主从上下文绑定',editor:[studio+'ConfigStudio.tsx'],consumer:[adapter,core],evidence:['test:v3-semantic-parity','test:config-studio-v3','interaction-browser-result.json']},
  package: {owner:'全局设置 / 配置包保存、导入与版本',editor:[studio+'ConfigStudio.tsx',studio+'ConfigLab.tsx',studio+'fieldMigration.ts'],consumer:[studio+'configActivation.ts',studio+'configLabStorage.ts',studio+'package.ts',studio+'runtime.ts'],evidence:['test:package-roundtrip','test:config-activation','lifecycle-browser-result.json']},
};
function family(type:string): keyof typeof families {
  if (/^Workflow|^SearchProfile/.test(type)) return 'workflow';
  if (/^Field|^SelectOption/.test(type)) return 'field';
  if (/^Card/.test(type)) return 'card';
  if (/^Interaction|^GeometryInteraction/.test(type)) return 'interaction';
  if (/^Context|^Containment/.test(type)) return 'context';
  if (/^Classification|^Category|^Inheritance/.test(type)) return 'classification';
  if (/^Config|^ControlledRegistry|^Parity/.test(type)) return 'package';
  return 'render';
}
function policy(type:string,path:string): {state:string;note:string} {
  if (/^ConfigValidation|^AffectedFeature|^MountedFeatureRecord|^ConfigPackageV2Import/.test(type)) return {state:'diagnostic_or_import_shape',note:'报告/输入类型，不是新包内的普通可编辑参数。'};
  if (/^Parity/.test(type)) return {state:'generated_provenance',note:'迁移来源与映射报告；resolved 不表示独立浏览器全量等价。'};
  if (type==='WorkflowFieldSource')return {state:'tracked_field_source',note:'模块内搜索导入建立的来源、快照与覆写记录，修改输入属性会记录覆写；身份不能任意手写。'};
  if(type==='ConfigRegistries'&&path==='optionSets'||path.startsWith('optionSource'))return {state:'compatibility_metadata',note:'旧共享选项来源只用于导入迁移；原生 r8 使用字段内部的对照行。'};
  if (type === 'AdvancedRenderRule' || /^(legacy|advanced|sourceRuntimeField|sourceProfile)(\.|$)/.test(path) || /^(containment|policies)(\.|$)/.test(path) || /^optionSource\.runtimeField$|^scenes\.(editor|search)$/.test(path)) return {state:'compatibility_metadata',note:'旧包来源/兼容记录；不作为原生可执行开关，不宣称可以随意编辑并执行。'};
  if (type === 'GeometryProfile' && /^(color|style|geometryStack|label|legacyDisplay)(\.|$)/.test(path) || type === 'RenderLabelStyle' && /^(font|size|italic|underline)$/.test(path) || type === 'ZoomPriorityRule' && /^(minZoom|maxZoom|minExclusive|maxExclusive|conditionalOverrides|labelRole|interaction)(\.|$)/.test(path) || type === 'WorkflowDefinition' && /^(target|assignments)(\.|$)/.test(path) || type === 'WorkflowOutput' && path === 'geometry.allowed') return {state:'compatibility_metadata',note:'旧契约导入后使用规范化的新路径；不另外提供互相冲突的旧设置入口。'};
  if (/^schemaVersion$|^contractRevision$|^sourceManifestSha256$|^(nodeId|fieldId|id|children|overrideOf)$/.test(path) || type === 'ConfigEngineSettings' && /^world(\.|$)/.test(path)) return {state:'system_managed',note:'由规范/编辑器维护身份、版本兼容、世界或分类拓扑；World 由活动世界自动注入。'};
  if (type === 'ControlledRegistryItem' || type === 'ConfigRegistries' && !path.startsWith('optionSets')) return {state:'controlled_registry_metadata',note:'受控能力目录；注册名字不等于注册任意新执行器，普通标准工作流仍为 composed。'};
  if (type === 'WorkflowDefinition' && /^external(\.|$)/.test(path)) return {state:'explicit_external_exception',note:'只接受铁路、车站、TRP 三个既有整体工作流。'};
  if (type === 'RenderFallbackExtension' && /whenRuleMissing|whenGeometryInvalid/.test(path)) return {state:'editable_guarded_values',note:'旧/调试候选枚举保留类型兼容；未实现取值不能保存为有效原生配置，UI 不提供。'};
  return {state:'editable_with_family_evidence',note:'有明确编辑归属和运行消费路径；所列测试为能力族证据，不声称本成员全部取值都逐个操作验收。'};
}
const parameters: any[]=[];
function walk(typeName:string,node:ts.TypeNode,prefix='',variant='') {
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {node.types.forEach((item,index)=>walk(typeName,item,prefix,`${variant}/${index}`));return;}
  if (!ts.isTypeLiteralNode(node)) return;
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.name || !member.type) continue;
    const field=member.name.getText(source).replace(/^['"]|['"]$/g,'');const property=prefix?`${prefix}.${field}`:field;
    const chosen=family(typeName),f=families[chosen];
    parameters.push({type:typeName,field:property,variant,optional:Boolean(member.questionToken),declarationLine:source.getLineAndCharacterOfPosition(member.getStart(source)).line+1,valueType:member.type.getText(source),...policy(typeName,property),owner:f.owner,editor:f.editor,consumer:f.consumer,validation:[studio+'nativeContractValidation.ts',studio+'runtime.ts'],serialization:studio+'package.ts',defaultSource:[studio+'legacyProjectAdapter.ts',studio+'v32Defaults.ts','CairnMap_V32_FieldReuse_Drawing_r4.config.json in CAIRNMAP_ACCEPTANCE_OUT'],inheritance:'global defaults -> geometry/category inheritance -> Zoom rule -> field condition -> interaction; explicit workflow controls keep their authored settings',familyEvidence:f.evidence});
    if (ts.isTypeLiteralNode(member.type) || ts.isUnionTypeNode(member.type)) walk(typeName,member.type,property,variant);
  }
}
for (const declaration of source.statements) if (ts.isTypeAliasDeclaration(declaration)) walk(declaration.name.text,declaration.type);
const counts=Object.fromEntries([...new Set(parameters.map(p=>p.state))].map(state=>[state,parameters.filter(p=>p.state===state).length]));
fs.writeFileSync('scripts/config-tools/fixtures/v3-parameter-ledger.json',JSON.stringify({schemaVersion:'cairnmap.v3-parameter-ledger.v2',generatedFrom:file,coverageDefinition:'Named contract properties, nested inline properties and discriminated union variants; dynamic Record keys are authored data, not separately counted switches.',evidenceScope:'Per-family source inspection and representative runtime tests. A consumer source path or field count alone is not end-to-end proof for every property/value. Compatibility metadata and guarded unsupported choices are explicitly identified.',counts,parameters},null,2)+'\n');
console.log(JSON.stringify({parameters:parameters.length,counts}));
