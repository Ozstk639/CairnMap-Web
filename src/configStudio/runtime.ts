import {validateExternalEditBinding} from './externalEditRegistry';
import {testWorkflowEditConversion} from './workflowEditCommit';
import {compileRenderFormula} from './renderBooleanFormula';
import {resolveMappedColor} from './renderScalar';
import {scalarValueErrors, validMappedColor} from './renderScalar';
import { isNativeConfigRevision } from './contract';
import { canonicalRenderFields, matchesRenderFields, renderRuleRange, validateRenderFields } from './renderRuleConditions';
import type {
  AffectedFeature,
  CardConfiguration,
  CardItem,
  CategoryNode,
  ClassificationPath,
  Condition,
  ContextBinding,
  ConfigPackageV3,
  ConfigValidationIssue,
  ConfigValidationReport,
  FieldDefinition,
  FieldScope,
  GeometryKind,
  GeometryProfile,
  InheritanceControls,
  MountedFeatureRecord,
  WorkflowControl,
  WorkflowDefinition,
  WorkflowOutput,
  SearchProfile,
  SelectOption,
  ZoomPriorityRule,
} from './types';
import { isSafeWorkflowTarget, parseWorkflowExpression, workflowExpressionTokens, WORKFLOW_SYSTEM_TOKENS, PROTECTED_WORKFLOW_TARGETS, workflowOutputAssemblyOrder, workflowCaptureSlots, workflowDerivedPointTokens } from './workflowExpression';
import { fieldImportErrors, resolveWorkflowFields } from './fieldReuse';
import { createBlankV32Package } from './v32Defaults';
import { validateNativeStructure } from './nativeContractValidation';

const GEOMETRIES: GeometryKind[] = ['Point', 'LineString', 'Polygon'];
const SYSTEM_FIELD_KEYS = new Set([
  'ID', 'Name', 'World', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2',
  'Type', 'CreateBy', 'CreateTime', 'ModifityTime', 'ModifityBy', 'CoordP', 'CoordL', 'CoordG',
]);
/** Name is a V1-configured field in several classes, even though it is also universally selectable. */
const PROTECTED_FIELD_KEYS = new Set([...SYSTEM_FIELD_KEYS].filter((key) => key !== 'Name'));
const EXTERNAL_WORKFLOW_REASONS = new Set(['railway-integrated', 'station-integrated', 'trp-integrated']);
const CARD_RENDERERS = new Set(['text', 'tag', 'colorCapsule', 'nameColorCapsule', 'relationLink', 'lineChips', 'media']);

type CompiledConfig = {
  epoch: number;
  byClass: Map<string, CategoryNode[]>;
  ancestors: Map<string, CategoryNode[]>;
  descendants: Set<string>;
  fields: Map<string, FieldDefinition[]>;
  selectable: Map<string, FieldDefinition[]>;
  profiles: Map<string, GeometryProfile | undefined>;
  cards: Map<string, CardConfiguration | undefined>;
  defaults: Map<GeometryKind, import('./types').RenderRuleExtensions>;
  extensions: WeakMap<object, Map<GeometryKind, import('./types').RenderRuleExtensions>>;
  hits: number;
};
const compiledConfigs = new WeakMap<ConfigPackageV3, CompiledConfig>();
const compiledZoomBuckets = new WeakMap<GeometryProfile, ZoomPriorityRule[][]>();
let compiledEpoch = 0;
const compiledPathKey = (path: ClassificationPath) => JSON.stringify([path.class, path.kind ?? '', path.skind ?? '', path.skind2 ?? '']);
function freezeData<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}
/** Only validated activation/preview snapshots enter this cache. Mutable editor
 * objects deliberately retain the uncached reference implementation. */
export function compileConfigRuntime(value: ConfigPackageV3, validated = false): ConfigPackageV3 {
  if (compiledConfigs.has(value)) return value;
  if (!validated) {
    const report = validateConfigPackage(value);
    if (!report.valid) throw new Error(`无法编译无效配置：${report.issues.filter(issue => issue.severity === 'error').slice(0, 5).map(issue => issue.message).join('；')}`);
  }
  const config = freezeData(structuredClone(value));
  const compiled: CompiledConfig = { epoch: ++compiledEpoch, byClass: new Map(), ancestors: new Map(), descendants: new Set(), fields: new Map(), selectable: new Map(), profiles: new Map(), cards: new Map(), defaults: new Map(), extensions: new WeakMap(), hits: 0 };
  for (const node of config.nodes) {
    const group = compiled.byClass.get(node.path.class) ?? [];
    group.push(node); compiled.byClass.set(node.path.class, group);
    let parent = parentClassificationPath(node.path);
    while (parent) { compiled.descendants.add(compiledPathKey(parent)); parent = parentClassificationPath(parent); }
  }
  for (const group of compiled.byClass.values()) group.sort((a, b) => pathDepth(a.path) - pathDepth(b.path));
  compiledConfigs.set(config, compiled);
  for (const node of config.nodes) {
    resolveEffectiveFields(config, node.path);
    resolveCardConfiguration(config, node.path);
    for (const geometry of GEOMETRIES) {
      const profile = resolveGeometryProfile(config, node.path, geometry);
      if (profile && !compiledZoomBuckets.has(profile)) compiledZoomBuckets.set(profile, Array.from({ length: 9 }, (_, zoom) => profile.zoomPriority.rules.filter(rule => { const range = renderRuleRange(rule); return zoom >= range.min && zoom <= range.max; })));
    }
  }
  for (const geometry of GEOMETRIES) {
    resolveRenderExtensions(config, geometry);
    for (const node of config.nodes) for (const rule of node.geometryProfiles[geometry]?.zoomPriority.rules ?? []) resolveRenderExtensions(config, geometry, rule.extensions);
  }
  for(const node of config.nodes)for(const profile of Object.values(node.geometryProfiles))for(const rule of profile?.zoomPriority.rules??[]) {
    if(rule.when?.fields?.formula)compileRenderFormula(rule.when.fields.formula);
    for(const binding of [rule.style?.stroke,rule.style?.fill,rule.label?.style?.color,...Object.values(rule.extensions?.interaction??{}).map(state=>state?.strokeColorBinding)])if(binding?.mode==='valueMap')resolveMappedColor(binding,undefined);
  }
  return config;
}
export function isCompiledConfigRuntime(config: ConfigPackageV3): boolean { return compiledConfigs.has(config); }
export function configCompilationStats(config: ConfigPackageV3) {
  const compiled = compiledConfigs.get(config);
  return compiled ? { epoch: compiled.epoch, nodes: config.nodes.length, classes: compiled.byClass.size, cachedPaths: compiled.ancestors.size, hits: compiled.hits } : undefined;
}
function cachedPathValue<T>(map: Map<string, T>, key: string, value: T): T {
  // Unregistered data paths cannot cause unbounded cache growth.
  if (map.size < 1024) map.set(key, value);
  return value;
}

export function classificationPathKey(path: ClassificationPath): string {
  return [path.class, path.kind, path.skind, path.skind2].filter((value): value is string => Boolean(value)).join('/');
}

export function fieldScope(field: Pick<FieldDefinition, 'key' | 'scope'>): FieldScope {
  if (field.scope) return field.scope;
  if (field.key === 'tags' || field.key.startsWith('tags.')) return 'tags';
  if (field.key === 'extensions' || field.key.startsWith('extensions.')) return 'extensions';
  return 'root';
}

/** Field keys are persisted as full data paths. This avoids the former loss of
 * `tags.foo` / `extensions.foo` during semantic migration. */
export function fieldPath(field: Pick<FieldDefinition, 'key'>): string { return field.key; }

export function fieldShortKey(field: Pick<FieldDefinition, 'key' | 'scope'>): string {
  const scope = fieldScope(field);
  return scope === 'root' ? field.key : field.key.replace(new RegExp(`^${scope}\\.`), '');
}

export function readRecordPath(record: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(record, path)) return record[path];
  return path.split('.').reduce<unknown>((current, part) => (
    current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined
  ), record);
}

export function optionLabel(option: SelectOption, locale: keyof SelectOption['label'] = 'zh'): string {
  return locale === 'en' ? option.label.en ?? '' : option.label.zh || option.value;
}

export function normalizeSelectOptions(value: unknown): SelectOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const raw = item as Record<string, unknown>;
      const valueText = String(raw.value ?? raw.id ?? raw.key ?? '');
      const label = raw.label && typeof raw.label === 'object'
        ? raw.label as Record<string, unknown>
        : undefined;
      const fallback = String(raw.label ?? raw.name ?? valueText);
      return { value: valueText, label: { zh: String(label?.zh ?? label?.['zh-CN'] ?? fallback), en: String(label?.en ?? '') } };
    }
    const text = String(item ?? '');
    return { value: text, label: { zh: text, en: '' } };
  }).filter((item) => Boolean(item.value));
}

/** r5 has one real controlled search. This makes r4 coarse/feature imports
 * deterministic without retaining two overlapping authoring controls. */
export function normalizeSearchProfile(search: SearchProfile | undefined): SearchProfile | undefined {
  if (!search) return undefined;
  const coarse = search.coarse;
  const queryFields = search.queryFields?.filter(Boolean) ?? search.searchFields?.filter(Boolean) ?? [];
  const displayFields = search.displayFields?.filter(Boolean) ?? [];
  const returnFields = search.returnFields?.filter(Boolean) ?? [];
  const returnField = search.returnField?.trim() || returnFields[0] || 'ID';
  const displayTemplate = search.displayTemplate?.trim()
    || (displayFields.length ? displayFields.map((field) => `{{${field}}}`).join(' ') : '{{ID}} ({{Name}})');
  return {
    target: search.target,
    queryFields,
    displayTemplate,
    returnField,
    matcher: search.matcher ?? coarse?.matcher ?? 'contains',
    minQueryLength: search.minQueryLength ?? coarse?.minQueryLength ?? 1,
    maxResults: search.maxResults ?? coarse?.maxResults ?? 30,
    ...(search.debounceMs ?? coarse?.debounceMs ? { debounceMs: search.debounceMs ?? coarse?.debounceMs } : {}),
    cacheScope: search.cacheScope,
  };
}

export function workflowPathLabel(config: ConfigPackageV3, path: ClassificationPath): string {
  const node = config.nodes.find((candidate) => classificationPathKey(candidate.path) === classificationPathKey(path));
  return (['class', 'kind', 'skind', 'skind2'] as const).filter((level) => Boolean(path[level])).map((level) => {
    const code = path[level] as string;
    const label = node?.classificationLabels?.[level]?.zh;
    return label && label !== code ? `${code}（${label}）` : code;
  }).join(' / ');
}

export function pathDepth(path: ClassificationPath): number {
  return [path.class, path.kind, path.skind, path.skind2].filter(Boolean).length;
}

export function isContinuousPath(path: ClassificationPath): boolean {
  return Boolean(path.class) && (!path.skind || Boolean(path.kind)) && (!path.skind2 || Boolean(path.skind));
}

/** `node` is an inherited prefix of `path`. */
export function nodeMatchesPath(node: CategoryNode, path: ClassificationPath): boolean {
  return Object.entries(node.path).every(([key, value]) => !value || path[key as keyof ClassificationPath] === value);
}

export function pathMatchesScope(candidate: ClassificationPath, scope: ClassificationPath): boolean {
  return Object.entries(scope).every(([key, value]) => !value || candidate[key as keyof ClassificationPath] === value);
}

export function parentClassificationPath(path: ClassificationPath): ClassificationPath | undefined {
  if (path.skind2) return { class: path.class, kind: path.kind, skind: path.skind };
  if (path.skind) return { class: path.class, kind: path.kind };
  if (path.kind) return { class: path.class };
  return undefined;
}

export function inheritanceControls(node: CategoryNode): InheritanceControls {
  if (node.inheritDown) return node.inheritDown;
  return {
    fields: node.policies?.fields !== 'localOnly',
    display: node.policies?.display !== 'localOnly',
    card: node.policies?.card !== 'localOnly',
  };
}

export function resolveCategoryNodes(config: ConfigPackageV3, path: ClassificationPath): CategoryNode[] {
  const compiled = compiledConfigs.get(config);
  if (compiled) {
    const key = compiledPathKey(path); const cached = compiled.ancestors.get(key);
    if (cached) { compiled.hits++; return cached; }
    return cachedPathValue(compiled.ancestors, key, freezeData((compiled.byClass.get(path.class) ?? []).filter(node => nodeMatchesPath(node, path))));
  }
  return config.nodes.filter((node) => nodeMatchesPath(node, path)).sort((a, b) => pathDepth(a.path) - pathDepth(b.path));
}

export function listCategoryPaths(config: ConfigPackageV3, scope: ClassificationPath = { class: '' }): ClassificationPath[] {
  return config.nodes.map((node) => node.path).filter((path) => pathMatchesScope(path, scope)).sort((a, b) => pathDepth(a) - pathDepth(b) || classificationPathKey(a).localeCompare(classificationPathKey(b)));
}

export function hasCategoryNode(config: ConfigPackageV3, path: ClassificationPath): boolean {
  return config.nodes.some((node) => classificationPathKey(node.path) === classificationPathKey(path));
}

export function hasDescendants(config: ConfigPackageV3, path: ClassificationPath): boolean {
  const compiled = compiledConfigs.get(config);
  if (compiled) return compiled.descendants.has(compiledPathKey(path));
  return config.nodes.some((node) => pathDepth(node.path) > pathDepth(path) && pathMatchesScope(node.path, path));
}

/**
 * Fields inherit only while every preceding node enables field propagation.
 * A child can always add a local field; an `overrideOf` replaces exactly one
 * inherited declaration and never mutates the parent node.
 */
export function resolveEffectiveFields(config: ConfigPackageV3, path: ClassificationPath): FieldDefinition[] {
  const compiled = compiledConfigs.get(config); const cacheKey = compiledPathKey(path);
  const cached = compiled?.fields.get(cacheKey);
  if (cached) { compiled!.hits++; return cached; }
  const values = new Map<string, FieldDefinition>();
  let inherited = true;
  for (const [index, node] of resolveCategoryNodes(config, path).entries()) {
    if (index > 0 && !inherited) values.clear();
    if(index>0&&config.contractRevision>=9&&node.receiveFromParent?.fields===false)for(const [key,field] of values)if(field.inheritance!=='sealed')values.delete(key);
    if (index > 0) for (const [key,field] of values) if (field.inheritance === 'localOnly') values.delete(key);
    for (const field of node.fields) {
      const key = field.overrideOf || field.key;
      if (values.get(key)?.inheritance === 'sealed') continue;
      values.set(key, { ...field, key, ...(field.optionSource ? { options: config.registries.optionSets?.find(set => set.id === field.optionSource?.registryKey)?.options ?? field.options } : {}) });
    }
    inherited = inheritanceControls(node).fields;
  }
  const result = [...values.values()];
  return compiled ? cachedPathValue(compiled.fields, cacheKey, freezeData(result)) : result;
}

export function resolveWorkflowSelectOptions(config: ConfigPackageV3, control: Pick<WorkflowControl, 'options' | 'optionSource'>): SelectOption[] {
  if (config.contractRevision >= 8) return control.options ?? [];
  return control.optionSource ? config.registries.optionSets?.find(set => set.id === control.optionSource?.registryKey)?.options ?? [] : control.options ?? [];
}

function systemFieldDefinition(key: string): FieldDefinition {
  return {
    fieldId: `system-${key}`,
    key,
    type: 'string',
    cardinality: 'single',
    input: 'text',
    labels: { zh: key, en: key },
    description: { zh: '运行时系统字段', en: 'Runtime system field' },
    inheritance: 'sealed',
  };
}

export function resolveSelectableFields(config: ConfigPackageV3, scope: ClassificationPath, options: { includeSystem?: boolean } = {}): FieldDefinition[] {
  const systemKeys=[...SYSTEM_FIELD_KEYS].filter(key=>config.contractRevision<8||!['Skind','Skind2'].includes(key));
  const compiled = compiledConfigs.get(config); const cacheKey = `${compiledPathKey(scope)}:${options.includeSystem !== false}`;
  const cached = compiled?.selectable.get(cacheKey);
  if (cached) { compiled!.hits++; return cached; }
  const concrete = config.nodes.filter((node) => pathMatchesScope(node.path, scope) && !hasDescendants(config, node.path));
  const candidates = concrete.length ? concrete : config.nodes.filter((node) => pathMatchesScope(node.path, scope));
  if (!candidates.length) return options.includeSystem === false ? [] : systemKeys.map(systemFieldDefinition);
  const fieldSets = candidates.map((node) => new Map(resolveEffectiveFields(config, node.path).map((field) => [field.key, field])));
  const common = [...fieldSets[0].values()].filter((field) => fieldSets.every((set) => set.has(field.key)));
  if (options.includeSystem === false) return compiled ? cachedPathValue(compiled.selectable, cacheKey, freezeData(common)) : common;
  const custom = new Set(common.map((field) => field.key));
  const result = [...systemKeys.filter((key) => !custom.has(key)).map(systemFieldDefinition), ...common];
  return compiled ? cachedPathValue(compiled.selectable, cacheKey, freezeData(result)) : result;
}

/** Display/Card resolve independently and only propagate through their own switch. */
function resolveInheritedValue<T>(config: ConfigPackageV3, path: ClassificationPath, branch: 'display' | 'card', read: (node: CategoryNode) => T | undefined): T | undefined {
  let result: T | undefined;
  let inherited = true;
  for (const [index, node] of resolveCategoryNodes(config, path).entries()) {
    if (index > 0 && (!inherited || config.contractRevision>=9&&node.receiveFromParent?.[branch]===false)) result = undefined;
    const candidate = read(node);
    if (candidate !== undefined) result = candidate;
    inherited = inheritanceControls(node)[branch];
  }
  return result;
}

export function resolveGeometryProfile(config: ConfigPackageV3, path: ClassificationPath, geometry: GeometryKind): GeometryProfile | undefined {
  const compiled = compiledConfigs.get(config); const key = `${compiledPathKey(path)}:${geometry}`;
  if (compiled?.profiles.has(key)) { compiled.hits++; return compiled.profiles.get(key); }
  const selectedType = resolveInheritedValue(config, path, 'display', (node) => node.geometryType);
  const result = selectedType && selectedType !== geometry ? undefined : resolveInheritedValue(config, path, 'display', (node) => node.geometryProfiles[geometry]);
  return compiled ? cachedPathValue(compiled.profiles, key, result) : result;
}

export function resolveRenderExtensions(config: ConfigPackageV3, geometry: GeometryKind, local?: import('./types').RenderRuleExtensions): import('./types').RenderRuleExtensions {
  const compiled = compiledConfigs.get(config);
  const cached = local ? compiled?.extensions.get(local)?.get(geometry) : compiled?.defaults.get(geometry);
  if (cached) { compiled!.hits++; return cached; }
  const result = structuredClone(config.engine?.renderDefaults?.[geometry] ?? {});
  for (const [key,value] of Object.entries(local ?? {})) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      if (object.mode === 'inherit') continue;
      const previous = (result as Record<string, unknown>)[key];
      const patch = Object.fromEntries(Object.entries(object).filter(([,item]) => item !== undefined && item !== 'inherit'));
      (result as Record<string, unknown>)[key] = { ...(previous && typeof previous === 'object' ? previous : {}), ...patch };
    } else (result as Record<string, unknown>)[key] = value;
  }
  if (compiled) {
    freezeData(result);
    if (!local) compiled.defaults.set(geometry, result);
    else { const map = compiled.extensions.get(local) ?? new Map(); map.set(geometry, result); compiled.extensions.set(local, map); }
  }
  return result;
}

export function resolveCardConfiguration(config: ConfigPackageV3, path: ClassificationPath): CardConfiguration | undefined {
  const compiled = compiledConfigs.get(config); const key = compiledPathKey(path);
  if (compiled?.cards.has(key)) { compiled.hits++; return compiled.cards.get(key); }
  const result = resolveInheritedValue(config, path, 'card', (node) => node.card);
  return compiled ? cachedPathValue(compiled.cards, key, result) : result;
}

export function resolveCardItems(config: ConfigPackageV3, path: ClassificationPath): CardItem[] {
  const card = resolveCardConfiguration(config, path);
  return card?.mode === 'fields' ? card.items : [];
}

export function resolveZoomRule(profile: GeometryProfile, zoom: number, read?: (field: string) => unknown): ZoomPriorityRule | undefined {
  const bucket = compiledZoomBuckets.get(profile)?.[zoom];
  if (profile.zoomPriority.rules.some(rule => rule.when)) {
    const candidates = bucket ?? profile.zoomPriority.rules.filter(rule => { const range = renderRuleRange(rule); return zoom >= range.min && zoom <= range.max; });
    for (let i = candidates.length - 1; i >= 0; i--) if (!candidates[i].when?.fields || read && matchesRenderFields(candidates[i].when?.fields, read)) return candidates[i];
    return undefined;
  }
  if (bucket) return bucket[0];
  return profile.zoomPriority.rules.find((rule) => {
    const min = rule.minZoom ?? (rule.minExclusive === undefined ? undefined : rule.minExclusive + 1);
    const max = rule.maxZoom ?? (rule.maxExclusive === undefined ? undefined : rule.maxExclusive - 1);
    return (min === undefined || zoom >= min) && (max === undefined || zoom <= max);
  });
}

function issue(issues: ConfigValidationIssue[], severity: ConfigValidationIssue['severity'], code: string, path: string, message: string, extra: Partial<ConfigValidationIssue> = {}): void {
  issues.push({ severity, code, path, message, ...extra });
}

function validateCondition(condition: Condition, path: string, issues: ConfigValidationIssue[]): void {
  if (condition.kind === 'zoomRange' && condition.min !== undefined && condition.max !== undefined && condition.min >= condition.max) issue(issues, 'error', 'zoom-range-invalid', path, 'Zoom 区间的下界必须小于上界。');
  if (condition.kind === 'bboxArea' && condition.min !== undefined && condition.max !== undefined && condition.min > condition.max) issue(issues, 'error', 'bbox-range-invalid', path, '面积区间的下界不能大于上界。');
}

function validateField(field: FieldDefinition, path: string, known: Set<string>, issues: ConfigValidationIssue[]): void {
  const scope = fieldScope(field);
  // Root-level data may legitimately contain a structured object path from
  // V1 (for example `TGTcoordinate.x`). `tags.*` and `extensions.*` remain
  // dedicated optional field groups and must never masquerade as root fields.
  const rootKey = /^(?!tags\.)(?!extensions\.)[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
  const nestedKey = /^(?:tags|extensions)\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
  if (!(scope === 'root' ? rootKey.test(field.key) : nestedKey.test(field.key) && field.key.startsWith(`${scope}.`))) issue(issues, 'error', 'field-key-invalid', path, `字段路径 ${field.key || '（空）'} 必须与所属字段组一致。`, { field: field.key });
  if (field.key === 'tags' || field.key === 'extensions') issue(issues, 'error', 'field-group-redefined', path, 'tags/extensions 是固定字段组，不能定义为普通字段或删除。');
  if (PROTECTED_FIELD_KEYS.has(field.key)) issue(issues, 'error', 'system-field-redefined', path, `系统字段 ${field.key} 不能在分类配置中重新定义。`, { field: field.key });
  if (known.has(field.key)) issue(issues, 'error', 'field-key-duplicate', path, `字段 ${field.key} 在同一分类节点中重复。`, { field: field.key });
  known.add(field.key);
  if (!field.labels.zh.trim()) issue(issues, 'error', 'field-label-zh-required', path, '字段必须提供中文标签。', { field: field.key });
  if (field.type === 'enum' && (!field.options?.length && !field.optionSource?.registryKey)) issue(issues, 'error', 'enum-options-required', path, '枚举字段必须提供静态选项或受控选项注册表。', { field: field.key });
  const optionValues = new Set<string>();
  for (const option of field.options ?? []) {
    const normalized = field.optionValueType==='number'?String(Number(option.value)):option.value;
    if (!option.value.trim() || optionValues.has(normalized) || field.optionValueType==='number'&&!Number.isFinite(Number(option.value)) || field.optionValueType==='boolean'&&!['true','false'].includes(option.value)) issue(issues, 'error', 'field-option-invalid', path, '对照存储值必须有效、符合类型且不能重复。', { field: field.key });
    optionValues.add(normalized);
  }
  if (!isSafeWorkflowTarget(field.key)) issue(issues, 'error', 'field-key-unsafe', path, '字段路径包含不安全的属性名。');
  field.requiredWhen?.forEach((item, index) => validateCondition(item, `${path}/requiredWhen/${index}`, issues));
  if (field.overrideOf && field.key !== field.overrideOf) issue(issues, 'error', 'field-override-key-invalid', path, '继承覆盖不能更改字段路径；请新增另一个字段。');
  if (field.requiredWhen?.some(condition => condition.kind === 'zoomRange' || condition.kind === 'bboxArea')) issue(issues, 'error', 'field-required-context-unsupported', path, '条件必填使用字段条件；Zoom/面积条件属于显示规则。');
  if (field.defaultValue !== undefined) {
    const values = field.cardinality === 'multiple' && Array.isArray(field.defaultValue) ? field.defaultValue : [field.defaultValue];
    if (field.cardinality === 'multiple' && !Array.isArray(field.defaultValue) || values.some(value => field.type === 'number' ? typeof value !== 'number' || !Number.isFinite(value) : field.type === 'boolean' ? typeof value !== 'boolean' : field.type === 'enum' ? typeof value !== (field.optionValueType ?? 'string') || !field.options?.some(option=>option.value===String(value)) : ['string','reference'].includes(field.type) ? typeof value !== 'string' : false)) issue(issues, 'error', 'field-default-invalid', path, '默认值与字段类型/值数量不一致。');
  }
}

function validateRenderColorBinding(binding: unknown, config: ConfigPackageV3, sourcePath: ClassificationPath, path: string, issues: ConfigValidationIssue[]): void {
  if (!binding || typeof binding !== 'object') { issue(issues, 'error', 'render-color-binding-required', path, '渲染颜色必须设置为直接颜色、当前字段或外部要素字段。'); return; }
  const value = binding as { mode?: string; color?: string; field?: string; target?: ClassificationPath; targetIdField?: string; targetColorField?: string; strategy?: string };
  const sourceFields = new Set(resolveEffectiveFields(config, sourcePath).map((field) => field.key));
  if(value.mode==='valueMap') {
    const mapping=binding as Extract<import('./types').RenderColorBinding,{mode:'valueMap'}>, field=resolveSelectableFields(config,sourcePath).find(f=>f.key===mapping.field);
    if(config.contractRevision<9)issue(issues,'error','render-color-r9-required',path,'按值设色需要 r9。');
    if(!field)issue(issues,'error','render-color-map-field-invalid',path,'设色字段不存在。');
    if(!validMappedColor(mapping.fallbackColor))issue(issues,'error','render-color-map-fallback-invalid',path,'回退颜色必须为六位十六进制颜色。');
    if(!Array.isArray(mapping.entries)||!mapping.entries.length){issue(issues,'error','render-color-map-empty',path,'至少需要一个设色值。');return;}
    const seen=new Set<unknown>();
    for(const entry of mapping.entries) {
      if(seen.has(entry.value))issue(issues,'error','render-color-map-duplicate',path,'设色保存值重复。');seen.add(entry.value);
      if(!validMappedColor(entry.color))issue(issues,'error','render-color-map-color-invalid',path,'映射颜色必须为六位十六进制颜色。');
      if(field)for(const message of scalarValueErrors(field,entry.value))issue(issues,'error','render-color-map-value-invalid',path,message);
    }
    return;
  }
  if (value.mode === 'fixed') {
    if (!value.color?.trim()) issue(issues, 'error', 'render-color-fixed-required', path, '直接颜色模式必须选择颜色。');
    return;
  }
  if (value.mode === 'field') {
    if (!value.field || !sourceFields.has(value.field)) issue(issues, 'error', 'render-color-field-invalid', path, '绑定颜色字段必须是当前分类的有效字段。', { field: value.field });
    return;
  }
  if (value.mode === 'external') {
    if (!value.target || !isContinuousPath(value.target) || !hasCategoryNode(config, value.target)) issue(issues, 'error', 'render-color-target-classification-invalid', path, '外部颜色必须选择存在且连续的目标分类。');
    if (!value.targetIdField || (!sourceFields.has(value.targetIdField) && !SYSTEM_FIELD_KEYS.has(value.targetIdField))) issue(issues, 'error', 'render-color-target-id-field-invalid', path, '颜色目标要素 ID 字段必须是当前分类的有效字段。', { field: value.targetIdField });
    const targetFields = value.target && isContinuousPath(value.target) && hasCategoryNode(config, value.target) ? new Set(resolveSelectableFields(config, value.target).map((field) => field.key)) : new Set<string>();
    if (!value.targetColorField || !targetFields.has(value.targetColorField)) issue(issues, 'error', 'render-color-target-field-invalid', path, '目标要素颜色字段必须在目标分类中有效。', { field: value.targetColorField });
    return;
  }
  if (value.mode === 'relatedLine') {
    if (!['featureRelation', 'platformFirstLine', 'stationFirstPlatform'].includes(String(value.strategy ?? ''))) issue(issues, 'error', 'render-color-related-line-strategy-invalid', path, '关联线路颜色必须选择已支持的关系策略。');
    return;
  }
  issue(issues, 'error', 'render-color-mode-invalid', path, '渲染颜色模式无效。');
}

function allowedTriggerKeys(geometry: GeometryKind): string[] {
  if (geometry === 'Point') return ['point', 'label'];
  if (geometry === 'LineString') return ['line', 'label'];
  return ['boundary', 'interior', 'label'];
}

function allowedMetrics(geometry: GeometryKind): Set<string> {
  return geometry === 'Point' ? new Set(['partCount', 'field']) : geometry === 'LineString' ? new Set(['length', 'partCount', 'field']) : new Set(['area', 'partCount', 'field']);
}

function validateRuleLabel(
  rule: ZoomPriorityRule,
  rulePath: string,
  config: ConfigPackageV3,
  sourcePath: ClassificationPath,
  issues: ConfigValidationIssue[],
): void {
  const label = rule.label;
  if (!label) {
    issue(issues, 'error', 'render-label-required', rulePath, '每个渲染规则必须定义 Label 效果。');
    return;
  }
  for (const axis of ['offsetX', 'offsetY'] as const) if (label[axis] !== undefined && !Number.isFinite(label[axis])) issue(issues, 'error', 'label-offset-invalid', rulePath, `${axis} 必须是有限数字。`);
  if (label.placement && !['center', 'near', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'aboveLine', 'belowLine'].includes(label.placement)) issue(issues, 'error', 'label-placement-invalid', rulePath, 'Label 位置无效。');
  if (!Number.isFinite(label.collision.basePriority)) issue(issues, 'error', 'label-base-priority-invalid', rulePath, 'Label 基础优先级必须是有限数字。');
  const metric = label.collision.metric;
  if (metric) {
    if (!['area', 'length', 'partCount', 'field'].includes(metric.kind)) issue(issues, 'error', 'label-metric-kind-invalid', rulePath, '碰撞指标类型无效。');
    for (const key of ['multiplier', 'divisor', 'min', 'max'] as const) if (metric[key] !== undefined && (!Number.isFinite(metric[key]) || key === 'divisor' && metric[key] === 0)) issue(issues, 'error', 'label-metric-value-invalid', rulePath, '碰撞指标参数必须为有限数字，除数不可为零。');
    if (metric.min !== undefined && metric.max !== undefined && metric.min > metric.max) issue(issues, 'error', 'label-metric-range-invalid', rulePath, '碰撞指标下限不能大于上限。');
    if (metric.kind === 'field' && !resolveEffectiveFields(config, sourcePath).some(field => field.key === metric.field)) issue(issues, 'error', 'label-metric-field-invalid', rulePath, '碰撞指标字段不存在。');
  }
  const fields = new Set(resolveEffectiveFields(config, sourcePath).map((field) => field.key));
  if (label.source && !sourceExists(label.source, fields)) issue(issues, 'error', 'render-label-source-invalid', rulePath, 'Label 来源必须是当前分类的有效字段、tags.xxx 或 extensions.xxx。', { field: label.source });
  for (const fallback of label.fallbackSources ?? []) if (!sourceExists(fallback, fields)) issue(issues, 'error', 'render-label-fallback-source-invalid', rulePath, 'Label 回退来源必须是当前分类的有效字段、tags.xxx 或 extensions.xxx。', { field: fallback });
  if (label.valueFormat && !['plain', 'floorLabel'].includes(label.valueFormat)) issue(issues, 'error', 'render-label-value-format-invalid', rulePath, 'Label 值格式无效。');
  for (const [source, format] of Object.entries(label.fallbackValueFormats ?? {})) {
    if (!(label.fallbackSources ?? []).includes(source)) issue(issues, 'error', 'render-label-fallback-format-source-invalid', rulePath, '回退格式只能绑定到已声明的 Label 回退来源。', { field: source });
    if (!['plain', 'floorLabel'].includes(format)) issue(issues, 'error', 'render-label-fallback-format-invalid', rulePath, '回退 Label 格式无效。', { field: source });
  }
  const visual = label.style;
  if (isNativeConfigRevision(config.contractRevision) && (label.font !== undefined || label.size !== undefined || label.italic !== undefined || label.underline !== undefined)) {
    issue(issues, 'error', 'legacy-label-field-forbidden', rulePath, 'V3.2 必须使用 style.family / style.size / style.modifiers，不能混入旧字体字段。');
  }
  if (!visual) {
    if (isNativeConfigRevision(config.contractRevision)) issue(issues, 'error', 'label-style-required', rulePath, 'V3.2 原生规则必须选择一个 Label 样式。');
    return;
  }
  if (!Number.isFinite(visual.size) || visual.size < 6 || visual.size > 72) issue(issues, 'error', 'label-style-size-invalid', rulePath, 'Label 样式字号必须介于 6 到 72。');
  const supportsModifiers = new Set(['gm-bw', 'gm-outline', 'gm-wtb', 'structure-label']);
  if ((visual.modifiers?.italic || visual.modifiers?.underline) && !supportsModifiers.has(visual.family)) issue(issues, 'error', 'label-style-modifier-invalid', rulePath, '斜体和下划线仅适用于无背景容器的文字样式。');
  const needsColor = visual.family === 'rle-line-color' || visual.family === 'rle-pill-color';
  if (needsColor) validateRenderColorBinding(visual.color, config, sourcePath, `${rulePath}/label/style/color`, issues);
  if (!needsColor && visual.color) issue(issues, 'warning', 'label-style-color-ignored', rulePath, '当前样式族使用固定的 V1 调色板，颜色绑定不会生效。');
}

function validateRuleExtensions(rule: ZoomPriorityRule, geometry: GeometryKind, rulePath: string, config: ConfigPackageV3, sourcePath: ClassificationPath, issues: ConfigValidationIssue[]): void {
  const extensions = rule.extensions;
  if (!extensions) return;
  if (extensions.fallback?.whenRuleMissing && !['geometryOnly','hidden'].includes(extensions.fallback.whenRuleMissing)) issue(issues, 'error', 'fallback-rule-unsupported', rulePath, '原生规则缺失仅支持隐藏或通用几何；不支持旧规则或调试渲染器回退。');
  if (extensions.fallback?.whenGeometryInvalid && extensions.fallback.whenGeometryInvalid !== 'skip') issue(issues, 'error', 'fallback-geometry-unsupported', rulePath, '无有效几何时只能跳过；错误标记和仅调试尚未实现，不能保存为有效配置。');
  for (const key of ['weightedSwitchThreshold','reuseBonus','edgePenalty'] as const) { const value = extensions.polygonCandidates?.[key]; if (value !== undefined && value < 0) issue(issues, 'error', 'polygon-weight-invalid', rulePath, '面候选权重参数必须非负。'); }
  for (const value of Object.values(extensions.collision?.boundsAdjustment ?? {})) if (value !== undefined && (!Number.isFinite(value) || Math.abs(value) > 80)) issue(issues, 'error', 'collision-bounds-invalid', rulePath, '碰撞框调整须为 -80 到 80 像素。');
  const screen = extensions.screenGate;
  if (screen && screen.mode !== 'inherit' && screen.mode !== 'override') issue(issues, 'error', 'screen-gate-mode-invalid', rulePath, '屏幕阈值必须选择继承全局或本规则覆盖。');
  if (screen?.mode === 'override') {
    if (screen.minScreenAreaPx !== undefined && (!Number.isFinite(screen.minScreenAreaPx) || screen.minScreenAreaPx < 0)) issue(issues, 'error', 'screen-gate-area-invalid', rulePath, '屏幕面积阈值必须是非负数。');
    if (screen.minScreenLengthPx !== undefined && (!Number.isFinite(screen.minScreenLengthPx) || screen.minScreenLengthPx < 0)) issue(issues, 'error', 'screen-gate-length-invalid', rulePath, '屏幕长度阈值必须是非负数。');
    if (geometry !== 'Polygon' && screen.minScreenAreaPx !== undefined) issue(issues, 'warning', 'screen-gate-area-ignored', rulePath, '屏幕面积阈值只适用于面要素。');
    if (geometry !== 'LineString' && screen.minScreenLengthPx !== undefined) issue(issues, 'warning', 'screen-gate-length-ignored', rulePath, '屏幕长度阈值只适用于线要素。');
  }
  if (extensions.hitTolerancePx !== undefined && (!Number.isFinite(extensions.hitTolerancePx) || extensions.hitTolerancePx < 0 || extensions.hitTolerancePx > 80)) issue(issues, 'error', 'hit-tolerance-invalid', rulePath, '点击容差必须介于 0 到 80 像素。');
  for (const [state, override] of Object.entries(extensions.interaction ?? {})) {
    if (!['hover','selected','searchResult','editing','deletionMarked'].includes(state)) issue(issues, 'error', 'interaction-state-invalid', rulePath, '交互状态无效。');
    const visual = { ...config.engine?.interactionBaselines[geometry][state as import('./types').InteractionState], ...override } as import('./types').InteractionVisual;
    validateInteractionShape(visual, `${rulePath}/interaction/${state}`, issues);
    if (visual.strokeColorBinding) validateRenderColorBinding(visual.strokeColorBinding, config, sourcePath, `${rulePath}/interaction/${state}/strokeColorBinding`, issues);
  }
  if (extensions.pane && !['auto', 'overlay', 'overlay-top', 'point', 'point-top'].includes(extensions.pane)) issue(issues, 'error', 'pane-invalid', rulePath, 'Pane 覆盖值无效。');
  const labelText = extensions.labelText;
  if (labelText?.maxChars !== undefined && (!Number.isInteger(labelText.maxChars) || labelText.maxChars < 1)) issue(issues, 'error', 'label-max-chars-invalid', rulePath, 'Label 最大字符数必须是正整数。');
  if (labelText?.maxLines !== undefined && (!Number.isInteger(labelText.maxLines) || labelText.maxLines < 1)) issue(issues, 'error', 'label-max-lines-invalid', rulePath, 'Label 最大行数必须是正整数。');
  if (labelText?.maxLines !== undefined && !labelText.multiline) issue(issues, 'warning', 'label-max-lines-ignored', rulePath, '未开启多行 Label 时，最大行数不会生效。');
  const anchor = extensions.anchor;
  const allowedAnchorStrategies = geometry === 'Point'
    ? new Set(['inherit', 'featureCenter'])
    : geometry === 'LineString'
      ? new Set(['inherit', 'featureCenter', 'lineCenter', 'lineCandidates'])
      : new Set(['inherit', 'featureCenter', 'interior', 'visibleInterior']);
  if (anchor?.strategy && !allowedAnchorStrategies.has(anchor.strategy)) issue(issues, 'error', 'anchor-strategy-geometry-invalid', rulePath, '当前几何类型不能使用该候选锚点策略。');
  if (anchor?.candidates && new Set(anchor.candidates).size !== anchor.candidates.length) issue(issues, 'error', 'anchor-candidates-duplicate', rulePath, '候选锚点方向不能重复。');
  if (anchor?.candidateOffsetsPx) {
    const names = new Set<string>();
    for (const offset of anchor.candidateOffsetsPx) {
      if (!offset.name.trim() || names.has(offset.name) || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) issue(issues, 'error', 'candidate-offset-invalid', rulePath, '候选名称必须非空且唯一，X/Y 必须为有限数字。');
      names.add(offset.name);
    }
  }
  if (anchor?.offsetPx && (!Number.isFinite(anchor.offsetPx.x) || !Number.isFinite(anchor.offsetPx.y))) issue(issues, 'error', 'anchor-offset-invalid', rulePath, '锚点 X/Y 必须为有限数字。');
  const lists: Array<[string, string[] | undefined, string[]]> = [
    ['invalidateWhen', extensions.stability?.invalidateWhen, ['zoomBucketChanged','featureGeometryChanged','featureTextChanged','modeChanged','worldChanged','labelOutOfViewport','collisionFailedRepeatedly']],
    ['reduceOrder', extensions.density?.reduceOrder, ['hideSoftLabels','abbreviateOptionalLabels','hideOptionalLabels','hideSymbols','geometryOnly']],
    ['collideWith', extensions.collision?.collideWith, ['symbol','requiredLabel','importantLabel','optionalLabel','softLabel','geometry']],
    ['blocks', extensions.collision?.blocks, ['optionalLabel','softLabel','poiLabel','structureLabel']],
  ];
  for (const [name, values, allowed] of lists) if (values && (new Set(values).size !== values.length || values.some(value => !allowed.includes(value)))) issue(issues, 'error', 'extension-list-invalid', `${rulePath}/${name}`, '策略列表存在重复或未知值。');
  const density = extensions.density;
  if (density && density.mode !== 'inherit' && density.mode !== 'override') issue(issues, 'error', 'density-mode-invalid', rulePath, '密度预算必须选择继承或本规则覆盖。');
  if (density?.mode === 'override') {
    for (const [name, value] of Object.entries({ gridSizePx: density.gridSizePx, maxLabelsPerGrid: density.maxLabelsPerGrid, maxSymbolsPerGrid: density.maxSymbolsPerGrid })) {
      if (value !== undefined && (!Number.isFinite(value) || Number(value) <= 0)) issue(issues, 'error', 'density-value-invalid', `${rulePath}/density/${name}`, '密度网格及每格预算必须为正数。');
    }
  }
  const line = extensions.lineLabel;
  const lineExtensionConfigured = Boolean(line && Object.entries(line).some(([key, value]) => key === 'profile' ? value !== 'inherit' : value !== undefined));
  if (lineExtensionConfigured && geometry !== 'LineString') issue(issues, 'error', 'line-label-extension-geometry-invalid', rulePath, '线 Label 扩展只能用于线要素。');
  if (line && line.maxTurnAngleDeg !== undefined && (!Number.isFinite(line.maxTurnAngleDeg) || line.maxTurnAngleDeg < 0 || line.maxTurnAngleDeg > 180)) issue(issues, 'error', 'line-label-turn-angle-invalid', rulePath, '线 Label 转角阈值必须介于 0 到 180 度。');
  if (line && line.endpointPaddingRatio !== undefined && (!Number.isFinite(line.endpointPaddingRatio) || line.endpointPaddingRatio < 0 || line.endpointPaddingRatio > 0.5)) issue(issues, 'error', 'line-label-endpoint-padding-invalid', rulePath, '端点留白比例必须介于 0 到 0.5。');
  if (line && line.endpointPaddingMinPx !== undefined && (!Number.isFinite(line.endpointPaddingMinPx) || line.endpointPaddingMinPx < 0)) issue(issues, 'error', 'line-label-endpoint-padding-px-invalid', rulePath, '端点最小留白必须是非负像素值。');
  if (line && line.minLengthPx !== undefined && (!Number.isFinite(line.minLengthPx) || line.minLengthPx < 0)) issue(issues, 'error', 'line-label-min-length-invalid', rulePath, '最小线长必须是非负像素值。');
  const visibility = extensions.visibility;
  if (visibility) {
    if (!['inherit', 'always', 'sameId', 'coincidentPoint', 'lineContainmentChoice', 'activeContextMember'].includes(visibility.mode)) issue(issues, 'error', 'visibility-extension-mode-invalid', rulePath, '可见性扩展模式无效。');
    if (visibility.mode === 'sameId') {
      const spec = visibility.sameId;
      if (!spec || !spec.target || !hasCategoryNode(config, spec.target)) issue(issues, 'error', 'visibility-same-id-target-invalid', rulePath, '同 ID 可见性规则必须选择有效目标分类。');
      const fields = new Set(resolveEffectiveFields(config, sourcePath).map((field) => field.key));
      if (spec?.sourceField && !sourceExists(spec.sourceField, fields)) issue(issues, 'error', 'visibility-same-id-source-invalid', rulePath, '同 ID 来源字段无效。', { field: spec.sourceField });
      if (spec?.target && hasCategoryNode(config, spec.target) && spec.targetField && !sourceExists(spec.targetField, new Set(resolveSelectableFields(config, spec.target).map((field) => field.key)))) issue(issues, 'error', 'visibility-same-id-target-field-invalid', rulePath, '同 ID 目标匹配字段无效。', { field: spec.targetField });
    }
    if (visibility.mode === 'coincidentPoint') {
      const spec = visibility.coincidentPoint;
      if (geometry !== 'Point') issue(issues, 'error', 'visibility-coincident-geometry-invalid', rulePath, '重合点可见性规则只能用于点要素。');
      if (!spec || !spec.target || !hasCategoryNode(config, spec.target)) issue(issues, 'error', 'visibility-coincident-target-invalid', rulePath, '重合点可见性规则必须选择有效目标分类。');
      if (spec?.target && hasCategoryNode(config, spec.target) && spec.targetField && !sourceExists(spec.targetField, new Set(resolveSelectableFields(config, spec.target).map((field) => field.key)))) issue(issues, 'error', 'visibility-coincident-target-field-invalid', rulePath, '重合点目标字段无效。', { field: spec.targetField });
    }
    if (visibility.mode === 'lineContainmentChoice') {
      const spec = visibility.lineContainmentChoice;
      const fields = new Set(resolveEffectiveFields(config, sourcePath).map((field) => field.key));
      if (geometry !== 'LineString') issue(issues, 'error', 'visibility-line-choice-geometry-invalid', rulePath, '贴线互斥可见性规则只能用于线要素。');
      if (!spec?.field || !sourceExists(spec.field, fields) || !spec.primaryValue || !spec.overlayValues?.length || !Number.isFinite(spec.switchZoom)) issue(issues, 'error', 'visibility-line-choice-invalid', rulePath, '贴线互斥可见性规则必须提供字段、主值、覆盖值与切换 Zoom。');
    }
    if (visibility.mode === 'activeContextMember') {
      const spec = visibility.activeContextMember;
      if (spec?.bindingId && !(config.contextBindings ?? []).some((binding) => binding.enabled && binding.id === spec.bindingId)) issue(issues, 'error', 'visibility-context-binding-invalid', rulePath, '楼层/单元可见性规则引用了不存在的上下文绑定。');
    }
  }
}

function validateProfile(profile: GeometryProfile, geometry: GeometryKind, path: string, config: ConfigPackageV3, sourcePath: ClassificationPath, issues: ConfigValidationIssue[]): void {
  if (isNativeConfigRevision(config.contractRevision) && (profile.color !== undefined || profile.style !== undefined || profile.geometryStack !== undefined || profile.label !== undefined || profile.legacyDisplay !== undefined)) {
    issue(issues, 'error', 'legacy-profile-field-forbidden', path, 'V3.2 的显示值必须位于各 Zoom 渲染规则内，不能使用旧几何层级或 label 配置字段。');
  }
  if (!profile.allowMultipleParts && profile.anchor === 'perPart') issue(issues, 'error', 'anchor-requires-multipart', path, '仅允许多部件时才能选择“各部件”锚点。');
  const allowed = new Set(allowedTriggerKeys(geometry));
  const triggers = profile.interaction?.triggers ?? {};
  for (const [key, enabled] of Object.entries(triggers)) if (enabled && !allowed.has(key)) issue(issues, 'error', 'interaction-trigger-geometry-invalid', path, `${key} 不适用于 ${geometry}。`);
  if (profile.enabled && !Object.values(triggers).some(Boolean)) issue(issues, 'warning', 'interaction-trigger-none', path, '已启用的几何类型没有交互触发器，将不能通过地图打开信息卡。');
  if (!profile.zoomPriority.rules.length && !(config.contractRevision>=9&&profile.renderState==='unconfigured')) issue(issues, 'error', 'render-rule-missing', path, '每种已启用几何至少需要一个渲染规则。');
  if(config.contractRevision>=9&&profile.renderState==='unconfigured'&&profile.zoomPriority.rules.length)issue(issues,'error','unconfigured-render-has-rules',path,'未配置显示状态不能含有活动规则。');
  const intervals: Array<{ id: string; min: number; max: number }> = [];
  for (const [index, rule] of profile.zoomPriority.rules.entries()) {
    const rulePath = `${path}/renderRules/${rule.id || index + 1}`;
    const min = rule.when?.zoom.min ?? rule.minZoom;
    const max = rule.when?.zoom.max ?? rule.maxZoom;
    if (config.contractRevision >= 7) {
      if (!rule.when || !Number.isInteger(min) || !Number.isInteger(max) || min! < 0 || max! > 8 || min! > max!) issue(issues, 'error', 'render-match-zoom-required', rulePath, 'r7 必须填写 0–8 的闭区间整数 Zoom，允许单级区间。');
      if (rule.minZoom !== undefined || rule.maxZoom !== undefined || rule.minExclusive !== undefined || rule.maxExclusive !== undefined || rule.conditionalOverrides !== undefined) issue(issues, 'error', 'render-legacy-match-forbidden', rulePath, 'r7 只使用 when.zoom 和非分类字段组合，不能保留旧匹配或分支。');
      for (const message of validateRenderFields(rule.when?.fields, resolveSelectableFields(config, sourcePath), resolveSelectableFields(config, sourcePath).map(field => field.key))) issue(issues, 'error', 'render-field-condition-invalid', `${rulePath}/when/fields`, message);
    } else if (rule.when) issue(issues, 'error', 'render-match-revision-invalid', rulePath, '组合规则需要原生 r7；旧包请先无损迁移。');
    if (!rule.representation) issue(issues, 'error', 'render-representation-required', rulePath, '渲染规则必须选择显示种类。');
    else if (!['hidden', 'geometry', 'point', 'labelOnly'].includes(rule.representation)) issue(issues, 'error', 'render-representation-invalid', rulePath, '未知显示种类。');
    if (rule.representation === 'labelOnly' && config.contractRevision < 6) issue(issues, 'error', 'render-contract-capability-invalid', rulePath, '仅标签显示需要原生契约 revision 6 或更新版本。');
    if (min !== undefined && max !== undefined && min > max) issue(issues, 'error', 'zoom-interval-invalid', rulePath, '显示区间必须符合下界 ≤ Zoom ≤ 上界。');
    intervals.push({ id: rule.id, min: min ?? -Infinity, max: max ?? Infinity });
    const stack = rule.geometryStack;
    if (!stack || !Number.isInteger(stack.zLevel) || stack.zLevel < 0 || stack.zLevel > 9999) issue(issues, 'error', 'geometry-zlevel-invalid', rulePath, '每个渲染规则的几何 zLevel 必须是 0 到 9999 之间的整数。');
    const style = rule.style;
    if (style?.symbolOffsetPx && (!Number.isFinite(style.symbolOffsetPx.x) || !Number.isFinite(style.symbolOffsetPx.y))) issue(issues, 'error', 'render-symbol-offset-invalid', rulePath, '符号偏移必须为有限像素值。');
    if (style?.symbolAnchor && !['geometry', 'label'].includes(style.symbolAnchor) || style?.symbolVisibility && !['independent', 'withLabel'].includes(style.symbolVisibility)) issue(issues, 'error', 'render-symbol-policy-invalid', rulePath, '符号锚点或可见性策略无效。');
    if (rule.representation !== 'hidden' && !style) issue(issues, 'error', 'render-style-required', rulePath, '非隐藏渲染规则必须定义显示效果。');
    if (style) {
      if (style.size !== undefined && (!Number.isFinite(style.size) || style.size <= 0)) issue(issues, 'error', 'render-size-invalid', rulePath, '点符号大小必须为正数。');
      if (style.weight !== undefined && (!Number.isFinite(style.weight) || style.weight < 0)) issue(issues, 'error', 'render-stroke-width-invalid', rulePath, '描边粗细必须为非负数。');
      if (!Number.isFinite(style.strokeOpacity) || style.strokeOpacity < 0 || style.strokeOpacity > 1) issue(issues, 'error', 'render-stroke-opacity-invalid', rulePath, '描边透明度必须在 0 到 1 之间。');
      if (style.fillOpacity !== undefined && (!Number.isFinite(style.fillOpacity) || style.fillOpacity < 0 || style.fillOpacity > 1)) issue(issues, 'error', 'render-fill-opacity-invalid', rulePath, '填色透明度必须在 0 到 1 之间。');
      validateRenderColorBinding(style.stroke, config, sourcePath, `${rulePath}/style/stroke`, issues);
      if (style.fill) validateRenderColorBinding(style.fill, config, sourcePath, `${rulePath}/style/fill`, issues);
      if ((geometry === 'Point' || rule.representation === 'point') && !style.fill) issue(issues, 'error', 'render-fill-required', rulePath, '点样式与面内中点样式必须定义填色。');
      if (style.icon) {
        const iconFields = new Set(resolveEffectiveFields(config, sourcePath).map((field) => field.key));
        if (!sourceExists(style.icon.source, iconFields)) issue(issues, 'error', 'render-icon-source-invalid', rulePath, '图标 URL 必须来自当前分类的有效字段、tags.xxx 或 extensions.xxx。', { field: style.icon.source });
        if (geometry !== 'Point' && rule.representation !== 'point') issue(issues, 'error', 'render-icon-geometry-invalid', rulePath, '图标覆盖只适用于点或面内中点渲染。');
        if (!Array.isArray(style.icon.size) || style.icon.size.length !== 2 || style.icon.size.some((value) => !Number.isFinite(value) || value <= 0)) issue(issues, 'error', 'render-icon-size-invalid', rulePath, '图标尺寸必须是两个正数。');
        if (!Array.isArray(style.icon.anchor) || style.icon.anchor.length !== 2 || style.icon.anchor.some((value) => !Number.isFinite(value))) issue(issues, 'error', 'render-icon-anchor-invalid', rulePath, '图标锚点必须是两个有限数字。');
      }
    }
    validateRuleLabel(rule, rulePath, config, sourcePath, issues);
    const metric = rule.priority?.metric;
    if (metric && !allowedMetrics(geometry).has(metric.kind)) issue(issues, 'error', 'dynamic-priority-metric-geometry-invalid', rulePath, `${metric.kind} 不适用于 ${geometry}。`);
    if (metric && (!Number.isFinite(metric.multiplier) || (metric.divisor !== undefined && (!Number.isFinite(metric.divisor) || metric.divisor === 0)) || (metric.min !== undefined && metric.max !== undefined && metric.min > metric.max))) issue(issues, 'error', 'dynamic-priority-invalid', rulePath, '动态优先级的倍率、除数或上下界无效。');
    if (metric?.kind === 'field' && !metric.field?.trim()) issue(issues, 'error', 'dynamic-priority-field-required', rulePath, '字段型动态优先级必须指定字段。');
    validateRuleExtensions({ ...rule, extensions: resolveRenderExtensions(config, geometry, rule.extensions) }, geometry, rulePath, config, sourcePath, issues);
    const overrideIds = new Set<string>();
    for (const [overrideIndex, override] of (rule.conditionalOverrides ?? []).entries()) {
      const overridePath = `${rulePath}/conditionalOverrides/${override.id || overrideIndex + 1}`;
      if (!override.id || overrideIds.has(override.id)) issue(issues, 'error', 'render-conditional-override-id-invalid', overridePath, '字段条件覆盖必须具有唯一 ID。');
      overrideIds.add(override.id);
      if (!override.when.length) issue(issues, 'error', 'render-conditional-override-condition-required', overridePath, '字段条件覆盖至少需要一个条件。');
      for (const [conditionIndex, condition] of override.when.entries()) {
        validateCondition(condition, `${overridePath}/when/${conditionIndex}`, issues);
        if ((condition.kind === 'fieldEquals' || condition.kind === 'fieldIn' || condition.kind === 'fieldPresent') && !sourceExists(condition.field, new Set(resolveEffectiveFields(config, sourcePath).map((field) => field.key)))) issue(issues, 'error', 'render-conditional-override-field-invalid', `${overridePath}/when/${conditionIndex}`, '字段条件必须使用当前分类的有效字段。', { field: condition.field });
      }
      if (override.style) {
        if (!Number.isFinite(override.style.strokeOpacity) || override.style.strokeOpacity < 0 || override.style.strokeOpacity > 1) issue(issues, 'error', 'render-conditional-style-opacity-invalid', overridePath, '条件覆盖的描边透明度必须在 0 到 1 之间。');
        validateRenderColorBinding(override.style.stroke, config, sourcePath, `${overridePath}/style/stroke`, issues);
        if (override.style.fill) validateRenderColorBinding(override.style.fill, config, sourcePath, `${overridePath}/style/fill`, issues);
      }
      if (override.label) validateRuleLabel({ ...rule, label: override.label }, overridePath, config, sourcePath, issues);
      if (override.extensions) validateRuleExtensions({ ...rule, extensions: override.extensions }, geometry, overridePath, config, sourcePath, issues);
    }
    if (isNativeConfigRevision(config.contractRevision) && rule.advanced && Object.keys(rule.advanced).some((key) => {
      const value = rule.advanced?.[key as keyof NonNullable<typeof rule.advanced>];
      return value !== undefined && (typeof value !== 'object' || value === null || Object.keys(value as object).length > 0);
    })) issue(issues, 'error', 'legacy-advanced-forbidden', rulePath, 'V3.2 原生规则只能使用类型化“扩展规则”，不得保留 V1 advanced/JSON 回退。');
    if (!rule.id || profile.zoomPriority.rules.slice(0, index).some(prior => prior.id === rule.id)) issue(issues, 'error', 'render-rule-id-required', rulePath, '渲染规则必须具有唯一 ID。');
  }
  for (let left = 0; left < intervals.length; left += 1) for (let right = left + 1; right < intervals.length; right += 1) {
    const a = intervals[left]; const b = intervals[right];
    if (config.contractRevision >= 7) {
      if (a.min === b.min && a.max === b.max && canonicalRenderFields(profile.zoomPriority.rules[left].when?.fields) === canonicalRenderFields(profile.zoomPriority.rules[right].when?.fields)) issue(issues, 'error', 'render-match-duplicate', path, `渲染规则 ${a.id} 与 ${b.id} 的完整条件重复。`);
      else if (a.min >= b.min && a.max <= b.max && !profile.zoomPriority.rules[right].when?.fields) issue(issues, 'warning', 'render-match-shadowed', path, `规则 ${a.id} 被后项 ${b.id} 完全覆盖。`);
    } else if (a.min <= b.max && b.min <= a.max) issue(issues, 'error', 'render-zoom-interval-overlap', path, `渲染规则 ${a.id} 与 ${b.id} 的闭区间重叠。`);
  }
}

function registryHas(items: { id: string; allowedClasses?: string[] }[], id: string, classCode: string): boolean {
  const item = items.find((entry) => entry.id === id);
  return Boolean(item && (!item.allowedClasses?.length || item.allowedClasses.includes(classCode)));
}

function sourceExists(source: string, fields: Set<string>): boolean {
  const root = source.split('.')[0];
  return source.startsWith('tags.') || source.startsWith('extensions.') || SYSTEM_FIELD_KEYS.has(source) || fields.has(source) || fields.has(root);
}

function validateCard(node: CategoryNode, config: ConfigPackageV3, issues: ConfigValidationIssue[]): void {
  const path = `nodes/${node.nodeId}/card`;
  if(config.contractRevision>=9&&node.card?.mode==='fields'&&node.card.items.some(item=>item.labelMode||item.valueMode))issue(issues,'error','live-card-source-forbidden',path,'r9 信息卡不保留跟随/覆写状态，请先迁移。');
  const card = resolveCardConfiguration(config, node.path);
  if (!card) {
    // A blank r5 package may intentionally contain only rendering rules.
    // Treat that as a warning so authors can test native rendering first;
    // the semantic V1 migration path supplies declarative cards separately.
    issue(issues, isNativeConfigRevision(config.contractRevision) ? 'warning' : 'error', isNativeConfigRevision(config.contractRevision) ? 'card-migration-pending' : 'card-inheritance-missing', path, isNativeConfigRevision(config.contractRevision) ? '信息卡迁移尚未执行；本轮原生渲染包不附带卡片定义。' : '该分类没有本地信息卡，且没有可继承的信息卡。');
    return;
  }
  const fields = new Set(resolveEffectiveFields(config, node.path).map((field) => field.key));
  if (card.mode === 'layout') {
    if (!registryHas(config.registries.cardLayouts, card.layoutId, node.path.class)) issue(issues, 'error', 'card-layout-invalid', path, `信息卡布局 ${card.layoutId || '（空）'} 不在受控注册表中或不适用于该 Class。`);
    return;
  }
  if (card.mode === 'component') {
    if (!registryHas(config.registries.cardComponents, card.componentKey, node.path.class)) issue(issues, 'error', 'card-component-invalid', path, `专用信息卡组件 ${card.componentKey || '空'} 不在受控注册表中或不适用于该 Class。`);
    return;
  }
  if (card.remaining) {
    if (!['main','other'].includes(card.remaining.section)) issue(issues, 'error', 'card-remaining-section-invalid', path, '剩余字段区域无效。');
    if (card.remaining.order && !['record','alphabetical'].includes(card.remaining.order)) issue(issues, 'error', 'card-remaining-order-invalid', path, '剩余字段排序方式无效。');
    for (const key of ['maxDepth','maxArrayLength'] as const) if (card.remaining[key] !== undefined && (!Number.isInteger(card.remaining[key]) || card.remaining[key]! <= 0)) issue(issues, 'error', 'card-remaining-limit-invalid', path, '剩余字段上限必须为正整数。');
  }
  for (const item of card.items) {
    const itemPath = `${path}/items/${item.id}`;
    if (!CARD_RENDERERS.has(item.renderer)) issue(issues, 'error', 'card-renderer-invalid', itemPath, `未知的信息卡显示器 ${String(item.renderer)}。`);
    if (item.section !== undefined && item.section !== 'main' && item.section !== 'other') issue(issues, 'error', 'card-section-invalid', itemPath, '信息卡区域只能为主要信息或其他信息。');
    if (!sourceExists(item.source, fields)) issue(issues, 'error', 'card-field-missing', itemPath, `信息卡字段 ${item.source} 未定义。`, { field: item.source });
    const mapped = item.valueOptions ?? [];
    if (mapped.some(option=>!option.value.trim()) || new Set(mapped.map(option=>option.value)).size!==mapped.length) issue(issues,'error','card-value-map-invalid',itemPath,'信息卡覆写对照必须有唯一非空的存储值。');
    const definition=resolveEffectiveFields(config,node.path).find(field=>field.key===item.source);
    if(config.contractRevision>=8&&item.valueMode==='override'&&definition?.type==='enum'&&mapped.some(option=>!definition.options?.some(value=>value.value===option.value)))issue(issues,'error','card-field-map-conflict',itemPath,`信息卡 ${item.source} 覆写对照使用了来源字段已删除的选项，请调整覆写或恢复跟随。`);
    if (item.options?.format && !['plain','externalLink','boolean','json','classification','enum','date','world'].includes(item.options.format)) issue(issues, 'error', 'card-format-invalid', itemPath, '未知的信息卡格式。');
    if (config.contractRevision === 5 && item.options?.format && ['classification','enum','date','world'].includes(item.options.format)) issue(issues, 'error', 'card-format-revision-invalid', itemPath, '该信息卡格式要求原生 r6。');
    if (item.renderer === 'lineChips' && !item.options?.lineChipSource) issue(issues, 'error', 'card-line-chips-source-required', itemPath, '关联线路胶囊必须选择平台、车站或车站建筑来源。');
    if (item.renderer !== 'relationLink') continue;
    const relation = item.relation;
    if (!relation?.targetClassification || !isContinuousPath(relation.targetClassification) || !hasCategoryNode(config, relation.targetClassification)) {
      issue(issues, 'error', 'relation-target-classification-invalid', itemPath, '关系卡必须选择存在且连续的目标分类。');
      continue;
    }
    const targetFields = new Set(resolveSelectableFields(config, relation.targetClassification).map((field) => field.key));
    const supports = (field: string | undefined) => Boolean(field && (targetFields.has(field) || SYSTEM_FIELD_KEYS.has(field)));
    if (!supports(relation.targetMatchField)) issue(issues, 'error', 'relation-target-match-field-invalid', itemPath, '关系卡的目标匹配字段不在目标分类的有效字段集中。');
    if (!supports(relation.targetDisplayField)) issue(issues, 'error', 'relation-target-display-field-invalid', itemPath, '关系卡的目标展示字段不在目标分类的有效字段集中。');
  }
}

function controlsFor(workflow: WorkflowDefinition): WorkflowControl[] {
  return workflow.steps.flatMap((step) => step.controls ?? []);
}

function validateSearch(control: Pick<WorkflowControl, 'kind' | 'search'>, config: ConfigPackageV3, path: string, issues: ConfigValidationIssue[]): void {
  const search = normalizeSearchProfile(control.search);
  if (!search || !isContinuousPath(search.target) || !hasCategoryNode(config, search.target)) {
    issue(issues, 'error', 'workflow-search-target-invalid', path, '搜索控件必须选择存在且连续的目标分类范围。');
    return;
  }
  const selectable = new Set(resolveSelectableFields(config, search.target).map((field) => field.key));
  if (!search.queryFields?.length) issue(issues, 'error', 'workflow-search-fields-required', path, '搜索控件至少需要选择一个可匹配字段。');
  for (const field of search.queryFields ?? []) if (!selectable.has(field)) issue(issues, 'error', 'workflow-search-field-invalid', path, `搜索字段 ${field} 不在目标分类的有效字段集中。`, { field });
  if (!search.returnField || !selectable.has(search.returnField)) issue(issues, 'error', 'workflow-search-return-field-invalid', path, '搜索控件必须选择一个有效的单一返回字段。', { field: search.returnField });
  const templateFields = [...String(search.displayTemplate ?? '').matchAll(/{{\s*([A-Za-z][A-Za-z0-9_.]*)\s*}}/g)].map((match) => match[1]);
  if (!templateFields.length) issue(issues, 'error', 'workflow-search-display-template-invalid', path, '展示格式必须至少引用一个字段，例如 {{ID}} ({{Name}})。');
  for (const field of templateFields) if (!selectable.has(field)) issue(issues, 'error', 'workflow-search-display-field-invalid', path, `展示格式字段 ${field} 不在目标分类的有效字段集中。`, { field });
  if (!['contains', 'prefix', 'token', 'fuzzy'].includes(search.matcher ?? '')) issue(issues, 'error', 'workflow-search-matcher-invalid', path, '搜索匹配方式无效。');
  if (!['world', 'loadedWorlds'].includes(search.cacheScope) || search.debounceMs !== undefined && (!Number.isInteger(search.debounceMs) || search.debounceMs < 0)) issue(issues, 'error', 'workflow-search-cache-invalid', path, '搜索范围或延迟无效。');
  if (!Number.isInteger(search.minQueryLength) || Number(search.minQueryLength) < 0 || !Number.isInteger(search.maxResults) || Number(search.maxResults) < 1) issue(issues, 'error', 'workflow-search-options-invalid', path, '搜索必须配置有效的最短输入长度和结果上限。');
}

function targetSupportsClassificationPicker(config: ConfigPackageV3, target: ClassificationPath): boolean {
  return hasDescendants(config, target);
}

export function validateWorkflowOutput(output: WorkflowOutput, _outputIndex: number, workflow: WorkflowDefinition, config: ConfigPackageV3, slots: Set<string>, issues: ConfigValidationIssue[]): void {
  const base = `workflows/${workflow.id}/outputs/${output.id}`;
  if (!isContinuousPath(output.classification) || !hasCategoryNode(config, output.classification)) issue(issues, 'error', 'workflow-output-classification-invalid', base, '工作流输出必须选择存在且连续的目标分类。');
  if (!output.geometry.selected) issue(issues, 'error', 'workflow-output-geometry-required', base, '每个工作流输出必须选择固定绘制类型。');
  else if (!listCategoryPaths(config, output.classification).some(path => !hasDescendants(config,path) && resolveGeometryProfile(config,path,output.geometry.selected)?.enabled)) issue(issues, 'error', 'workflow-output-geometry-disabled', base, `输出范围没有最终分类启用 ${output.geometry.selected} 绘制类型。`);
  const fields = new Set(resolveEffectiveFields(config, output.classification).map((field) => field.key));
  const tokens = new Set([...WORKFLOW_SYSTEM_TOKENS, ...workflow.outputs.flatMap((_, index) => WORKFLOW_SYSTEM_TOKENS.map((item) => `${item}_${index + 1}`)), ...slots, ...workflowDerivedPointTokens(workflow)]);
  const assignmentIds = new Set<string>();
  for (const assignment of output.assignments) {
    const assignmentPath = `${base}/assignments/${assignment.id}`;
    validateWorkflowValueCondition(assignment.when, tokens, assignmentPath, issues);
    if (PROTECTED_WORKFLOW_TARGETS.has(assignment.target.split('.')[0])) {
      const token = assignment.target === 'SKind' ? 'Skind' : assignment.target === 'SKind2' ? 'Skind2' : assignment.target;
      if (assignment.expression.trim() !== token || !WORKFLOW_SYSTEM_TOKENS.includes(token as typeof WORKFLOW_SYSTEM_TOKENS[number])) issue(issues, 'error', 'workflow-system-target-protected', assignmentPath, `系统字段 ${assignment.target} 不能由字段组装覆盖。`);
    }
    if (!assignment.target.trim() || !assignment.expression.trim()) issue(issues, 'error', 'workflow-assignment-invalid', assignmentPath, '字段组装必须同时指定目标和表达式。');
    if (!isSafeWorkflowTarget(assignment.target) || (!fields.has(assignment.target) && !/^tags\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(assignment.target) && !/^extensions\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(assignment.target) && !SYSTEM_FIELD_KEYS.has(assignment.target))) issue(issues, 'error', 'workflow-assignment-target-invalid', assignmentPath, `字段组装目标 ${assignment.target} 不是有效字段、tags 或 extensions 路径。`);
    if (!assignment.id || assignmentIds.has(assignment.id)) issue(issues, 'error', 'workflow-assignment-id-invalid', assignmentPath, '组装行标识必须存在且不能重复。');
    const field=resolveEffectiveFields(config,output.classification).find(field=>field.key===assignment.target);
    const control=controlsFor(workflow).find(control=>control.slot===assignment.expression.trim());
    if (control && field && (control.fieldSource||config.contractRevision>=8)) {
      const leaf=control.kind==='group'?control.group?.itemFields[0]:control;
      const returned=leaf&&(leaf.kind==='featureSearch'||leaf.kind==='coarseSearch')&&leaf.search?resolveSelectableFields(config,leaf.search.target).find(field=>field.key===leaf.search!.returnField):undefined;
      const actualType=control.kind==='group'&&control.group?.storage==='object'?'json':leaf?.kind==='number'?'number':leaf?.kind==='toggle'?'boolean':leaf?.kind==='select'?leaf.optionValueType??'string':returned?returned.type==='enum'?returned.optionValueType??'string':returned.type==='reference'?'string':returned.type:leaf?.kind==='json'?'json':'string';
      const actualMultiple=control.kind==='group'||returned?.cardinality==='multiple';
      const expectedType=field.type==='enum'?field.optionValueType??'string':field.type==='reference'?'string':field.type;
      if (field.type!=='json' && ((field.cardinality==='multiple')!==Boolean(actualMultiple)||actualType!==expectedType))issue(issues,'error','field-import-target-conflict',assignmentPath,'输入控件与输出目标的保存值类型或值数量不兼容。');
      if(field.type==='enum'&&(control.kind==='group'?control.group?.itemFields[0]?.options:control.options)?.some(option=>!field.options?.some(target=>target.value===option.value)))issue(issues,'error','field-import-target-conflict',assignmentPath,'工作流选项包含输出目标字段不允许的保存值。');
    }
    assignmentIds.add(assignment.id);
    try {
      for (const token of workflowExpressionTokens(parseWorkflowExpression(assignment.expression))) if (!tokens.has(token)) issue(issues, 'error', 'workflow-assignment-slot-missing', assignmentPath, `字段组装引用了不存在的输入槽位或系统字段 ${token}。`);
    } catch (error) { issue(issues, 'error', 'workflow-assignment-expression-invalid', assignmentPath, error instanceof Error ? error.message : '组装表达式无效。'); }
  }
}

function validateWorkflowValueCondition(condition: import('./types').WorkflowValueCondition | undefined, tokens: Set<string>, path: string, issues: ConfigValidationIssue[]): void {
  if (!condition) return;
  if (condition.all || condition.any) {
    const items=condition.all ?? condition.any ?? [];
    if (!items.length || condition.all && condition.any) issue(issues,'error','workflow-value-condition-invalid',path,'组合条件必须有内容且只能选择全部或任意。');
    for (const child of items) validateWorkflowValueCondition(child,tokens,path,issues);
    return;
  }
  if (!tokens.has(condition.token) || !['empty','present','equals','in'].includes(condition.operator)) issue(issues, 'error', 'workflow-value-condition-invalid', path, '执行条件必须使用已声明 token 与受控操作。');
  if (condition.operator === 'equals' && !['string','number','boolean'].includes(typeof condition.value)) issue(issues, 'error', 'workflow-value-condition-invalid', path, '相等条件必须有有效比较值。');
  if (condition.operator==='in' && (!condition.values?.length || condition.values.some(value=>!['string','number','boolean'].includes(typeof value)))) issue(issues,'error','workflow-value-condition-invalid',path,'属于条件必须包含有效比较值。');
}

function validateWorkflow(workflow: WorkflowDefinition, config: ConfigPackageV3, issues: ConfigValidationIssue[]): void {
  for (const step of workflow.steps) for (const control of step.controls ?? []) {
    const path = `workflows/${workflow.id}/steps/${step.id}/controls/${control.id}`;
    for (const message of fieldImportErrors(config,workflow,control)) issue(issues,'error','field-import-conflict',path,message);
    for (const field of control.group?.itemFields ?? []) for (const message of fieldImportErrors(config,workflow,field)) issue(issues,'error','field-import-conflict',`${path}/group/${field.key}`,message);
  }
  workflow = resolveWorkflowFields(config,workflow);
  const base = `workflows/${workflow.id}`;
  if(workflow.editor?.dedicated&&workflow.quickMapping!==false)issue(issues,'error','workflow-editor-dedicated-visible',base,'专供编辑工作流必须关闭便捷测绘。');
  if(workflow.editor?.enabled&&workflow.mode==='composed')try {testWorkflowEditConversion(config,workflow);}catch(error){issue(issues,'error','workflow-editor-conversion-invalid',base,error instanceof Error?error.message:'编辑资格或回填失败。');}
  if(config.contractRevision<9&&(workflow.editor||workflow.quickMapping!==undefined||workflow.external?.purpose))issue(issues,'error','workflow-editor-r9-required',base,'工作流编辑用途需要 r9。');
  if(config.contractRevision>=9)for(const step of workflow.steps)for(const control of step.controls??[])if([control,...(control.group?.itemFields??[])].some(item=>item.fieldSource))issue(issues,'error','live-field-source-forbidden',base,'r9 预填不保留来源关系，请迁移展开旧控件。');
  try { workflowOutputAssemblyOrder(workflow); } catch (error) { issue(issues, 'error', 'workflow-output-dependency-invalid', base, error instanceof Error ? error.message : '输出依赖无效。'); }
  const checkIds = (items: Array<{ id: string }>, kind: string) => {
    const ids = new Set<string>();
    for (const item of items ?? []) { if (!item.id?.trim() || ids.has(item.id)) issue(issues, 'error', 'workflow-id-invalid', base, `${kind}标识必须存在且不能重复。`); ids.add(item.id); }
  };
  checkIds(workflow.steps, '页面'); checkIds(workflow.outputs, '输出'); checkIds(controlsFor(workflow), '控件');
  if (workflow.mode === 'external') {
    if(workflow.external?.purpose==='edit') {
      for(const message of validateExternalEditBinding(workflow))issue(issues,'error','external-editor-invalid',base,message);
      const scope=workflow.editor?.scope??workflow.target;
      if(!scope||!hasCategoryNode(config,scope))issue(issues,'error','external-editor-scope-invalid',base,'外部编辑分类范围不存在。');
      else for(const node of config.nodes.filter(n=>pathMatchesScope(n.path,scope))) {
        const fields=resolveSelectableFields(config,node.path);
        for(const [key,type]of [['Name','string'],['Interaction','string'],['Situation','string'],['Trade','json'],['elevation','number'],['tags.Land','string'],['tags.UAdm','string'],['tags.UAdmG','string'],['extensions.link.wiki','string'],['extensions.character.brief','string']]) {
          const field=fields.find(f=>f.key===key);
          if(!field&&!key.includes('.')||field&&(field.cardinality!=='single'||field.type!==type&&!(type==='string'&&field.type==='reference')))issue(issues,'error','external-editor-field-contract-conflict',base,`TRP 编辑成品需要 ${classificationPathKey(node.path)} 的 ${key} 为单值 ${type} 字段。`);
        }
        if(!hasDescendants(config,node.path)&&!resolveGeometryProfile(config,node.path,'Point')?.enabled)issue(issues,'error','external-editor-geometry-conflict',base,`TRP 编辑范围 ${classificationPathKey(node.path)} 未启用点几何。`);
      }
      return;
    }
    if(workflow.editor?.enabled)issue(issues,'error','external-capture-editor-forbidden',base,'外部采集方案不能充当编辑器，请选择独立编辑成品。');
    if(workflow.external?.purpose!==undefined&&workflow.external.purpose!=='capture')issue(issues,'error','external-purpose-invalid',base,'外部用途无效。');
    const allowedComponents = { 'railway-integrated': 'railwayWorkflow', 'station-integrated': 'stationWorkflow', 'trp-integrated': 'tradePointWorkflow' } as const;
    if (!workflow.external?.componentKey || !EXTERNAL_WORKFLOW_REASONS.has(workflow.external.reason) || allowedComponents[workflow.external.reason as keyof typeof allowedComponents] !== workflow.external.componentKey || workflow.steps.length || workflow.outputs.length || !workflow.external.coveredClassifications?.length) issue(issues, 'error', 'external-workflow-invalid', base, '外部整体工作流必须是铁路一体、车站一体或 TRP 一体的受控成品，且必须声明受控分类。');
    return;
  }
  if (!workflow.outputs.length) issue(issues, 'error', 'workflow-output-required', base, '组合式工作流至少需要一个输出分类。');
  const actorIndex = workflow.steps.findIndex((step) => step.kind === 'actor');
  const tailIndex = workflow.steps.findIndex((step) => step.kind === 'tagsExtensions');
  const geometryIndexes = workflow.steps.map((step, index) => step.kind === 'geometry' ? index : -1).filter((index) => index >= 0);
  const formIndexes = workflow.steps.map((step, index) => step.kind === 'form' ? index : -1).filter((index) => index >= 0);
  if (actorIndex !== 0) issue(issues, 'error', 'workflow-actor-must-be-first', base, '填写人页必须且只能位于工作流第一步。');
  if (!formIndexes.length) issue(issues, 'error', 'workflow-form-page-required', base, '工作流至少需要一个基本信息填卡页。');
  if (!geometryIndexes.length || geometryIndexes[geometryIndexes.length - 1] !== workflow.steps.length - 1) issue(issues, 'error', 'workflow-geometry-must-be-last', base, '最后一步必须是任一绘制页。');
  if (config.contractRevision<8 && (tailIndex < 0 || !geometryIndexes.length || tailIndex !== geometryIndexes[0] - 1)) issue(issues, 'error', 'workflow-tail-before-geometry-required', base, 'tags/extensions 尾部区必须紧邻第一张绘制页。');
  if (formIndexes.some((index) => index <= actorIndex || (geometryIndexes.length && index >= geometryIndexes[0]))) issue(issues, 'error', 'workflow-form-page-order-invalid', base, '基本信息页必须位于填写人和 tags/extensions 尾部区之间。');
  if (workflow.steps.filter(step=>step.kind==='geometry'&&step.geometryRole!=='auxiliary').length !== workflow.outputs.length) issue(issues, 'error', 'workflow-geometry-output-count-invalid', base, '每个工作流输出必须有且只有一个尾部绘制页。');
  const geometryOutputIds = workflow.steps.filter((step) => step.kind === 'geometry' && step.geometryRole!=='auxiliary').map((step) => step.outputId);
  if (new Set(geometryOutputIds).size !== workflow.outputs.length || workflow.outputs.some((output) => !geometryOutputIds.includes(output.id))) issue(issues, 'error', 'workflow-geometry-output-binding-invalid', base, '绘制页必须逐一绑定对应工作流输出。');

  const slots = new Set<string>();
  const controlList = controlsFor(workflow);
  if(config.contractRevision>=8){
    const modules=controlList.filter(control=>control.kind==='tagsExtensions');
    if(tailIndex>=0||modules.length!==1||!modules[0]?.systemManaged||workflow.steps.some(step=>step.kind!=='form'&&step.controls?.some(control=>control.kind==='tagsExtensions')))issue(issues,'error','workflow-inline-annotations-required',base,'必须在信息收集页保留一个不可删除、可移动的标签与扩展固定单元。');
  }
  const allTokens = new Set([...controlList.flatMap(control => control.slot ? [control.slot] : []), ...workflowDerivedPointTokens(workflow), ...WORKFLOW_SYSTEM_TOKENS, ...workflow.outputs.flatMap((_, index) => WORKFLOW_SYSTEM_TOKENS.map(token => `${token}_${index + 1}`))]);
  const captured = workflowCaptureSlots(workflow);
  const derivedTokens = workflowDerivedPointTokens(workflow);
  for (const token of derivedTokens) if (!/^[A-Z][A-Z0-9_]*$/.test(token) || controlList.some(control => control.slot === token) || derivedTokens.filter(item => item === token).length > 1 || WORKFLOW_SYSTEM_TOKENS.some(system => token === system || new RegExp(`^${system}_\\d+$`).test(token))) issue(issues, 'error', 'workflow-capture-slot-invalid', base, `坐标槽位 ${token} 无效、重复或占用系统 token。`);
  if (config.contractRevision === 5 && captured.length) issue(issues, 'error', 'workflow-capture-revision-invalid', base, '坐标槽位要求原生 r6。');
  const earlierTokens=new Set<string>(['World','Creator']);
  for(const step of workflow.steps) {
    if(step.kind==='geometry') {
      const path=`${base}/steps/${step.id}`;
      validateWorkflowValueCondition(step.when,earlierTokens,path,issues);
      validateWorkflowValueCondition(workflow.outputs.find(output=>output.id===step.outputId)?.when,earlierTokens,path,issues);
      const drawing=step.drawing;
      if(step.geometryRole==='auxiliary'&&!drawing?.captureSlot)issue(issues,'error','workflow-extra-slot-required',path,'额外绘制必须定义返回槽位。');
      if(drawing?.heightSlot&&!controlsFor(workflow).some(control=>control.slot===drawing.heightSlot&&control.kind==='number'))issue(issues,'error','workflow-height-slot-invalid',path,'高度输入必须绑定已存在的数值槽位。');
      const expected=step.geometry?.[0]==='Point'?['coordP','pointObject']:step.geometry?.[0]==='LineString'?['coordL']:['coordG'];
      if(drawing?.returnFormat&&!expected.includes(drawing.returnFormat))issue(issues,'error','workflow-drawing-format-invalid',path,'返回格式与点/线/面类型不匹配。');
      if(drawing?.returnFormat==='pointObject'&&drawing.multiple)issue(issues,'error','workflow-drawing-format-invalid',path,'坐标对象只能选择单点。');
      for(const binding of drawing?.bindings??[]) {
        const output=workflow.outputs.find(output=>output.id===binding.outputId);
        const field=output&&resolveEffectiveFields(config,output.classification).find(field=>field.key===binding.target);
        if(!output||!isSafeWorkflowTarget(binding.target)||PROTECTED_WORKFLOW_TARGETS.has(binding.target.split('.')[0])||!field&&!/^(tags|extensions)\./.test(binding.target))issue(issues,'error','workflow-drawing-target-invalid',path,`绘制绑定 ${binding.target} 必须选择对应输出的有效字段。`);
        if(field&&binding.value==='geometry'&&(field.type!=='json'||field.coordinateFormat&&field.coordinateFormat!==drawing?.returnFormat))issue(issues,'error','workflow-drawing-target-format-invalid',path,'坐标返回格式与目标字段结构不一致。');
        if(field&&binding.value==='height'&&field.type!=='number')issue(issues,'error','workflow-drawing-target-format-invalid',path,'高度目标必须为数值字段。');
      }
      for(const slot of [drawing?.captureSlot,drawing?.pointSlot])if(slot)for(const token of [slot,`${slot}_X`,`${slot}_Y`,`${slot}_Z`,`${slot}_HEIGHT`])earlierTokens.add(token);
    }
    for(const control of step.controls??[])if(control.slot)earlierTokens.add(control.slot);
  }
  for (const step of workflow.steps) {
    if (step.drawing?.drawMode && step.drawing.drawMode !== ({ Point: 'point', LineString: 'polyline', Polygon: 'polygon' } as const)[step.geometry?.[0] ?? 'Point']) issue(issues, 'error', 'workflow-draw-mode-invalid', `${base}/steps/${step.id}`, '绘制模式必须与固定几何类型一致。');
    const ids = (step.drawing?.auxiliaryPoints ?? []).map(point => point.id);
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) issue(issues, 'error', 'workflow-auxiliary-id-invalid', `${base}/steps/${step.id}`, '辅助点标识必须存在且唯一。');
  }
  for (const step of workflow.steps) for (const point of step.drawing?.auxiliaryPoints ?? []) validateWorkflowValueCondition(point.when, allTokens, `${base}/steps/${step.id}/drawing/${point.id}`, issues);
  const validateOptions = (control: Pick<WorkflowControl, 'kind' | 'options'>, path: string) => {
    if (control.kind !== 'select') return;
    const options = 'optionSource' in control ? resolveWorkflowSelectOptions(config, control as WorkflowControl) : control.options ?? [];
    const values = options.map((option) => option.value);
    const normalized = values.map(value=>('optionValueType' in control&&control.optionValueType==='number')?String(Number(value)):value);
    const typed=control as Pick<WorkflowControl,'optionValueType'>;
    if(typed.optionValueType==='number'&&values.some(value=>!Number.isFinite(Number(value)))||typed.optionValueType==='boolean'&&values.some(value=>!['true','false'].includes(value)))issue(issues,'error','workflow-option-value-type-invalid',path,'下拉选项保存值与数字/布尔类型不符。');
    if (!values.length || values.some((value) => !value.trim()) || new Set(normalized).size !== values.length) issue(issues, 'error', 'workflow-select-options-invalid', path, '下拉选项必须具有非空且唯一的保存值。');
  };
  for (const step of workflow.steps) for (const control of step.controls ?? []) {
    const controlPath = `${base}/steps/${step.id}/controls/${control.id}`;
    validateWorkflowValueCondition(control.when, allTokens, controlPath, issues);
    for (const condition of control.requiredWhen ?? []) validateWorkflowValueCondition(condition,allTokens,controlPath,issues);
    if (['notice', 'runtimeValue', 'component'].includes(control.kind)) issue(issues, 'error', 'workflow-control-kind-not-composed', controlPath, '组合式工作流只允许标准表单控件；专有流程应切换为外部整体工作流。');
    if (control.slot) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(control.slot) || slots.has(control.slot) || WORKFLOW_SYSTEM_TOKENS.some(token => control.slot === token || new RegExp(`^${token}_\\d+$`).test(control.slot!))) issue(issues, 'error', 'workflow-slot-invalid', controlPath, `输出槽位 ${control.slot} 无效、重复或与系统 token 冲突。`);
      slots.add(control.slot);
    }
    else if (!control.systemManaged) issue(issues, 'error', 'workflow-slot-required', controlPath, '表单输入必须声明输出槽位。');
    validateOptions(control, controlPath);
    if (control.rows !== undefined && (!Number.isInteger(control.rows) || control.rows < 1)) issue(issues, 'error', 'workflow-control-rows-invalid', controlPath, '输入行数必须为正整数。');
    if (control.defaultValue !== undefined) {
      if (control.kind === 'number' && !Number.isFinite(Number(control.defaultValue)) || control.kind === 'toggle' && typeof control.defaultValue !== 'boolean' || control.kind === 'select' && !resolveWorkflowSelectOptions(config, control).some(option => option.value === String(control.defaultValue))) issue(issues, 'error', 'workflow-default-invalid', controlPath, '默认值与输入类型/选项不一致。');
      if (control.kind === 'json') try { if (typeof control.defaultValue === 'string') JSON.parse(control.defaultValue); } catch { issue(issues, 'error', 'workflow-default-invalid', controlPath, '默认值必须为有效 JSON。'); }
    }
    if (control.kind === 'featureSearch' || control.kind === 'coarseSearch') validateSearch(control, config, controlPath, issues);
    if (control.kind === 'classificationPicker') {
      if (!control.outputId || !workflow.outputs.some((output) => output.id === control.outputId)) issue(issues, 'error', 'workflow-classification-output-invalid', controlPath, '系统 Classification 控件必须精确绑定一个工作流输出。');
      if (!control.classificationScope || !isContinuousPath(control.classificationScope) || !hasCategoryNode(config, control.classificationScope)) issue(issues, 'error', 'workflow-classification-scope-invalid', controlPath, '系统 Classification 控件必须选择有效的分类范围。');
    }
    if (control.kind === 'group') {
      const group = control.group;
      if (!group || !group.itemFields.length) {
        issue(issues, 'error', 'workflow-repeat-group-invalid', controlPath, '重复字段组必须至少定义一个项目字段。');
        continue;
      }
      const keys = new Set<string>();
      if (group.storage !== undefined && !['object', 'scalar'].includes(group.storage)) issue(issues, 'error', 'workflow-repeat-group-storage-invalid', controlPath, '重复字段组保存形式无效。');
      if (group.storage === 'scalar' && group.itemFields.length !== 1) issue(issues, 'error', 'workflow-repeat-group-scalar-shape-invalid', controlPath, '纯值数组必须且只能定义一个组字段。');
      for (const field of group.itemFields) {
        const fieldPath = `${controlPath}/group/${field.key}`;
        if (group.storage === 'scalar' ? field.key.trim() !== '' : !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.key) || keys.has(field.key)) issue(issues, 'error', 'workflow-repeat-group-field-invalid', fieldPath, group.storage === 'scalar' ? '纯值数组的唯一组字段必须留空保存键。' : '重复字段组字段名必须以字母开头且不能重复。');
        keys.add(field.key);
        validateOptions(field, fieldPath);
        if (field.kind === 'featureSearch' || field.kind === 'coarseSearch') validateSearch(field, config, fieldPath, issues);
      }
      if (group.minItems !== undefined && (!Number.isInteger(group.minItems) || group.minItems < 0)) issue(issues, 'error', 'workflow-repeat-group-min-items-invalid', controlPath, '重复字段组的最小项目数必须是非负整数。');
    }
  };
  for (const [outputIndex, output] of workflow.outputs.entries()) {
    const managed = controlList.filter((control) => control.kind === 'classificationPicker' && control.systemManaged && (control.outputId === output.id || (!control.outputId && control.classificationScope && classificationPathKey(control.classificationScope) === classificationPathKey(output.classification))));
    if (targetSupportsClassificationPicker(config, output.classification) !== Boolean(managed.length)) issue(issues, 'error', 'workflow-classification-picker-stale', `${base}/outputs/${output.id}`, '工作流输出分类的子分类状态已变化；请打开工作流以刷新系统 Classification 控件。');
    validateWorkflowOutput(output, outputIndex, workflow, config, slots, issues);
  }
}

/** Standalone workflow workbench validation. It deliberately validates only
 * the drafted workflow while still resolving fields/classes from the current
 * package, so save/import has a real read -> validate -> save lifecycle. */
export function validateWorkflowDefinition(workflow: WorkflowDefinition, config: ConfigPackageV3): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = [];
  validateWorkflow(workflow, config, issues);
  return {
    schemaVersion: 'cairnmap.config-validation-report.v3',
    valid: !issues.some((item) => item.severity === 'error'),
    createdAt: new Date().toISOString(),
    issues,
    summary: { configuration: issues.length, parity: 0, mountedData: 0, affectedFeatures: 0 },
  };
}

function conditionMatches(record: MountedFeatureRecord, conditions: Condition[] | undefined): boolean {
  if (!conditions?.length) return true;
  return conditions.every((condition) => {
    if (condition.kind === 'always' || condition.kind === 'zoomRange' || condition.kind === 'bboxArea') return true;
    const value = String(record[condition.field] ?? '').trim();
    if (condition.kind === 'fieldEquals') return value === condition.value;
    if (condition.kind === 'fieldIn') return condition.values.includes(value);
    return condition.present ? value.length > 0 : value.length === 0;
  });
}

function recordId(record: MountedFeatureRecord, index: number): string { return String(record.ID ?? `${String(record.World ?? 'unknown-world')}/${String(record.Class ?? 'unknown-class')}/${index}`); }
function recordName(record: MountedFeatureRecord): string { return String(record.Name ?? record.ID ?? '未命名要素'); }

/** Existing mounted V1 data is checked only for rules explicitly opted into. */
function aggregateMountedIssues(records: MountedFeatureRecord[], config: ConfigPackageV3): ConfigValidationIssue[] {
  const grouped = new Map<string, ConfigValidationIssue>();
  records.forEach((record, index) => {
    const path: ClassificationPath = { class: String(record.Class ?? ''), ...(record.Kind ? { kind: String(record.Kind) } : {}), ...((record.Skind ?? record.SKind) ? { skind: String(record.Skind ?? record.SKind) } : {}), ...((record.Skind2 ?? record.SKind2) ? { skind2: String(record.Skind2 ?? record.SKind2) } : {}) };
    for (const field of resolveEffectiveFields(config, path).filter((item) => item.required && item.validateExistingData && conditionMatches(record, item.requiredWhen))) {
      if (record[field.key] !== null && record[field.key] !== undefined && record[field.key] !== '') continue;
      const key = `mounted-data-required-field-missing|${field.key}|${classificationPathKey(path)}`;
      const prior = grouped.get(key) ?? { severity: 'error' as const, code: 'mounted-data-required-field-missing', path: `mounted/${classificationPathKey(path)}/${field.key}`, field: field.key, expected: 'required', message: `缺少必填字段 ${field.key}（${classificationPathKey(path)}）。`, affectedFeatures: [], count: 0 };
      prior.affectedFeatures?.push({ id: recordId(record, index), name: recordName(record) });
      prior.count = (prior.count ?? 0) + 1;
      grouped.set(key, prior);
    }
  });
  return [...grouped.values()].map((entry) => {
    const unique = new Map<string, AffectedFeature>();
    entry.affectedFeatures?.forEach((feature) => unique.set(feature.id, feature));
    return { ...entry, affectedFeatures: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  });
}

function validateInteractionShape(visual: import('./types').InteractionVisual, path: string, issues: ConfigValidationIssue[]): void {
  if (typeof visual.enabled !== 'boolean' || !visual.strokeColor?.trim() || !Number.isFinite(visual.strokeWidth) || visual.strokeWidth < 0 || !Number.isFinite(visual.strokeOpacity) || visual.strokeOpacity < 0 || visual.strokeOpacity > 1 || visual.fillOpacity !== undefined && (!Number.isFinite(visual.fillOpacity) || visual.fillOpacity < 0 || visual.fillOpacity > 1)) issue(issues, 'error', 'interaction-visual-invalid', path, '交互颜色、线宽和透明度无效。');
  if (visual.symbol && (!['circle','pin'].includes(visual.symbol.kind) || visual.symbol.radius !== undefined && (!Number.isFinite(visual.symbol.radius) || visual.symbol.radius <= 0) || visual.symbol.size?.some(value => !Number.isFinite(value) || value <= 0))) issue(issues, 'error', 'interaction-symbol-invalid', path, '交互符号类型、半径和尺寸无效。');
  if (visual.outline && (!visual.outline.color?.trim() || !Number.isFinite(visual.outline.width) || visual.outline.width < 0 || !Number.isFinite(visual.outline.opacity) || visual.outline.opacity < 0 || visual.outline.opacity > 1)) issue(issues, 'error', 'interaction-outline-invalid', path, '外描边参数无效。');
  if (visual.dashArray && !/^\d+(?:\.\d+)?(?:[ ,]+\d+(?:\.\d+)?)*$/.test(visual.dashArray)) issue(issues, 'error', 'interaction-dash-invalid', path, '虚线必须为非负数字序列。');
}

function validateEngine(config: ConfigPackageV3, issues: ConfigValidationIssue[]): void {
  const engine = config.engine;
  if (!engine) {
    issue(issues, 'error', 'engine-settings-required', 'engine', 'V3.2 原生配置必须提供包级引擎设置。');
    return;
  }
  if (engine.world.field !== 'World' || engine.world.assignment !== 'activeWorld' || engine.world.required !== true) issue(issues, 'error', 'world-system-field-invalid', 'engine/world', 'World 必须是由当前世界自动赋值的必填系统字段。');
  const contextView = engine.contextView;
  if (!contextView
    || !Number.isFinite(contextView.minZoom)
    || contextView.minZoom < 0
    || contextView.minZoom > 8
    || !Number.isFinite(contextView.activationRadiusPx)
    || contextView.activationRadiusPx < 0
    || !Number.isFinite(contextView.retainRadiusPx)
    || contextView.retainRadiusPx < contextView.activationRadiusPx) {
    issue(issues, 'error', 'context-view-default-invalid', 'engine/contextView', '包含关系视角必须提供 0–8 的进入 Zoom，以及不小于进入半径的保持半径。');
  }
  for (const [key, value] of Object.entries(engine.screenGateDefaults)) {
    if (value !== undefined && (!Number.isFinite(value) || Number(value) < 0)) issue(issues, 'error', 'screen-gate-default-invalid', `engine/screenGateDefaults/${key}`, '全局屏幕阈值必须是非负数。');
  }
  for (const [key,value] of Object.entries(engine.paneDefaults)) if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value)) issue(issues, 'error', 'pane-name-invalid', `engine/paneDefaults/${key}`, 'Pane 名称只能使用字母、数字、下划线或连字符。');
  for (const geometry of GEOMETRIES) {
    const baseline = engine.interactionBaselines[geometry];
    const baselinePath = `engine/interactionBaselines/${geometry}`;
    if (!baseline || !Number.isFinite(baseline.hitTolerancePx) || baseline.hitTolerancePx < 0 || baseline.hitTolerancePx > 80) {
      issue(issues, 'error', 'interaction-baseline-invalid', baselinePath, '点、线、面都必须有有效的统一交互基准和点击容差。');
      continue;
    }
    for (const state of ['hover', 'selected', 'searchResult', 'editing', 'deletionMarked'] as const) {
      const visual = baseline[state];
      const path = `${baselinePath}/${state}`;
      if (visual) validateInteractionShape(visual, path, issues);
      if (!visual || typeof visual.enabled !== 'boolean' || !String(visual.strokeColor ?? '').trim() || !Number.isFinite(visual.strokeWidth) || visual.strokeWidth < 0 || !Number.isFinite(visual.strokeOpacity) || visual.strokeOpacity < 0 || visual.strokeOpacity > 1) {
        issue(issues, 'error', 'interaction-visual-invalid', path, '交互视觉必须包含启用状态、描边颜色、非负描边粗细和 0–1 描边透明度。');
      }
      if (visual.fillOpacity !== undefined && (!Number.isFinite(visual.fillOpacity) || visual.fillOpacity < 0 || visual.fillOpacity > 1)) issue(issues, 'error', 'interaction-fill-opacity-invalid', path, '交互填色透明度必须在 0 到 1 之间。');
      if (visual.zIndexOffset !== undefined && !Number.isFinite(visual.zIndexOffset)) issue(issues, 'error', 'interaction-zindex-invalid', path, '交互 zIndex 偏移必须是有效数字。');
      if (visual.labelPriority !== undefined && !Number.isFinite(visual.labelPriority)) issue(issues, 'error', 'interaction-label-priority-invalid', path, '交互 Label 优先级必须是有效数字。');
    }
  }
}

function endpointFields(config: ConfigPackageV3, endpoint: ContextBinding['host']): Set<string> {
  return new Set(resolveSelectableFields(config, endpoint.classification).map((field) => field.key));
}

function validateContextBindings(config: ConfigPackageV3, issues: ConfigValidationIssue[]): void {
  const bindings = config.contextBindings ?? [];
  const ids = new Set<string>();
  const seenPairs = new Set<string>();
  const edges = new Map<string, Set<string>>();
  for (const binding of bindings) {
    const base = `contextBindings/${binding.id || 'unknown'}`;
    // Disabled relations are drafts only: they have no runtime effect and do
    // not block saving another category while their endpoints are unfinished.
    if (!binding.enabled) continue;
    if (!binding.id || ids.has(binding.id)) issue(issues, 'error', 'context-binding-id-invalid', base, '上下文绑定必须具有唯一 ID。');
    ids.add(binding.id);
    if (!binding.label.zh.trim()) issue(issues, 'error', 'context-binding-label-required', base, '上下文绑定必须提供中文名称。');
    for (const [side, endpoint] of [['host', binding.host], ['member', binding.member]] as const) {
      if (!endpoint || !isContinuousPath(endpoint.classification) || !hasCategoryNode(config, endpoint.classification)) {
        issue(issues, 'error', 'context-binding-classification-invalid', `${base}/${side}`, '上下文绑定必须选择存在且连续的分类。');
        continue;
      }
      const fields = endpointFields(config, endpoint);
      if (!endpoint.referenceField || !fields.has(endpoint.referenceField)) issue(issues, 'error', 'context-binding-reference-field-invalid', `${base}/${side}`, '上下文绑定的引用字段必须是该分类的有效字段。', { field: endpoint.referenceField });
    }
    const hostKey = classificationPathKey(binding.host?.classification ?? { class: '' });
    const memberKey = classificationPathKey(binding.member?.classification ?? { class: '' });
    if (hostKey && hostKey === memberKey) issue(issues, 'error', 'context-binding-self-reference-invalid', base, '主结构和附属结构不能是同一分类。');
    const pair = `${hostKey}|${binding.host?.referenceField ?? ''}|${memberKey}|${binding.member?.referenceField ?? ''}`;
    if (seenPairs.has(pair)) issue(issues, 'error', 'context-binding-duplicate', base, '同一上下文关系不能重复保存。');
    seenPairs.add(pair);
    if (binding.memberSelectorField && binding.member && hasCategoryNode(config, binding.member.classification)) {
      const memberFields = endpointFields(config, binding.member);
      if (!memberFields.has(binding.memberSelectorField)) issue(issues, 'error', 'context-binding-selector-field-invalid', base, '单元/楼层选择字段必须属于附属结构分类。', { field: binding.memberSelectorField });
    }
    if (hostKey && memberKey) {
      const next = edges.get(hostKey) ?? new Set<string>();
      next.add(memberKey);
      edges.set(hostKey, next);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const target of edges.get(key) ?? []) if (visit(target)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  if ([...edges.keys()].some(visit)) issue(issues, 'error', 'context-binding-cycle-invalid', 'contextBindings', '上下文绑定不能形成主结构到附属结构的循环。');
}

export function validateConfigPackage(config: ConfigPackageV3, mountedRecords: MountedFeatureRecord[] = []): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = [];
  const structure = validateNativeStructure(config);
  if (structure.length) return { schemaVersion: 'cairnmap.config-validation-report.v3', valid: false, createdAt: new Date().toISOString(), issues: structure.map(item => ({ severity: 'error', code: 'native-contract-structure-invalid', ...item })) };
  if (config.contractRevision>=8 && (config.registries.optionSets || config.nodes.some(node=>node.fields.some(field=>field.optionSource)) || config.workflows.some(workflow=>controlsFor(workflow).some(control=>control.optionSource)))) issue(issues,'error','legacy-option-source-forbidden','registries','r8 使用字段内对照；旧全局选项来源必须先迁移。');
  if (config.schemaVersion !== 'cairnmap.config-package.v3') issue(issues, 'error', 'schema-version-invalid', 'manifest', '配置包不是 cairnmap.config-package.v3。');
  if (!isNativeConfigRevision(config.contractRevision)) issue(issues, 'error', 'contract-revision-invalid', 'manifest', '配置包必须使用 V3.2 原生契约 revision 5/6。');
  validateEngine(config, issues);
  if (!/^[a-z][a-z0-9-]{2,80}$/.test(config.packageId)) issue(issues, 'error', 'package-id-invalid', 'manifest', '配置包 ID 格式无效。');
  if (!Number.isSafeInteger(config.revision) || config.revision < 1) issue(issues, 'error', 'revision-invalid', 'manifest', '包 revision 必须是正整数。');
  for (const [registryName, items] of Object.entries(config.registries)) {
    const ids = new Set<string>();
    for (const item of items ?? []) {
      if (!item.id || ids.has(item.id)) issue(issues, 'error', 'registry-id-invalid', `registries/${registryName}`, `${registryName} 中存在空或重复的注册表键。`);
      ids.add(item.id);
    }
  }
  const nodeIds = new Set<string>();
  const paths = new Set<string>();
  for (const node of config.nodes) {
    const base = `nodes/${node.nodeId}`;
    if(config.contractRevision>=9)for(const field of node.fields)if(field.defaultValue!==undefined||field.placeholder!==undefined)issue(issues,'error','field-input-setting-forbidden',base,'输入默认值和提示属于控件，不属于字段定义。');
    const parentScope = parentClassificationPath(node.path);
    const inheritedFields = parentScope ? resolveEffectiveFields(config, parentScope) : [];
    for (const field of node.fields) {
      if (inheritedFields.some(inherited => inherited.key === (field.overrideOf ?? field.key) && inherited.inheritance === 'sealed')) issue(issues, 'error', 'field-sealed-override', base, `字段 ${field.key} 已锁定继承，不能覆盖。`);
      if (field.optionSource && !config.registries.optionSets?.some(set => set.id === field.optionSource?.registryKey)) issue(issues, 'error', 'field-option-source-invalid', base, `字段 ${field.key} 的共享选项来源不存在。`);
      if (field.reference) {
        const target = { class: field.reference.classCode };
        if (!hasCategoryNode(config,target) || !resolveSelectableFields(config,target).some(candidate => candidate.key === field.reference?.matchField)) issue(issues, 'error', 'field-reference-invalid', base, `字段 ${field.key} 的引用分类或匹配字段无效。`);
      }
    }
    const pathKey = classificationPathKey(node.path);
    if (nodeIds.has(node.nodeId)) issue(issues, 'error', 'node-id-duplicate', base, '分类节点 ID 重复。');
    nodeIds.add(node.nodeId);
    if (!isContinuousPath(node.path)) issue(issues, 'error', 'classification-path-invalid', base, '分类路径必须从 Class 连续向下定义。');
    if (paths.has(pathKey)) issue(issues, 'error', 'classification-path-duplicate', base, '分类路径重复。');
    paths.add(pathKey);
    const parent = parentClassificationPath(node.path);
    if (parent && !hasCategoryNode(config, parent)) issue(issues, 'error', 'category-parent-missing', base, '子分类节点必须具有连续的父分类节点。');
    const keys = new Set<string>();
    node.fields.forEach((field, index) => validateField(field, `${base}/fields/${index}`, keys, issues));
    for (const geometry of GEOMETRIES) {
      const profile = node.geometryProfiles[geometry];
      if (config.contractRevision >= 7 && profile?.enabled && resolveCategoryNodes(config, node.path).some(ancestor => ancestor.nodeId !== node.nodeId && ancestor.geometryType && ancestor.geometryType !== geometry)) issue(issues, 'error', 'geometry-type-inheritance-invalid', `${base}/geometry/${geometry}`, '本级几何与祖先已指定的类型不一致。');
      if (profile) validateProfile(profile, geometry, `${base}/geometry/${geometry}`, config, node.path, issues);
      if (node.geometryType && geometry !== node.geometryType && profile?.enabled) issue(issues, 'error', 'geometry-type-multiple-enabled', `${base}/geometry/${geometry}`, '同一分类节点只能启用一种几何类型。');
    }
    if (node.geometryType && !node.geometryProfiles[node.geometryType]?.enabled) issue(issues, 'error', 'geometry-type-profile-missing', `${base}/geometry`, '已选择的几何类型必须具有启用的几何配置。');
    if (parent) {
      const parentNode = config.nodes.find((candidate) => classificationPathKey(candidate.path) === classificationPathKey(parent));
      if (parentNode?.geometryType && node.geometryType && parentNode.geometryType !== node.geometryType) issue(issues, 'error', 'geometry-type-inheritance-invalid', `${base}/geometry`, '父分类已指定几何类型时，子分类必须使用相同类型。');
    }
    if (node.containment?.enabled) {
      if (isNativeConfigRevision(config.contractRevision)) issue(issues, 'error', 'legacy-containment-forbidden', `${base}/containment`, 'V3.2 原生包必须将包含关系迁移到 contextBindings，不能使用节点内旧绑定。');
      if (!node.containment.role) issue(issues, 'error', 'containment-role-required', `${base}/containment`, '包含关系绑定已启用，但尚未选择主结构或附属结构。');
      const fields = new Set(resolveEffectiveFields(config, node.path).map((field) => field.key));
      if (node.containment.role === 'child' && (!node.containment.parentReferenceField || !fields.has(node.containment.parentReferenceField))) issue(issues, 'error', 'containment-parent-field-invalid', `${base}/containment`, '附属结构必须选择一个当前有效的主结构引用字段。');
      if (node.containment.role === 'parent' && node.containment.parentReferenceField && !fields.has(node.containment.parentReferenceField) && !SYSTEM_FIELD_KEYS.has(node.containment.parentReferenceField)) issue(issues, 'error', 'containment-optional-parent-field-invalid', `${base}/containment`, '主结构引用字段（可选）必须是当前有效字段。');
    }
    validateCard(node, config, issues);
  }
  for (const node of config.nodes) for (const childId of node.children) if (!nodeIds.has(childId)) issue(issues, 'error', 'category-child-missing', `nodes/${node.nodeId}/children`, `子分类节点 ${childId} 不存在。`);
  const workflowIds = new Set<string>();
  for (const workflow of config.workflows) {
    if (workflowIds.has(workflow.id)) issue(issues, 'error', 'workflow-id-duplicate', `workflows/${workflow.id}`, '工作流 ID 重复。');
    workflowIds.add(workflow.id);
    validateWorkflow(workflow, config, issues);
  }
  const editorScopes=new Set<string>();
  for(const workflow of config.workflows.filter(w=>w.editor?.enabled)){const scope=workflow.editor?.scope??workflow.outputs[0]?.classification??workflow.target;if(!scope){issue(issues,'error','workflow-editor-scope-required',`workflows/${workflow.id}`,'编辑工作流缺少作用范围。');continue;}const key=classificationPathKey(scope);if(editorScopes.has(key))issue(issues,'error','workflow-editor-route-duplicate',`workflows/${workflow.id}`,'同一分类范围存在多个编辑工作流。');editorScopes.add(key);}
  validateContextBindings(config, issues);
  for (const node of config.nodes) {
    const hasChildren = node.children.length > 0;
    if (!hasChildren && !resolveInheritedValue(config, node.path, 'display', (candidate) => candidate.geometryType)) issue(issues, 'error', 'leaf-geometry-type-required', `nodes/${node.nodeId}/geometry`, '总配置保存时，每个最终分类必须解析为一种明确几何类型。');
  }
  if (!config.parity) issue(issues, 'warning', 'v1-parity-report-pending', 'parity', 'V1 语义迁移尚未执行；当前仅可作为 V3 原生试验包。');
  else for (const entry of config.parity.entries.filter((item) => item.status === 'unsupported')) issue(issues, 'warning', 'v1-parity-unsupported-pending', `parity/${entry.kind}/${entry.id}`, `V1 配置 ${entry.id} 尚未迁移：${entry.details ?? '未说明原因'}。`);
  const mounted = aggregateMountedIssues(mountedRecords, config);
  issues.push(...mounted);
  const configuration = issues.filter((item) => !item.code.startsWith('mounted-') && !item.code.startsWith('v1-parity')).length;
  const parity = issues.filter((item) => item.code.startsWith('v1-parity')).length;
  return { schemaVersion: 'cairnmap.config-validation-report.v3', valid: !issues.some((item) => item.severity === 'error'), createdAt: new Date().toISOString(), issues, summary: { configuration, parity, mountedData: mounted.length, affectedFeatures: mounted.reduce((total, item) => total + (item.affectedFeatures?.length ?? 0), 0) } };
}

export function createBundledConfigPackage(): ConfigPackageV3 {
  return createBlankV32Package();
}
