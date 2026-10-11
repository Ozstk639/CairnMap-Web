import type { ConfigPackageV3, SelectOption } from './types';
import { migrateWorkflowForms, migrateUnmodifiedFactoryOrder } from './workflowFormMigration';
import { migrateWorkflowDrawings } from './workflowDrawingMigration';
import { resolveEffectiveFields, resolveGeometryProfile } from './runtime';

/** Imports retain the old executed list before discarding registry pointers. */
export function migrateFieldsToR8(value: ConfigPackageV3): ConfigPackageV3 {
  const config = structuredClone(value);
  if (value.contractRevision >= 8) return config;
  const sets = new Map(config.registries.optionSets?.map(set=>[set.id,set.options]) ?? []);
  const copied = (source: { options?:SelectOption[];optionSource?:{registryKey:string} }, field=false) => {
    if (!source.optionSource) return;
    const resolved = field ? sets.get(source.optionSource.registryKey) ?? source.options : sets.get(source.optionSource.registryKey);
    if (!resolved) throw new Error(`旧选项来源 ${source.optionSource.registryKey} 不存在，请修复后再迁移。`);
    source.options = structuredClone(resolved);
    delete source.optionSource;
  };
  // Existing cards retain authored titles and executed value formatting.
  for (const node of config.nodes) if (node.card?.mode === 'fields') for (const item of node.card.items) {
    item.labelMode ??= 'override'; item.valueMode ??= 'override';
    if (item.options?.format === 'enum') item.valueOptions ??= structuredClone(resolveEffectiveFields(value,node.path).find(field=>field.key===item.source)?.options ?? []);
    if (['CreateBy','CreateTime','ModifityBy','ModifityTime'].includes(item.source)) delete item.fallbackSources;
  }
  for (const node of config.nodes) {
    // These two aliases existed only to serve old RLE display fallbacks.
    if (node.path.class === 'RLE') node.fields = node.fields.filter(field=>!['LineName','LineID'].includes(field.key));
    for (const field of node.fields) {
      copied(field,true);
      if (node.path.class === 'RLE' && field.key === 'direction' && !field.options?.length) {
        field.options = ['下行','上行','其他','展示线','联络线','股道','支线','无方向联络线'].map((zh,index)=>({value:String(index),label:{zh,en:''}}));
        field.optionValueType = 'number';
      }
    }
    for (const profile of Object.values(node.geometryProfiles)) for (const rule of profile?.zoomPriority.rules ?? []) {
      if (node.path.class==='RLE' && rule.label?.fallbackSources) rule.label.fallbackSources=rule.label.fallbackSources.filter(key=>!['LineName','LineID'].includes(key));
    }
  }
  for (const workflow of config.workflows) for (const step of workflow.steps) for (const control of step.controls ?? []) copied(control);
  config.workflows=config.workflows.map(workflow=>migrateUnmodifiedFactoryOrder(migrateWorkflowForms(migrateWorkflowDrawings(workflow))));
  for(const workflow of config.workflows)for(const step of workflow.steps.filter(step=>step.kind==='geometry'&&step.geometryRole!=='auxiliary')){
    const output=workflow.outputs.find(output=>output.id===step.outputId);if(output&&step.drawing)step.drawing.multiple??=resolveGeometryProfile(config,output.classification,output.geometry.selected)?.allowMultipleParts??false;
  }
  const tpp=config.nodes.find(node=>node.path.class==='TPP'&&!node.path.kind);
  if(tpp&&!tpp.fields.some(field=>field.key==='TGTcoordinate'))tpp.fields.push({fieldId:'TPP-TGTcoordinate',key:'TGTcoordinate',type:'json',cardinality:'single',input:'json',labels:{zh:'目标坐标',en:''},description:{zh:'目标点绘制返回的单点坐标对象。',en:''},coordinateFormat:'pointObject'});
  delete config.registries.optionSets;
  config.contractRevision = 8;
  return config;
}
