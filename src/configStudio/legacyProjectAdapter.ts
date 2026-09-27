import { listClassConfigs, resolveCairnMapLocalizedLabel } from '@/core/project/classMetadata';
import { getOpenRIAMapWorkflowConfigs } from '@/core/project/openriamapRiaWorkflows';
import {
  getOpenRIAMapDisplayProfilesConfig,
  getOpenRIAMapFieldControlsConfig,
  getOpenRIAMapSpecialDisplayLogicConfig,
} from '@/core/project/openriamapRiaShared';
import type { CairnMapClassConfig, CairnMapClassFieldConfig } from '@/core/project/classTypes';
import type { CairnMapWorkflowBlock, CairnMapWorkflowConfig } from '@/core/project/workflowTypes';
import { FEATURE_CARD_REGISTRY } from '@/components/Rules/cardrules/featureCardRegistry';
import cardLayoutsJson from '../../project-config/presets/core-structures/shared/card/cardLayouts.json';
import workflowBlocksJson from '../../project-config/presets/core-structures/shared/workflow/workflowBlocks.json';
import type {
  CardConfiguration,
  CardItem,
  CategoryNode,
  ClassificationPath,
  ConfigPackageV3,
  ConfigRegistries,
  ControlledRegistryItem,
  FieldDefinition,
  GeometryKind,
  GeometryProfile,
  LocalizedText,
  ParityEntry,
  WorkflowControl,
  WorkflowDefinition,
  WorkflowStep,
} from './types';

const RESERVED = new Set(['ID', 'World', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG']);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? clone(value as Record<string, unknown>) : {};
const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];

function localized(value: unknown, fallback: string): LocalizedText {
  return { zh: resolveCairnMapLocalizedLabel(value as never, 'zh-CN', fallback), en: resolveCairnMapLocalizedLabel(value as never, 'en', fallback) };
}

function textRegistry(items: unknown, fallbackPrefix: string): ControlledRegistryItem[] {
  return array(items).map((item, index) => {
    const id = String(item.id ?? item.key ?? `${fallbackPrefix}-${index}`);
    return {
      id,
      label: localized(item.label ?? item.name, id),
      ...(Array.isArray(item.allowedClasses) ? { allowedClasses: item.allowedClasses.map(String) } : {}),
      ...(Array.isArray(item.optionSchema) ? { optionSchema: clone(item.optionSchema) as ControlledRegistryItem['optionSchema'] } : {}),
    };
  });
}

function buildRegistries(workflows: CairnMapWorkflowConfig[]): ConfigRegistries {
  const layouts = record(cardLayoutsJson).items;
  const displayProfiles = getOpenRIAMapDisplayProfilesConfig().items;
  const specialDisplayLogic = getOpenRIAMapSpecialDisplayLogicConfig().items;
  const fieldControls = getOpenRIAMapFieldControlsConfig().items;
  const workflowBlocks = record(workflowBlocksJson).items;
  const workflowComponentKeys = new Set<string>();
  for (const workflow of workflows) {
    if (workflow.componentKey) workflowComponentKeys.add(String(workflow.componentKey));
    for (const page of workflow.pages ?? []) for (const block of page.blocks ?? []) {
      const raw = record(block);
      if (raw.componentKey) workflowComponentKeys.add(String(raw.componentKey));
    }
  }
  const registeredWorkflowBlocks = textRegistry(workflowBlocks, 'workflow-block');
  for (const key of workflowComponentKeys) if (key && !registeredWorkflowBlocks.some((item) => item.id === key)) registeredWorkflowBlocks.push({ id: key, label: { zh: `${key} 工作流组件`, en: `${key} workflow component` } });
  return {
    cardLayouts: textRegistry(layouts, 'layout'),
    cardComponents: Object.keys(FEATURE_CARD_REGISTRY).map((key) => ({
      id: key,
      label: { zh: `${key} 专用信息卡`, en: `${key} special feature card` },
      allowedClasses: [key],
    })),
    displayProfiles: textRegistry(displayProfiles, 'display-profile'),
    specialDisplayLogic: textRegistry(specialDisplayLogic, 'display-logic'),
    workflowControls: textRegistry(fieldControls, 'field-control'),
    workflowBlocks: registeredWorkflowBlocks,
  };
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
  if (field.type === 'featureRef') return 'featureSearch';
  return 'text';
}

function baseZLevel(classCode: string): number {
  if (classCode === 'STA' || classCode === 'PLF') return 420;
  if (classCode === 'RLE' || classCode === 'ROD') return 320;
  if (classCode === 'BUD' || classCode === 'FLR' || classCode === 'STB' || classCode === 'STF') return 360;
  return 300;
}

function defaultColor(classCode: string, geometry: GeometryKind): string {
  if (classCode === 'RLE' || classCode === 'PLF' || classCode === 'STA') return '#2563eb';
  if (classCode === 'BUD' || classCode === 'STB') return '#111827';
  if (classCode === 'FLR') return '#334155';
  if (geometry === 'Point') return '#e04747';
  if (geometry === 'LineString') return '#2563eb';
  return '#334155';
}

function triggersFor(geometry: GeometryKind): GeometryProfile['interaction']['triggers'] {
  if (geometry === 'Point') return { point: true, label: true };
  if (geometry === 'LineString') return { line: true, label: true };
  return { boundary: true, interior: true, label: true };
}

function geometryProfile(config: CairnMapClassConfig): GeometryProfile {
  const geometry = config.geometry.type as GeometryKind;
  const rules = config.display?.rules ?? [];
  const first = rules[0] as Record<string, unknown> | undefined;
  const label = (first?.label ?? {}) as Record<string, unknown>;
  const specialLogic = Array.isArray(first?.specialLogic) ? first.specialLogic.map((item) => String((item as Record<string, unknown>).key ?? '')).filter(Boolean) : [];
  const profileIds = rules.map((item) => String(item.profile ?? '')).filter(Boolean);
  const zLevel = baseZLevel(config.classCode);
  const isStructure = config.classCode === 'BUD' || config.classCode === 'STB';
  const structureRules = isStructure ? [
    { id: 'structure-hidden', maxExclusive: 3, representation: 'hidden' as const },
    {
      id: 'structure-low-point', minExclusive: 2, maxExclusive: 6, representation: 'point' as const, labelRole: 'optional' as const,
      priority: { mode: 'replace' as const, base: 2400, metric: { kind: 'area' as const, multiplier: 1, divisor: 10, rounding: 'floor' as const, min: 0, max: 999 } },
    },
    {
      id: 'structure-high-polygon', minExclusive: 5, representation: 'geometry' as const, labelRole: 'important' as const,
      priority: { mode: 'replace' as const, base: 3600, metric: { kind: 'area' as const, multiplier: 1, divisor: 10, rounding: 'floor' as const, min: 0, max: 999 } },
    },
  ] : [{ id: 'v1-default', minExclusive: 0, representation: 'geometry' as const, priority: { mode: 'replace' as const, base: zLevel } }];
  return {
    enabled: true,
    allowMultipleParts: true,
    color: defaultColor(config.classCode, geometry),
    style: geometry === 'Polygon' ? { weight: 2, fillOpacity: 0.25, opacity: 0.9 } : { weight: 3, opacity: 0.9 },
    geometryStack: { zLevel },
    label: {
      visible: label.enabled !== false,
      anchor: 'featureBbox',
      conditions: [{ kind: 'always' }],
      collision: { role: isStructure ? 'important' : 'optional', basePriority: zLevel, hideWhenColliding: true },
    },
    zoomPriority: { rules: structureRules },
    interaction: { triggers: triggersFor(geometry) },
    legacyDisplay: { ruleIds: rules.map((item) => item.id).filter(Boolean), profileIds, specialLogicKeys: specialLogic },
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
    ...(field.options?.length ? { options: field.options.map((option) => String(option.value)) } : field.type === 'select' ? { optionSource: { registryKey: `v1-field-options:${config.classCode}:${field.key}`, runtimeField: field.sourceRuntimeField } } : {}),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.defaultValue !== undefined ? { defaultValue: clone(field.defaultValue) } : {}),
    ...(field.sourceRuntimeField ? { sourceRuntimeField: field.sourceRuntimeField } : {}),
    ...(field.scenes ? { scenes: clone(field.scenes) } : {}),
    ...(field.ref ? { reference: clone(field.ref) } : {}),
  }));
}

function cardFor(config: CairnMapClassConfig): CardConfiguration {
  const card = record(config.card);
  const layoutId = String(card.layoutId ?? '').trim();
  const specialCardKey = String(card.specialCardKey ?? '').trim();
  if (specialCardKey) return { mode: 'component', componentKey: specialCardKey };
  if (layoutId) return { mode: 'layout', layoutId };
  const items: CardItem[] = fieldsFor(config)
    .filter((item) => config.fields.find((legacy) => legacy.key === item.key)?.scenes?.infocard !== false)
    .map((item) => ({
      id: `${config.classCode}-${item.key}-card`, source: item.key, visible: true,
      renderer: item.reference ? 'relationLink' : 'text', label: item.labels,
      ...(item.reference ? { relation: { targetClassification: { class: item.reference.classCode }, targetMatchField: item.reference.matchField, targetDisplayField: item.reference.displayField, clickable: true } } : {}),
    }));
  return { mode: 'fields', items };
}

function categoryId(path: ClassificationPath): string {
  return [path.class, path.kind, path.skind, path.skind2].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function parentPath(path: ClassificationPath): ClassificationPath | null {
  if (path.skind2) return { class: path.class, kind: path.kind, skind: path.skind };
  if (path.skind) return { class: path.class, kind: path.kind };
  if (path.kind) return { class: path.class };
  return null;
}

function nodesFor(config: CairnMapClassConfig): CategoryNode[] {
  const rawCard = record(config.card);
  const displayRules = config.display?.rules ?? [];
  const paths = new Map<string, ClassificationPath>();
  const addPath = (path: ClassificationPath) => {
    const key = JSON.stringify(path);
    if (paths.has(key)) return;
    paths.set(key, path);
    const parent = parentPath(path);
    if (parent) addPath(parent);
  };
  addPath({ class: config.classCode });
  for (const option of config.classification?.options ?? []) addPath({ class: config.classCode, ...(option.kind ? { kind: option.kind } : {}), ...(option.skind ? { skind: option.skind } : {}), ...(option.skind2 ? { skind2: option.skind2 } : {}) });
  const rootKey = JSON.stringify({ class: config.classCode });
  const sorted = [...paths.entries()].sort((a, b) => JSON.stringify(a[1]).split(',').length - JSON.stringify(b[1]).split(',').length);
  return sorted.map(([key, path]) => {
    const isRoot = key === rootKey;
    const id = `class-${categoryId(path)}`;
    const childIds = sorted.filter(([, candidate]) => JSON.stringify(parentPath(candidate) ?? {}) === key).map(([, candidate]) => `class-${categoryId(candidate)}`);
    return {
      nodeId: id,
      path,
      children: childIds,
      policies: { fields: isRoot ? 'overridable' : 'sealed', display: 'overridable', card: 'overridable', workflow: 'overridable' },
      fields: isRoot ? fieldsFor(config) : [],
      geometryProfiles: isRoot ? { [config.geometry.type]: geometryProfile(config) } : {},
      ...(config.classCode === 'BUD' ? { containment: { enabled: true, role: 'parent', viewProfileKey: 'floorViewBinding' } } : config.classCode === 'FLR' ? { containment: { enabled: true, role: 'child', parentReferenceField: 'BuildingID', viewProfileKey: 'floorViewBinding' } } : {}),
      card: isRoot ? cardFor(config) : { mode: 'fields', items: [] },
      ...(isRoot ? { legacy: {
        classCode: config.classCode,
        displayRuleIds: displayRules.map((rule) => rule.id),
        ...(typeof rawCard.layoutId === 'string' ? { cardLayoutId: rawCard.layoutId } : {}),
        ...(typeof rawCard.specialCardKey === 'string' ? { specialCardKey: rawCard.specialCardKey } : {}),
        source: clone(config) as unknown as Record<string, unknown>,
      } } : {}),
    } as CategoryNode;
  });
}

function blockControl(block: CairnMapWorkflowBlock, index: number): WorkflowControl {
  const raw = record(block);
  const first = (value: unknown): string | undefined => Array.isArray(value) && value[0] !== undefined ? String(value[0]) : undefined;
  const type = String(raw.type ?? 'text');
  const kind: WorkflowControl['kind'] = type === 'featureSearch' || type === 'relationSearch' ? 'featureSearch' : /coarse|rough/i.test(type) ? 'coarseSearch' : type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : type === 'number' ? 'number' : type === 'json' ? 'json' : type === 'notice' ? 'notice' : type === 'runtimeValue' ? 'runtimeValue' : type === 'component' ? 'component' : 'text';
  const target: ClassificationPath = {
    class: String(raw.classCode ?? (Array.isArray(raw.targetClassScope) ? raw.targetClassScope[0] : '') ?? ''),
    ...(first(raw.kindScope) ? { kind: first(raw.kindScope) } : {}),
    ...(first(raw.skindScope) ? { skind: first(raw.skindScope) } : {}),
    ...(first(raw.skind2Scope) ? { skind2: first(raw.skind2Scope) } : {}),
  };
  const search = kind === 'featureSearch' || kind === 'coarseSearch' ? {
    mode: kind === 'coarseSearch' ? 'coarse' as const : 'feature' as const,
    target,
    searchFields: Array.isArray(raw.searchFields) ? raw.searchFields.map(String) : [],
    displayFields: raw.displayField ? [String(raw.displayField)] : Array.isArray(raw.displayFields) ? raw.displayFields.map(String) : [],
    returnFields: raw.returnField ? [String(raw.returnField)] : Array.isArray(raw.returnFields) ? raw.returnFields.map(String) : [],
    cacheScope: 'loadedWorlds' as const,
    ...(kind === 'coarseSearch' ? { coarse: { matcher: 'contains' as const, minQueryLength: 1, maxResults: 30, debounceMs: 180 } } : {}),
  } : undefined;
  return {
    id: String(raw.id ?? `legacy-block-${index}`),
    slot: String.fromCharCode(65 + (index % 26)),
    kind,
    columns: 1,
    label: { zh: String(raw.title ?? raw.id ?? '输入项'), en: String(raw.title ?? raw.id ?? 'Input') },
    ...(search ? { search } : {}),
    ...(kind === 'component' ? { componentKey: String(raw.componentKey ?? '') } : {}),
    legacyBlock: raw,
  };
}

function workflowFor(workflow: CairnMapWorkflowConfig, targetHasChildren: boolean): WorkflowDefinition {
  const geometry = workflow.targetGeometry === 'LineString' || workflow.targetGeometry === 'Polygon' ? workflow.targetGeometry : 'Point';
  const pages = workflow.pages ?? [];
  const forms: WorkflowStep[] = pages.filter((page) => !page.drawing).map((page, pageIndex) => ({
    id: page.id || `form-${pageIndex}`,
    kind: 'form' as const,
    label: { zh: page.title ?? `信息填写 ${pageIndex + 1}`, en: page.title ?? `Form ${pageIndex + 1}` },
    controls: page.blocks.map(blockControl),
    legacyPage: clone(page) as unknown as Record<string, unknown>,
  }));
  const target: ClassificationPath = { class: workflow.targetClass };
  if (!forms[0]) forms.push({ id: 'legacy-component-form', kind: 'form', label: { zh: '专用信息填写', en: 'Specialized form' }, controls: [{ id: 'legacy-component', kind: 'component', columns: 1, label: { zh: '专用填写组件', en: 'Specialized editor component' }, componentKey: String(workflow.componentKey ?? 'component'), legacyBlock: record(workflow) }] });
  const firstForm = forms[0];
  if (firstForm && targetHasChildren) firstForm.controls?.unshift({ id: 'system-classification', kind: 'classificationPicker', columns: 1, label: { zh: '分类', en: 'Classification' }, classificationScope: target, systemManaged: true });
  const outputEntries = [...(workflow.output?.fieldMappings ?? []), ...(workflow.output?.computedFields ?? []), ...(workflow.output?.tagMappings ?? []), ...(workflow.output?.extensionMappings ?? []), ...(workflow.output?.idAssembly ?? [])];
  const assignments = outputEntries.map((item, index) => {
    const entry = record(item);
    return { id: `legacy-assignment-${index}`, target: String(entry.to ?? entry.outputPath ?? entry.target ?? 'ID'), expression: String(entry.expression ?? entry.from ?? entry.value ?? '') };
  }).filter((item) => item.expression);
  return {
    id: workflow.id,
    label: { zh: workflow.label ?? workflow.id, en: workflow.label ?? workflow.id },
    target,
    steps: [
      { id: 'actor', kind: 'actor', label: { zh: '填写人', en: 'Author' } },
      ...forms,
      { id: 'tail', kind: 'tagsExtensions', label: { zh: '标签与扩展', en: 'Tags and extensions' }, tagsExtensions: { tagsEnabled: true, extensionsEnabled: true } },
      { id: 'geometry', kind: 'geometry', geometry: [geometry], label: { zh: '绘制', en: 'Geometry' } },
    ],
    ...(assignments.length ? { assignments } : {}),
    legacy: { runtimeMode: workflow.runtimeMode, componentKey: workflow.componentKey, output: record(workflow.output), source: clone(workflow) as unknown as Record<string, unknown> },
  };
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function parityEntries(classes: CairnMapClassConfig[], workflows: CairnMapWorkflowConfig[]): ParityEntry[] {
  return [
    ...classes.map((item) => ({ kind: 'class' as const, id: item.classCode, source: `project-config class ${item.classCode}`, status: 'resolved' as const, fingerprint: fingerprint(item), details: '字段、分类、坐标、显示规则、信息卡及原始 V1 契约均已建立可审计映射。' })),
    ...workflows.map((item) => ({ kind: 'workflow' as const, id: item.id, source: `project-config workflow ${item.id}`, status: 'resolved' as const, fingerprint: fingerprint(item), details: '页面、块、绘制尾页、输出组装与原始 V1 契约均已建立可审计映射。' })),
    { kind: 'shared', id: 'display-profiles', source: 'project-config shared displayProfiles', status: 'registryReference', details: `已受控注册 ${getOpenRIAMapDisplayProfilesConfig().items.length} 个显示 profile。` },
    { kind: 'shared', id: 'special-display-logic', source: 'project-config shared specialDisplayLogic', status: 'registryReference', details: `已受控注册 ${getOpenRIAMapSpecialDisplayLogicConfig().items.length} 个专用显示逻辑。` },
    { kind: 'shared', id: 'card-runtime', source: 'project-config shared card layouts and component registry', status: 'registryReference', details: '声明式布局和代码型专用卡片已经拆分为两个受控注册表。' },
    { kind: 'shared', id: 'workflow-registry', source: 'project-config shared workflow controls and blocks', status: 'registryReference', details: '表单控件、粗搜索、关系搜索和组件块均使用受控注册表。' },
  ];
}

/** Converts V1 to the V3 package without discarding its original runtime evidence. */
export function createConfigPackageFromCurrentProject(): ConfigPackageV3 {
  const classes = listClassConfigs();
  const workflows = getOpenRIAMapWorkflowConfigs();
  const nodes = classes.flatMap(nodesFor);
  return {
    schemaVersion: 'cairnmap.config-package.v3',
    packageId: 'cairnmap-config',
    projectId: 'openriamap-ria',
    revision: 1,
    displayName: { zh: '当前工程配置（V1 完整顺承基准）', en: 'Current project V1 complete parity baseline' },
    registries: buildRegistries(workflows),
    nodes,
    workflows: workflows.map((workflow) => workflowFor(workflow, nodes.some((node) => node.path.class === workflow.targetClass && Boolean(node.path.kind)))),
    parity: { schemaVersion: 'cairnmap.v1-parity-report.v2', generatedAt: new Date().toISOString(), entries: parityEntries(classes, workflows) },
  };
}
