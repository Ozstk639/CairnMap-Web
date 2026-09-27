import { listClassConfigs, resolveCairnMapLocalizedLabel } from '@/core/project/classMetadata';
import { getOpenRIAMapWorkflowConfigs } from '@/core/project/openriamapRiaWorkflows';
import type { CairnMapClassConfig, CairnMapClassFieldConfig } from '@/core/project/classTypes';
import type { CairnMapWorkflowConfig } from '@/core/project/workflowTypes';
import type { CardItem, CategoryNode, ConfigPackageV2, FieldDefinition, GeometryKind, GeometryProfile, LocalizedText, WorkflowDefinition } from './types';

const RESERVED = new Set(['ID', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG']);

function localized(value: unknown, fallback: string): LocalizedText {
  return { zh: resolveCairnMapLocalizedLabel(value as never, 'zh-CN', fallback), en: resolveCairnMapLocalizedLabel(value as never, 'en', fallback) };
}

function fieldType(value: CairnMapClassFieldConfig['type']): FieldDefinition['type'] {
  if (value === 'number') return 'number';
  if (value === 'bool') return 'boolean';
  if (value === 'select') return 'enum';
  if (value === 'featureRef') return 'reference';
  return 'string';
}

function inputType(field: CairnMapClassFieldConfig): FieldDefinition['input'] {
  if (field.type === 'select') return 'select';
  if (field.type === 'bool') return 'toggle';
  return 'text';
}

function baseZLevel(classCode: string): number {
  if (classCode === 'STA') return 420;
  if (classCode === 'RLE') return 320;
  if (classCode === 'BUD' || classCode === 'FLR') return 360;
  return 300;
}

function geometryProfile(config: CairnMapClassConfig): GeometryProfile {
  const geometry = config.geometry.type as GeometryKind;
  const building = config.classCode === 'BUD' || config.classCode === 'FLR';
  const zLevel = baseZLevel(config.classCode);
  return {
    enabled: true,
    allowMultipleParts: true,
    color: geometry === 'Point' ? '#e04747' : geometry === 'LineString' ? '#2563eb' : '#7c3aed',
    zLevel,
    labelOffset: 10,
    interactionPriority: zLevel,
    label: { visible: true, scope: building ? 'buildingAggregate' : 'featureBbox', conditions: [{ kind: 'zoomRange', min: 2 }] },
    interaction: { mode: building ? 'building' : 'standard' },
  };
}

function fieldsFor(config: CairnMapClassConfig): FieldDefinition[] {
  return config.fields.filter((field) => !RESERVED.has(field.key)).map((field) => ({
    fieldId: `${config.classCode}-${field.key}`,
    key: field.key,
    type: fieldType(field.type),
    cardinality: 'single',
    input: inputType(field),
    required: field.required,
    labels: localized(field.label, field.key),
    description: { zh: field.notes ?? '', en: field.notes ?? '' },
    ...(field.options?.length ? { options: field.options.map((option) => String(option.value)) } : {}),
  }));
}

function cardFor(config: CairnMapClassConfig): CardItem[] {
  return fieldsFor(config).filter((field) => config.fields.find((legacy) => legacy.key === field.key)?.scenes?.infocard !== false).map((field) => ({
    id: `${config.classCode}-${field.key}-card`, source: field.key, visible: true, renderer: 'text', label: field.labels,
  }));
}

function nodesFor(config: CairnMapClassConfig): CategoryNode[] {
  const rootId = `class-${config.classCode.toLowerCase()}`;
  const options = config.classification?.options ?? [];
  const childIds = options.map((_, index) => `${rootId}-classification-${index}`);
  const root: CategoryNode = {
    nodeId: rootId, path: { class: config.classCode }, children: childIds,
    policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' },
    fields: fieldsFor(config), geometryProfiles: { [config.geometry.type]: geometryProfile(config) }, card: cardFor(config),
  };
  const children = options.map((option, index): CategoryNode => ({
    nodeId: childIds[index],
    path: { class: config.classCode, kind: option.kind, ...(option.skind ? { skind: option.skind } : {}), ...(option.skind2 ? { skind2: option.skind2 } : {}) },
    children: [], policies: { fields: 'sealed', display: 'overridable', card: 'overridable', workflow: 'overridable' },
    fields: [], geometryProfiles: {}, card: [],
  }));
  return [root, ...children];
}

function workflowFor(workflow: CairnMapWorkflowConfig): WorkflowDefinition {
  const geometry = workflow.targetGeometry === 'Point' || workflow.targetGeometry === 'LineString' || workflow.targetGeometry === 'Polygon' ? workflow.targetGeometry : 'Point';
  const hybridKey = `legacy-${workflow.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  return {
    id: workflow.id,
    label: { zh: workflow.label ?? workflow.id, en: workflow.label ?? workflow.id },
    target: { class: workflow.targetClass },
    // Existing complex flows remain explicit hybrid adapters.  New flows are
    // assembled in the visual standard form editor rather than executing a
    // free-form component name from a downloaded package.
    steps: [
      { id: 'actor', kind: 'actor', label: { zh: '填写人', en: 'Author' } },
      { id: 'legacy-form', kind: 'special', specialKey: hybridKey, label: { zh: '现有专用填写页', en: 'Existing specialized form' } },
      { id: 'tail', kind: 'tagsExtensions', label: { zh: '标签与扩展', en: 'Tags and extensions' } },
      { id: 'geometry', kind: 'geometry', geometry: [geometry], label: { zh: '绘制', en: 'Geometry' } },
    ],
  };
}

/** Converts the presently extracted class/workflow metadata into the editable
 * V2 package.  This is a local baseline only; no production runtime switches
 * to it until the validated, authorized Pipeline activation completes. */
export function createConfigPackageFromCurrentProject(): ConfigPackageV2 {
  const classes = listClassConfigs();
  const workflows = getOpenRIAMapWorkflowConfigs();
  return {
    schemaVersion: 'cairnmap.config-package.v2', packageId: 'cairnmap-config', projectId: 'openriamap-ria', revision: 1,
    displayName: { zh: '当前工程配置（v2 基准）', en: 'Current project configuration (v2 baseline)' },
    specialComponentKeys: workflows.map((workflow) => `legacy-${workflow.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`),
    nodes: classes.flatMap(nodesFor),
    workflows: workflows.map(workflowFor),
  };
}
