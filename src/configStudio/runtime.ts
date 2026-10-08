import { isNativeConfigRevision } from './contract';
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
import { isSafeWorkflowTarget, parseWorkflowExpression, workflowExpressionTokens, WORKFLOW_SYSTEM_TOKENS } from './workflowExpression';
import { createBlankV32Package } from './v32Defaults';

const GEOMETRIES: GeometryKind[] = ['Point', 'LineString', 'Polygon'];
const SYSTEM_FIELD_KEYS = new Set([
  'ID', 'Name', 'World', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2',
  'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG',
]);
/** Name is a V1-configured field in several classes, even though it is also universally selectable. */
const PROTECTED_FIELD_KEYS = new Set([...SYSTEM_FIELD_KEYS].filter((key) => key !== 'Name'));
const EXTERNAL_WORKFLOW_REASONS = new Set(['railway-integrated', 'station-integrated', 'trp-integrated']);
const CARD_RENDERERS = new Set(['text', 'tag', 'colorCapsule', 'nameColorCapsule', 'relationLink', 'lineChips', 'media']);

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
  return config.nodes.filter((node) => nodeMatchesPath(node, path)).sort((a, b) => pathDepth(a.path) - pathDepth(b.path));
}

export function listCategoryPaths(config: ConfigPackageV3, scope: ClassificationPath = { class: '' }): ClassificationPath[] {
  return config.nodes.map((node) => node.path).filter((path) => pathMatchesScope(path, scope)).sort((a, b) => pathDepth(a) - pathDepth(b) || classificationPathKey(a).localeCompare(classificationPathKey(b)));
}

export function hasCategoryNode(config: ConfigPackageV3, path: ClassificationPath): boolean {
  return config.nodes.some((node) => classificationPathKey(node.path) === classificationPathKey(path));
}

export function hasDescendants(config: ConfigPackageV3, path: ClassificationPath): boolean {
  return config.nodes.some((node) => pathDepth(node.path) > pathDepth(path) && pathMatchesScope(node.path, path));
}

/**
 * Fields inherit only while every preceding node enables field propagation.
 * A child can always add a local field; an `overrideOf` replaces exactly one
 * inherited declaration and never mutates the parent node.
 */
export function resolveEffectiveFields(config: ConfigPackageV3, path: ClassificationPath): FieldDefinition[] {
  const values = new Map<string, FieldDefinition>();
  let inherited = true;
  for (const [index, node] of resolveCategoryNodes(config, path).entries()) {
    if (index > 0 && !inherited) values.clear();
    for (const field of node.fields) {
      const key = field.overrideOf || field.key;
      values.set(key, { ...field, key });
    }
    inherited = inheritanceControls(node).fields;
  }
  return [...values.values()];
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
  const concrete = config.nodes.filter((node) => pathMatchesScope(node.path, scope) && !hasDescendants(config, node.path));
  const candidates = concrete.length ? concrete : config.nodes.filter((node) => pathMatchesScope(node.path, scope));
  if (!candidates.length) return options.includeSystem === false ? [] : [...SYSTEM_FIELD_KEYS].map(systemFieldDefinition);
  const fieldSets = candidates.map((node) => new Map(resolveEffectiveFields(config, node.path).map((field) => [field.key, field])));
  const common = [...fieldSets[0].values()].filter((field) => fieldSets.every((set) => set.has(field.key)));
  if (options.includeSystem === false) return common;
  const custom = new Set(common.map((field) => field.key));
  return [...[...SYSTEM_FIELD_KEYS].filter((key) => !custom.has(key)).map(systemFieldDefinition), ...common];
}

/** Display/Card resolve independently and only propagate through their own switch. */
function resolveInheritedValue<T>(config: ConfigPackageV3, path: ClassificationPath, branch: 'display' | 'card', read: (node: CategoryNode) => T | undefined): T | undefined {
  let result: T | undefined;
  let inherited = true;
  for (const [index, node] of resolveCategoryNodes(config, path).entries()) {
    if (index > 0 && !inherited) result = undefined;
    const candidate = read(node);
    if (candidate !== undefined) result = candidate;
    inherited = inheritanceControls(node)[branch];
  }
  return result;
}

export function resolveGeometryProfile(config: ConfigPackageV3, path: ClassificationPath, geometry: GeometryKind): GeometryProfile | undefined {
  const selectedType = resolveInheritedValue(config, path, 'display', (node) => node.geometryType);
  if (selectedType && selectedType !== geometry) return undefined;
  return resolveInheritedValue(config, path, 'display', (node) => node.geometryProfiles[geometry]);
}

export function resolveCardConfiguration(config: ConfigPackageV3, path: ClassificationPath): CardConfiguration | undefined {
  return resolveInheritedValue(config, path, 'card', (node) => node.card);
}

export function resolveCardItems(config: ConfigPackageV3, path: ClassificationPath): CardItem[] {
  const card = resolveCardConfiguration(config, path);
  return card?.mode === 'fields' ? card.items : [];
}

export function resolveZoomRule(profile: GeometryProfile, zoom: number): ZoomPriorityRule | undefined {
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
  if (PROTECTED_FIELD_KEYS.has(field.key)) issue(issues, 'error', 'system-field-redefined', path, `系统字段 ${field.key} 不能在分类配置中重新定义。`, { field: field.key });
  if (known.has(field.key)) issue(issues, 'error', 'field-key-duplicate', path, `字段 ${field.key} 在同一分类节点中重复。`, { field: field.key });
  known.add(field.key);
  if (!field.labels.zh.trim()) issue(issues, 'error', 'field-label-zh-required', path, '字段必须提供中文标签。', { field: field.key });
  if (field.type === 'enum' && (!field.options?.length && !field.optionSource?.registryKey)) issue(issues, 'error', 'enum-options-required', path, '枚举字段必须提供静态选项或受控选项注册表。', { field: field.key });
  const optionValues = new Set<string>();
  for (const option of field.options ?? []) {
    if (!option.value.trim() || optionValues.has(option.value)) issue(issues, 'error', 'field-option-invalid', path, '下拉选项的存储值不能为空且不能重复。', { field: field.key });
    optionValues.add(option.value);
  }
  field.requiredWhen?.forEach((item, index) => validateCondition(item, `${path}/requiredWhen/${index}`, issues));
}

function validateRenderColorBinding(binding: unknown, config: ConfigPackageV3, sourcePath: ClassificationPath, path: string, issues: ConfigValidationIssue[]): void {
  if (!binding || typeof binding !== 'object') { issue(issues, 'error', 'render-color-binding-required', path, '渲染颜色必须设置为直接颜色、当前字段或外部要素字段。'); return; }
  const value = binding as { mode?: string; color?: string; field?: string; target?: ClassificationPath; targetIdField?: string; targetColorField?: string; strategy?: string };
  const sourceFields = new Set(resolveEffectiveFields(config, sourcePath).map((field) => field.key));
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
  const screen = extensions.screenGate;
  if (screen && screen.mode !== 'inherit' && screen.mode !== 'override') issue(issues, 'error', 'screen-gate-mode-invalid', rulePath, '屏幕阈值必须选择继承全局或本规则覆盖。');
  if (screen?.mode === 'override') {
    if (screen.minScreenAreaPx !== undefined && (!Number.isFinite(screen.minScreenAreaPx) || screen.minScreenAreaPx < 0)) issue(issues, 'error', 'screen-gate-area-invalid', rulePath, '屏幕面积阈值必须是非负数。');
    if (screen.minScreenLengthPx !== undefined && (!Number.isFinite(screen.minScreenLengthPx) || screen.minScreenLengthPx < 0)) issue(issues, 'error', 'screen-gate-length-invalid', rulePath, '屏幕长度阈值必须是非负数。');
    if (geometry !== 'Polygon' && screen.minScreenAreaPx !== undefined) issue(issues, 'warning', 'screen-gate-area-ignored', rulePath, '屏幕面积阈值只适用于面要素。');
    if (geometry !== 'LineString' && screen.minScreenLengthPx !== undefined) issue(issues, 'warning', 'screen-gate-length-ignored', rulePath, '屏幕长度阈值只适用于线要素。');
  }
  if (extensions.hitTolerancePx !== undefined && (!Number.isFinite(extensions.hitTolerancePx) || extensions.hitTolerancePx < 0 || extensions.hitTolerancePx > 80)) issue(issues, 'error', 'hit-tolerance-invalid', rulePath, '点击容差必须介于 0 到 80 像素。');
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
  if (!profile.zoomPriority.rules.length) issue(issues, 'error', 'render-rule-missing', path, '每种已启用几何至少需要一个渲染规则。');
  const intervals: Array<{ id: string; min: number; max: number }> = [];
  for (const [index, rule] of profile.zoomPriority.rules.entries()) {
    const rulePath = `${path}/renderRules/${rule.id || index + 1}`;
    const min = rule.minZoom;
    const max = rule.maxZoom;
    if (!rule.representation) issue(issues, 'error', 'render-representation-required', rulePath, '渲染规则必须选择显示种类。');
    else if (!['hidden', 'geometry', 'point', 'labelOnly'].includes(rule.representation)) issue(issues, 'error', 'render-representation-invalid', rulePath, '未知显示种类。');
    if (rule.representation === 'labelOnly' && config.contractRevision !== 6) issue(issues, 'error', 'render-contract-capability-invalid', rulePath, '仅标签显示需要原生契约 revision 6。');
    if (min !== undefined && max !== undefined && min > max) issue(issues, 'error', 'zoom-interval-invalid', rulePath, '显示区间必须符合下界 ≤ Zoom ≤ 上界。');
    intervals.push({ id: rule.id, min: min ?? -Infinity, max: max ?? Infinity });
    const stack = rule.geometryStack;
    if (!stack || !Number.isInteger(stack.zLevel) || stack.zLevel < 0 || stack.zLevel > 9999) issue(issues, 'error', 'geometry-zlevel-invalid', rulePath, '每个渲染规则的几何 zLevel 必须是 0 到 9999 之间的整数。');
    const style = rule.style;
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
    validateRuleExtensions(rule, geometry, rulePath, config, sourcePath, issues);
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
    if (index === 0 && !rule.id) issue(issues, 'error', 'render-rule-id-required', rulePath, '渲染规则必须具有 ID。');
  }
  for (let left = 0; left < intervals.length; left += 1) for (let right = left + 1; right < intervals.length; right += 1) {
    const a = intervals[left]; const b = intervals[right];
    if (a.min <= b.max && b.min <= a.max) issue(issues, 'error', 'render-zoom-interval-overlap', path, `渲染规则 ${a.id} 与 ${b.id} 的闭区间重叠。`);
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
  for (const item of card.items) {
    const itemPath = `${path}/items/${item.id}`;
    if (!CARD_RENDERERS.has(item.renderer)) issue(issues, 'error', 'card-renderer-invalid', itemPath, `未知的信息卡显示器 ${String(item.renderer)}。`);
    if (item.section !== undefined && item.section !== 'main' && item.section !== 'other') issue(issues, 'error', 'card-section-invalid', itemPath, '信息卡区域只能为主要信息或其他信息。');
    if (!sourceExists(item.source, fields)) issue(issues, 'error', 'card-field-missing', itemPath, `信息卡字段 ${item.source} 未定义。`, { field: item.source });
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
  if (!Number.isInteger(search.minQueryLength) || Number(search.minQueryLength) < 0 || !Number.isInteger(search.maxResults) || Number(search.maxResults) < 1) issue(issues, 'error', 'workflow-search-options-invalid', path, '搜索必须配置有效的最短输入长度和结果上限。');
}

function targetSupportsClassificationPicker(config: ConfigPackageV3, target: ClassificationPath): boolean {
  return hasDescendants(config, target);
}

export function validateWorkflowOutput(output: WorkflowOutput, _outputIndex: number, workflow: WorkflowDefinition, config: ConfigPackageV3, slots: Set<string>, issues: ConfigValidationIssue[]): void {
  const base = `workflows/${workflow.id}/outputs/${output.id}`;
  if (!isContinuousPath(output.classification) || !hasCategoryNode(config, output.classification)) issue(issues, 'error', 'workflow-output-classification-invalid', base, '工作流输出必须选择存在且连续的目标分类。');
  if (!output.geometry.selected) issue(issues, 'error', 'workflow-output-geometry-required', base, '每个工作流输出必须选择固定绘制类型。');
  else if (!resolveGeometryProfile(config, output.classification, output.geometry.selected)?.enabled) issue(issues, 'error', 'workflow-output-geometry-disabled', base, `输出分类没有启用 ${output.geometry.selected} 绘制类型。`);
  const fields = new Set(resolveEffectiveFields(config, output.classification).map((field) => field.key));
  const tokens = new Set([...WORKFLOW_SYSTEM_TOKENS, ...workflow.outputs.flatMap((_, index) => WORKFLOW_SYSTEM_TOKENS.map((item) => `${item}_${index + 1}`)), ...slots]);
  const assignmentIds = new Set<string>();
  for (const assignment of output.assignments) {
    const assignmentPath = `${base}/assignments/${assignment.id}`;
    if (!assignment.target.trim() || !assignment.expression.trim()) issue(issues, 'error', 'workflow-assignment-invalid', assignmentPath, '字段组装必须同时指定目标和表达式。');
    if (!isSafeWorkflowTarget(assignment.target) || (!fields.has(assignment.target) && !/^tags\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(assignment.target) && !/^extensions\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(assignment.target) && !SYSTEM_FIELD_KEYS.has(assignment.target))) issue(issues, 'error', 'workflow-assignment-target-invalid', assignmentPath, `字段组装目标 ${assignment.target} 不是有效字段、tags 或 extensions 路径。`);
    if (!assignment.id || assignmentIds.has(assignment.id)) issue(issues, 'error', 'workflow-assignment-id-invalid', assignmentPath, '组装行标识必须存在且不能重复。');
    assignmentIds.add(assignment.id);
    try {
      for (const token of workflowExpressionTokens(parseWorkflowExpression(assignment.expression))) if (!tokens.has(token)) issue(issues, 'error', 'workflow-assignment-slot-missing', assignmentPath, `字段组装引用了不存在的输入槽位或系统字段 ${token}。`);
    } catch (error) { issue(issues, 'error', 'workflow-assignment-expression-invalid', assignmentPath, error instanceof Error ? error.message : '组装表达式无效。'); }
  }
}

function validateWorkflow(workflow: WorkflowDefinition, config: ConfigPackageV3, issues: ConfigValidationIssue[]): void {
  const base = `workflows/${workflow.id}`;
  const checkIds = (items: Array<{ id: string }>, kind: string) => {
    const ids = new Set<string>();
    for (const item of items) { if (!item.id?.trim() || ids.has(item.id)) issue(issues, 'error', 'workflow-id-invalid', base, `${kind}标识必须存在且不能重复。`); ids.add(item.id); }
  };
  checkIds(workflow.steps, '页面'); checkIds(workflow.outputs, '输出'); checkIds(controlsFor(workflow), '控件');
  if (workflow.mode === 'external') {
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
  if (tailIndex < 0 || !geometryIndexes.length || tailIndex !== geometryIndexes[0] - 1) issue(issues, 'error', 'workflow-tail-before-geometry-required', base, 'tags/extensions 尾部区必须紧邻第一张绘制页。');
  if (formIndexes.some((index) => index <= actorIndex || (tailIndex >= 0 && index >= tailIndex))) issue(issues, 'error', 'workflow-form-page-order-invalid', base, '基本信息页必须位于填写人和 tags/extensions 尾部区之间。');
  if (geometryIndexes.length !== workflow.outputs.length) issue(issues, 'error', 'workflow-geometry-output-count-invalid', base, '每个工作流输出必须有且只有一个尾部绘制页。');
  const geometryOutputIds = workflow.steps.filter((step) => step.kind === 'geometry').map((step) => step.outputId);
  if (new Set(geometryOutputIds).size !== workflow.outputs.length || workflow.outputs.some((output) => !geometryOutputIds.includes(output.id))) issue(issues, 'error', 'workflow-geometry-output-binding-invalid', base, '绘制页必须逐一绑定对应工作流输出。');

  const slots = new Set<string>();
  const controlList = controlsFor(workflow);
  const validateOptions = (control: Pick<WorkflowControl, 'kind' | 'options'>, path: string) => {
    if (control.kind !== 'select') return;
    const values = (control.options ?? []).map((option) => option.value);
    if (!values.length || values.some((value) => !value.trim()) || new Set(values).size !== values.length) issue(issues, 'error', 'workflow-select-options-invalid', path, '下拉选项必须具有非空且唯一的保存值。');
  };
  for (const step of workflow.steps) for (const control of step.controls ?? []) {
    const controlPath = `${base}/steps/${step.id}/controls/${control.id}`;
    if (['notice', 'runtimeValue', 'component'].includes(control.kind)) issue(issues, 'error', 'workflow-control-kind-not-composed', controlPath, '组合式工作流只允许标准表单控件；专有流程应切换为外部整体工作流。');
    if (control.slot) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(control.slot) || slots.has(control.slot)) issue(issues, 'error', 'workflow-slot-invalid', controlPath, `输出槽位 ${control.slot} 无效或重复。`);
      slots.add(control.slot);
    }
    else if (!control.systemManaged) issue(issues, 'error', 'workflow-slot-required', controlPath, '表单输入必须声明输出槽位。');
    validateOptions(control, controlPath);
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
  if (config.schemaVersion !== 'cairnmap.config-package.v3') issue(issues, 'error', 'schema-version-invalid', 'manifest', '配置包不是 cairnmap.config-package.v3。');
  if (!isNativeConfigRevision(config.contractRevision)) issue(issues, 'error', 'contract-revision-invalid', 'manifest', '配置包必须使用 V3.2 原生契约 revision 5/6。');
  validateEngine(config, issues);
  if (!/^[a-z][a-z0-9-]{2,80}$/.test(config.packageId)) issue(issues, 'error', 'package-id-invalid', 'manifest', '配置包 ID 格式无效。');
  if (!Number.isSafeInteger(config.revision) || config.revision < 1) issue(issues, 'error', 'revision-invalid', 'manifest', '包 revision 必须是正整数。');
  for (const [registryName, items] of Object.entries(config.registries)) {
    const ids = new Set<string>();
    for (const item of items) {
      if (!item.id || ids.has(item.id)) issue(issues, 'error', 'registry-id-invalid', `registries/${registryName}`, `${registryName} 中存在空或重复的注册表键。`);
      ids.add(item.id);
    }
  }
  const nodeIds = new Set<string>();
  const paths = new Set<string>();
  for (const node of config.nodes) {
    const base = `nodes/${node.nodeId}`;
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
