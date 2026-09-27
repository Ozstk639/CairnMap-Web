import { listClassConfigs, resolveCairnMapLocalizedLabel } from '@/core/project/classMetadata';
import { getOpenRIAMapWorkflowConfigs } from '@/core/project/openriamapRiaWorkflows';
import { getOpenRIAMapDisplayProfilesConfig } from '@/core/project/openriamapRiaShared';
import type { CairnMapClassConfig, CairnMapClassFieldConfig } from '@/core/project/classTypes';
import type { CairnMapWorkflowBlock, CairnMapWorkflowConfig } from '@/core/project/workflowTypes';
import type { CardItem, CategoryNode, ConfigPackageV2, FieldDefinition, GeometryKind, GeometryProfile, LocalizedText, ParityEntry, WorkflowControl, WorkflowDefinition } from './types';

const RESERVED = new Set(['ID', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG']);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? clone(value as Record<string, unknown>) : {};

function localized(value: unknown, fallback: string): LocalizedText { return { zh: resolveCairnMapLocalizedLabel(value as never, 'zh-CN', fallback), en: resolveCairnMapLocalizedLabel(value as never, 'en', fallback) }; }
function fieldType(value: CairnMapClassFieldConfig['type']): FieldDefinition['type'] { if (value === 'number') return 'number'; if (value === 'bool') return 'boolean'; if (value === 'select') return 'enum'; if (value === 'featureRef') return 'reference'; return 'string'; }
function inputType(field: CairnMapClassFieldConfig): FieldDefinition['input'] { if (field.type === 'select') return 'select'; if (field.type === 'bool') return 'toggle'; if (field.type === 'featureRef') return 'featureSearch'; return 'text'; }
function baseZLevel(classCode: string): number { if (classCode === 'STA') return 420; if (classCode === 'RLE') return 320; if (classCode === 'BUD' || classCode === 'FLR') return 360; return 300; }

function geometryProfile(config: CairnMapClassConfig): GeometryProfile {
  const geometry = config.geometry.type as GeometryKind;
  const rules = config.display?.rules ?? [];
  const first = rules[0] as Record<string, unknown> | undefined;
  const label = (first?.label ?? {}) as Record<string, unknown>;
  const specialLogic = Array.isArray(first?.specialLogic) ? first.specialLogic.map((item) => String((item as Record<string, unknown>).key ?? '')).filter(Boolean) : [];
  const profileIds = rules.map((item) => String(item.profile ?? '')).filter(Boolean);
  const zLevel = baseZLevel(config.classCode);
  const building = config.classCode === 'BUD' || config.classCode === 'FLR';
  return {
    enabled: true, allowMultipleParts: true, color: geometry === 'Point' ? '#e04747' : geometry === 'LineString' ? '#2563eb' : '#7c3aed',
    zLevel, labelOffset: 10, interactionPriority: zLevel, featureScope: 'wholeFeature',
    label: { visible: label.enabled !== false, scope: 'featureBbox', conditions: [{ kind: 'zoomRange', min: 2 }], zoomIntervals: [{ id: 'v1-default', minExclusive: 1 }] },
    interaction: { mode: building ? 'building' : 'standard' },
    ...(building ? { aggregatePriority: { enabled: true, metric: 'area' as const, multiplier: 1, inputRange: { min: 0, max: 250000 }, priorityRange: { min: 300, max: 399 }, curve: 'linear' as const } } : {}),
    legacyDisplay: { ruleIds: rules.map((item) => item.id).filter(Boolean), profileIds, specialLogicKeys: specialLogic },
  };
}

function fieldsFor(config: CairnMapClassConfig): FieldDefinition[] {
  return config.fields.filter((field) => !RESERVED.has(field.key)).map((field) => ({
    fieldId: `${config.classCode}-${field.key}`, key: field.key, type: fieldType(field.type), cardinality: 'single', input: inputType(field),
    required: field.required, labels: localized(field.label, field.key), description: { zh: field.notes ?? '', en: field.notes ?? '' },
    ...(field.options?.length ? { options: field.options.map((option) => String(option.value)) } : field.type === 'select' ? { optionSource: { registryKey: `v1-field-options:${config.classCode}:${field.key}`, runtimeField: field.sourceRuntimeField } } : {}),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}), ...(field.defaultValue !== undefined ? { defaultValue: clone(field.defaultValue) } : {}),
    ...(field.sourceRuntimeField ? { sourceRuntimeField: field.sourceRuntimeField } : {}), ...(field.scenes ? { scenes: clone(field.scenes) } : {}),
    ...(field.ref ? { reference: clone(field.ref) } : {}),
  }));
}

function cardFor(config: CairnMapClassConfig): CardItem[] {
  const card = record(config.card);
  const layoutId = String(card.layoutId ?? '').trim(); const specialCardKey = String(card.specialCardKey ?? '').trim();
  const items: CardItem[] = [];
  if (layoutId || specialCardKey) items.push({ id: `${config.classCode}-v1-card`, source: 'Name', visible: true, renderer: 'specialCard', label: localized(config.label, config.classCode), options: { specialCardKey: specialCardKey || `layout:${layoutId}` } });
  for (const field of fieldsFor(config).filter((item) => config.fields.find((legacy) => legacy.key === item.key)?.scenes?.infocard !== false)) items.push({ id: `${config.classCode}-${field.key}-card`, source: field.key, visible: !layoutId, renderer: field.reference ? 'relationLink' : 'text', label: field.labels, ...(field.reference ? { relation: { targetClassification: { class: field.reference.classCode }, targetMatchField: field.reference.matchField, targetDisplayField: field.reference.displayField, clickable: true } } : {}) });
  return items;
}

function nodesFor(config: CairnMapClassConfig): CategoryNode[] {
  const rootId = `class-${config.classCode.toLowerCase()}`; const options = config.classification?.options ?? []; const childIds = options.map((_, index) => `${rootId}-classification-${index}`);
  const rawCard = record(config.card); const displayRules = config.display?.rules ?? [];
  const root: CategoryNode = { nodeId: rootId, path: { class: config.classCode }, children: childIds, policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' }, fields: fieldsFor(config), geometryProfiles: { [config.geometry.type]: geometryProfile(config) }, card: cardFor(config), legacy: { classCode: config.classCode, displayRuleIds: displayRules.map((rule) => rule.id), ...(typeof rawCard.layoutId === 'string' ? { cardLayoutId: rawCard.layoutId } : {}), ...(typeof rawCard.specialCardKey === 'string' ? { specialCardKey: rawCard.specialCardKey } : {}), source: clone(config) as unknown as Record<string, unknown> } };
  const children = options.map((option, index): CategoryNode => ({ nodeId: childIds[index], path: { class: config.classCode, kind: option.kind, ...(option.skind ? { skind: option.skind } : {}), ...(option.skind2 ? { skind2: option.skind2 } : {}) }, children: [], policies: { fields: 'sealed', display: 'overridable', card: 'overridable', workflow: 'overridable' }, fields: [], geometryProfiles: {}, card: [] }));
  return [root, ...children];
}

function blockControl(block: CairnMapWorkflowBlock, index: number): WorkflowControl {
  const raw = record(block); const type = String(block.type ?? 'text');
  const kind: WorkflowControl['kind'] = type === 'featureSearch' ? 'featureSearch' : /coarse|rough/i.test(type) ? 'coarseSearch' : type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : type === 'number' ? 'number' : type === 'json' ? 'json' : type === 'notice' ? 'notice' : 'text';
  const search = kind === 'featureSearch' || kind === 'coarseSearch' ? { registryKey: String(raw.searchConfigKey ?? raw.id ?? `v1-search-${index}`), mode: kind === 'coarseSearch' ? 'coarse' as const : 'feature' as const, targetClassScope: Array.isArray(block.targetClassScope) ? block.targetClassScope : block.classCode ? [block.classCode] : undefined, kindScope: block.kindScope, skindScope: block.skindScope, skind2Scope: block.skind2Scope, searchFields: block.searchFields ?? [], displayFields: block.displayField ? [block.displayField] : [], returnFields: block.returnField ? [block.returnField] : [], cacheScope: 'loadedWorlds' as const } : undefined;
  return { id: String(block.id ?? `legacy-block-${index}`), slot: String.fromCharCode(65 + (index % 26)), kind, columns: 1, label: { zh: String(block.title ?? block.id ?? '输入项'), en: String(block.title ?? block.id ?? 'Input') }, ...(block.outputPath ? { binding: { target: String(block.outputPath).startsWith('tags.') ? 'tag' as const : String(block.outputPath).startsWith('extensions.') ? 'extension' as const : 'field' as const, path: String(block.outputPath).replace(/^(tags|extensions)\./, '') } } : block.field ? { binding: { target: 'field' as const, path: String(block.field) } } : {}), ...(search ? { search } : {}), legacyBlock: raw };
}
function workflowFor(workflow: CairnMapWorkflowConfig): WorkflowDefinition {
  const geometry = workflow.targetGeometry === 'LineString' || workflow.targetGeometry === 'Polygon' ? workflow.targetGeometry : 'Point';
  const hybridKey = `legacy-${workflow.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`; const pages = workflow.pages ?? [];
  const forms = pages.filter((page) => !page.drawing).map((page, pageIndex) => ({ id: page.id || `form-${pageIndex}`, kind: 'form' as const, label: { zh: page.title ?? `信息填写 ${pageIndex + 1}`, en: page.title ?? `Form ${pageIndex + 1}` }, controls: page.blocks.map(blockControl), legacyPage: clone(page) as unknown as Record<string, unknown> }));
  const assignments = [...(workflow.output?.fieldMappings ?? []), ...(workflow.output?.computedFields ?? []), ...(workflow.output?.tagMappings ?? []), ...(workflow.output?.extensionMappings ?? []), ...(workflow.output?.idAssembly ?? [])].map((item, index) => { const entry = record(item); return { id: `legacy-assignment-${index}`, target: String(entry.to ?? entry.outputPath ?? entry.target ?? 'ID'), expression: String(entry.expression ?? entry.from ?? entry.value ?? ''), source: String(entry.outputPath ?? '').startsWith('tags.') ? 'tag' as const : String(entry.outputPath ?? '').startsWith('extensions.') ? 'extension' as const : 'field' as const }; }).filter((item) => item.expression);
  return { id: workflow.id, label: { zh: workflow.label ?? workflow.id, en: workflow.label ?? workflow.id }, target: { class: workflow.targetClass }, steps: [{ id: 'actor', kind: 'actor', label: { zh: '填写人', en: 'Author' } }, ...(forms.length ? forms : [{ id: 'legacy-form', kind: 'special' as const, specialKey: hybridKey, label: { zh: '现有专用填写页', en: 'Existing specialized form' } }]), { id: 'tail', kind: 'tagsExtensions', label: { zh: '标签与扩展', en: 'Tags and extensions' } }, { id: 'geometry', kind: 'geometry', geometry: [geometry], label: { zh: '绘制', en: 'Geometry' } }], ...(assignments.length ? { assignments } : {}), legacy: { runtimeMode: workflow.runtimeMode, componentKey: workflow.componentKey, output: record(workflow.output), source: clone(workflow) as unknown as Record<string, unknown> } };
}

function parityEntries(classes: CairnMapClassConfig[], workflows: CairnMapWorkflowConfig[]): ParityEntry[] {
  return [
    ...classes.map((item) => ({ kind: 'class' as const, id: item.classCode, source: `project-config class ${item.classCode}`, status: 'preserved' as const, details: '完整 V1 class JSON 已随节点 legacy.source 保存；显示、卡片运行时使用受控注册表引用。' })),
    ...workflows.map((item) => ({ kind: 'workflow' as const, id: item.id, source: `project-config workflow ${item.id}`, status: 'preserved' as const, details: '完整 V1 workflow JSON 已随 workflow.legacy.source 保存。' })),
    { kind: 'shared', id: 'display-profiles', source: 'project-config shared displayProfiles', status: 'registryReference', details: `已注册 ${getOpenRIAMapDisplayProfilesConfig().items.length} 个 V1 显示 profile。` },
    { kind: 'shared', id: 'card-runtime', source: 'project-config card runtime registry', status: 'registryReference', details: '卡片 layout/special key 通过受控运行时注册表解析。' },
    { kind: 'shared', id: 'workflow-search', source: 'workflow feature-search registry', status: 'registryReference', details: '粗搜索和要素搜索仅引用受控搜索配置。' },
  ];
}

/** Converts V1 without dropping metadata.  Newly designed V2 fields are
 * editable; legacy JSON remains an auditable parity source until activation. */
export function createConfigPackageFromCurrentProject(): ConfigPackageV2 {
  const classes = listClassConfigs(); const workflows = getOpenRIAMapWorkflowConfigs();
  return { schemaVersion: 'cairnmap.config-package.v2', packageId: 'cairnmap-config', projectId: 'openriamap-ria', revision: 1, displayName: { zh: '当前工程配置（V1 顺承基准）', en: 'Current project V1 parity baseline' }, specialComponentKeys: workflows.map((workflow) => `legacy-${workflow.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`), nodes: classes.flatMap(nodesFor), workflows: workflows.map(workflowFor), parity: { schemaVersion: 'cairnmap.v1-parity-report.v1', generatedAt: new Date().toISOString(), entries: parityEntries(classes, workflows) } };
}
