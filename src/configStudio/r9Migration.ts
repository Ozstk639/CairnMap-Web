import type { CardItem, ConfigPackageV3 } from './types';
import { resolveCardConfiguration, resolveEffectiveFields } from './runtime';
import { resolveWorkflowFields, fieldImportErrors } from './fieldReuse';
import { migrateFieldsToR8 } from './fieldMigration';
import { migrateRenderRulesToR7 } from './renderRuleMigration';
import {renderGroupToFormula} from './renderBooleanFormula';

/** Materialise the old executed values before removing live source metadata. */
export function migrateConfigToR9(value:ConfigPackageV3):ConfigPackageV3 {
  if(value.contractRevision===9)return structuredClone(value);
  let original=structuredClone(value);
  if(original.contractRevision<8) {const migration=migrateRenderRulesToR7(original);if(!migration.config)throw Error(migration.issues.join('；'));original=migrateFieldsToR8(migration.config);}
  const config=structuredClone(original);
  config.workflows=original.workflows.map(workflow=>{
    for(const step of workflow.steps)for(const control of step.controls??[])for(const item of [control,...(control.group?.itemFields??[])]) {
      const errors=fieldImportErrors(original,workflow,item);if(errors.length)throw Error(`工作流 ${workflow.id} 来源无法展开：${errors.join('；')}`);
    }
    const resolved=resolveWorkflowFields(original,workflow);
    if(resolved.external)resolved.external.purpose='capture';
    for(const step of resolved.steps)for(const control of step.controls??[]) {
      if(control.fieldSource)control.prefillField=control.fieldSource.snapshot.key;
      delete control.fieldSource;
      for(const field of control.group?.itemFields??[]){if(field.fieldSource)field.prefillField=field.fieldSource.snapshot.key;delete field.fieldSource;}
    }
    return resolved;
  });
  for(const node of config.nodes) {
    for(const profile of Object.values(node.geometryProfiles))for(const rule of profile?.zoomPriority.rules??[])if(rule.when?.fields)rule.when.fields={op:'all',items:[],formula:renderGroupToFormula(rule.when.fields)};
    const card=resolveCardConfiguration(original,node.path);
    if(card?.mode==='fields') {
      const fields=resolveEffectiveFields(original,node.path);
      node.card={...structuredClone(card),items:card.items.map(raw=>{
        const item:CardItem=structuredClone(raw),definition=fields.find(field=>field.key===item.source);
        if(item.labelMode==='field')item.label=structuredClone(definition?.labels??{zh:item.source,en:''});
        if(item.valueMode==='field'){
          item.valueOptions=structuredClone(definition?.options??[]);
          if(item.options?.format===undefined&&definition?.format)item.options={...item.options,format:definition.format};
        } else if(item.valueMode!=='override'&&item.options?.format==='enum'&&item.valueOptions===undefined)item.valueOptions=structuredClone(definition?.options??[]);
        delete item.labelMode;delete item.valueMode;return item;
      })};
    }
    for(const field of node.fields){delete field.defaultValue;delete field.placeholder;if(field.reference){const {displayField:_display,...constraint}=field.reference;field.reference=constraint;}}
  }
  config.contractRevision=9;config.revision=value.revision+1;
  return config;
}
