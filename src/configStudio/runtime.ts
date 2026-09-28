import type {
  AffectedFeature,
  CardConfiguration,
  CardItem,
  CategoryNode,
  ClassificationPath,
  Condition,
  ConfigPackageV3,
  ConfigValidationIssue,
  ConfigValidationReport,
  FieldDefinition,
  GeometryKind,
  GeometryProfile,
  MountedFeatureRecord,
  WorkflowControl,
  WorkflowDefinition,
  ZoomPriorityRule,
} from './types';

const GEOMETRIES: GeometryKind[] = ['Point', 'LineString', 'Polygon'];
const SYSTEM_FIELD_KEYS = new Set(['ID', 'World', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG']);
const WORKFLOW_SYSTEM_TOKENS = new Set(['ID', 'World', 'Class', 'Kind', 'Skind', 'Skind2']);

export function classificationPathKey(path: ClassificationPath): string {
  return [path.class, path.kind, path.skind, path.skind2].filter((value): value is string => Boolean(value)).join('/');
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

export function resolveEffectiveFields(config: ConfigPackageV3, path: ClassificationPath): FieldDefinition[] {
  const values = new Map<string, FieldDefinition>();
  for (const node of resolveCategoryNodes(config, path)) {
    for (const field of node.fields) values.set(field.key, field);
  }
  return [...values.values()];
}

/**
 * A partial target scope may resolve to many classifications. A relation or
 * search field is selectable only when every possible target exposes it.
 */
export function resolveSelectableFields(config: ConfigPackageV3, scope: ClassificationPath): FieldDefinition[] {
  const concrete = config.nodes.filter((node) => pathMatchesScope(node.path, scope) && !hasDescendants(config, node.path));
  const candidates = concrete.length ? concrete : config.nodes.filter((node) => pathMatchesScope(node.path, scope));
  if (!candidates.length) return [];
  const fieldSets = candidates.map((node) => new Map(resolveEffectiveFields(config, node.path).map((field) => [field.key, field])));
  return [...fieldSets[0].values()].filter((field) => fieldSets.every((set) => set.has(field.key)));
}

export function resolveGeometryProfile(config: ConfigPackageV3, path: ClassificationPath, geometry: GeometryKind): GeometryProfile | undefined {
  let result: GeometryProfile | undefined;
  for (const node of resolveCategoryNodes(config, path)) {
    const candidate = node.geometryProfiles[geometry];
    if (candidate) result = candidate;
  }
  return result;
}

export function resolveCardConfiguration(config: ConfigPackageV3, path: ClassificationPath): CardConfiguration | undefined {
  let result: CardConfiguration | undefined;
  for (const node of resolveCategoryNodes(config, path)) result = node.card;
  return result;
}

export function resolveCardItems(config: ConfigPackageV3, path: ClassificationPath): CardItem[] {
  const card = resolveCardConfiguration(config, path);
  return card?.mode === 'fields' ? card.items : [];
}

export function resolveZoomRule(profile: GeometryProfile, zoom: number): ZoomPriorityRule | undefined {
  return profile.zoomPriority.rules.find((rule) => (rule.minExclusive === undefined || zoom > rule.minExclusive) && (rule.maxExclusive === undefined || zoom < rule.maxExclusive));
}

function issue(issues: ConfigValidationIssue[], severity: ConfigValidationIssue['severity'], code: string, path: string, message: string, extra: Partial<ConfigValidationIssue> = {}): void {
  issues.push({ severity, code, path, message, ...extra });
}

function validateCondition(condition: Condition, path: string, issues: ConfigValidationIssue[]): void {
  if (condition.kind === 'zoomRange' && condition.min !== undefined && condition.max !== undefined && condition.min >= condition.max) issue(issues, 'error', 'zoom-range-invalid', path, 'Zoom 区间的下界必须小于上界。');
  if (condition.kind === 'bboxArea' && condition.min !== undefined && condition.max !== undefined && condition.min > condition.max) issue(issues, 'error', 'bbox-range-invalid', path, '面积区间的下界不能大于上界。');
}

function validateField(field: FieldDefinition, path: string, known: Set<string>, issues: ConfigValidationIssue[]): void {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field.key)) issue(issues, 'error', 'field-key-invalid', path, `字段名 ${field.key || '（空）'} 必须以字母开头，且仅包含字母、数字或下划线。`, { field: field.key });
  if (SYSTEM_FIELD_KEYS.has(field.key)) issue(issues, 'error', 'system-field-redefined', path, `系统字段 ${field.key} 不能在分类配置中重新定义。`, { field: field.key });
  if (known.has(field.key)) issue(issues, 'error', 'field-key-duplicate', path, `字段 ${field.key} 在同一分类节点中重复。`, { field: field.key });
  known.add(field.key);
  if (!field.labels.zh.trim()) issue(issues, 'error', 'field-label-zh-required', path, '字段必须提供中文标签。', { field: field.key });
  if (field.type === 'enum' && (!field.options?.length && !field.optionSource?.registryKey)) issue(issues, 'error', 'enum-options-required', path, '枚举字段必须提供静态选项或受控选项注册表。', { field: field.key });
  field.requiredWhen?.forEach((item, index) => validateCondition(item, `${path}/requiredWhen/${index}`, issues));
}

function allowedTriggerKeys(geometry: GeometryKind): string[] {
  if (geometry === 'Point') return ['point', 'label'];
  if (geometry === 'LineString') return ['line', 'label'];
  return ['boundary', 'interior', 'label'];
}

function validateProfile(profile: GeometryProfile, geometry: GeometryKind, path: string, issues: ConfigValidationIssue[]): void {
  if (!Number.isInteger(profile.geometryStack.zLevel) || profile.geometryStack.zLevel < 0 || profile.geometryStack.zLevel > 9999) issue(issues, 'error', 'geometry-zlevel-invalid', path, '几何 zLevel 必须是 0 到 9999 之间的整数。');
  if (!profile.allowMultipleParts && profile.label.anchor !== 'featureBbox') issue(issues, 'error', 'label-anchor-requires-multipart', path, '仅允许多部件时才能选择“各部件” Label 锚点。');
  if (!Number.isFinite(profile.label.collision.basePriority)) issue(issues, 'error', 'label-base-priority-invalid', path, 'Label 基础优先级必须是有限数字。');
  const allowed = new Set(allowedTriggerKeys(geometry));
  for (const [key, enabled] of Object.entries(profile.interaction.triggers)) {
    if (enabled && !allowed.has(key)) issue(issues, 'error', 'interaction-trigger-geometry-invalid', path, `${key} 不适用于 ${geometry}。`);
  }
  if (profile.enabled && !Object.values(profile.interaction.triggers).some(Boolean)) issue(issues, 'warning', 'interaction-trigger-none', path, '已启用的几何没有交互触发器，将不能通过地图打开信息卡。');
  const intervals = profile.zoomPriority.rules;
  if (!intervals.length) issue(issues, 'error', 'zoom-priority-rule-missing', path, '每种已启用几何至少需要一个 Zoom/优先级规则。');
  for (const rule of intervals) {
    const rulePath = `${path}/zoomPriority/${rule.id}`;
    if (rule.minExclusive !== undefined && rule.maxExclusive !== undefined && rule.minExclusive >= rule.maxExclusive) issue(issues, 'error', 'zoom-interval-invalid', rulePath, '显示区间必须符合 n < zoom < n。');
    const metric = rule.priority?.metric;
    if (metric && (!Number.isFinite(metric.multiplier) || (metric.divisor !== undefined && (!Number.isFinite(metric.divisor) || metric.divisor === 0)) || (metric.min !== undefined && metric.max !== undefined && metric.min > metric.max))) issue(issues, 'error', 'dynamic-priority-invalid', rulePath, '动态优先级的倍率、除数或上下界无效。');
    if (metric?.kind === 'field' && !metric.field?.trim()) issue(issues, 'error', 'dynamic-priority-field-required', rulePath, '字段型动态优先级必须指定字段。');
  }
  profile.label.conditions.forEach((condition, index) => validateCondition(condition, `${path}/label/conditions/${index}`, issues));
}

function registryHas(items: { id: string; allowedClasses?: string[] }[], id: string, classCode: string): boolean {
  const item = items.find((entry) => entry.id === id);
  return Boolean(item && (!item.allowedClasses?.length || item.allowedClasses.includes(classCode)));
}

function validateCard(node: CategoryNode, config: ConfigPackageV3, issues: ConfigValidationIssue[]): void {
  const path = `nodes/${node.nodeId}/card`;
  const fields = new Set(resolveEffectiveFields(config, node.path).map((field) => field.key));
  if (node.card.mode === 'layout') {
    if (!registryHas(config.registries.cardLayouts, node.card.layoutId, node.path.class)) issue(issues, 'error', 'card-layout-invalid', path, `信息卡布局 ${node.card.layoutId || '（空）'} 不在受控注册表中或不适用于该 Class。`);
    return;
  }
  if (node.card.mode === 'component') {
    if (!registryHas(config.registries.cardComponents, node.card.componentKey, node.path.class)) issue(issues, 'error', 'card-component-invalid', path, `专用信息卡组件 ${node.card.componentKey || '空'} 不在受控注册表中或不适用于该 Class。`);
    return;
  }
  for (const item of node.card.items) {
    const itemPath = `${path}/items/${item.id}`;
    if (!item.source.startsWith('tags.') && !item.source.startsWith('extensions.') && !fields.has(item.source)) issue(issues, 'error', 'card-field-missing', itemPath, `信息卡字段 ${item.source} 未定义。`, { field: item.source });
    if (item.renderer !== 'relationLink') continue;
    const relation = item.relation;
    if (!relation?.targetClassification || !isContinuousPath(relation.targetClassification) || !hasCategoryNode(config, relation.targetClassification)) {
      issue(issues, 'error', 'relation-target-classification-invalid', itemPath, '关系卡必须选择存在且连续的目标分类。');
      continue;
    }
    const targetFields = new Set(resolveSelectableFields(config, relation.targetClassification).map((field) => field.key));
    if (!relation.targetMatchField || !targetFields.has(relation.targetMatchField)) issue(issues, 'error', 'relation-target-match-field-invalid', itemPath, '关系卡的目标匹配字段不在目标分类的有效字段集中。');
    if (!relation.targetDisplayField || !targetFields.has(relation.targetDisplayField)) issue(issues, 'error', 'relation-target-display-field-invalid', itemPath, '关系卡的目标展示字段不在目标分类的有效字段集中。');
  }
}

function targetSupportsClassificationPicker(config: ConfigPackageV3, target: ClassificationPath): boolean {
  return hasDescendants(config, target);
}

function controlsFor(workflow: WorkflowDefinition): WorkflowControl[] {
  return workflow.steps.flatMap((step) => step.controls ?? []);
}

function validateSearch(control: WorkflowControl, config: ConfigPackageV3, path: string, issues: ConfigValidationIssue[]): void {
  const search = control.search;
  if (!search || !isContinuousPath(search.target) || !hasCategoryNode(config, search.target)) {
    issue(issues, 'error', 'workflow-search-target-invalid', path, '搜索控件必须选择存在且连续的目标分类范围。');
    return;
  }
  const selectable = new Set(resolveSelectableFields(config, search.target).map((field) => field.key));
  for (const [label, values] of [['搜索字段', search.searchFields], ['展示字段', search.displayFields], ['返回字段', search.returnFields]] as const) {
    if (!values.length) issue(issues, 'error', 'workflow-search-fields-required', path, `${label}至少需要选择一个字段。`);
    for (const field of values) if (!selectable.has(field)) issue(issues, 'error', 'workflow-search-field-invalid', path, `${label} ${field} 不在目标分类的有效字段集中。`, { field });
  }
  if (control.kind === 'coarseSearch') {
    const coarse = search.coarse;
    if (!coarse || !Number.isInteger(coarse.minQueryLength) || coarse.minQueryLength < 0 || !Number.isInteger(coarse.maxResults) || coarse.maxResults < 1) issue(issues, 'error', 'workflow-coarse-search-options-invalid', path, '粗搜索必须配置匹配方式、最短输入长度和结果上限。');
  }
}

function expressionTokens(expression: string): string[] {
  return expression.match(/\b[A-Za-z][A-Za-z0-9_]*\b/g) ?? [];
}

function validateWorkflow(workflow: WorkflowDefinition, config: ConfigPackageV3, issues: ConfigValidationIssue[]): void {
  const base = `workflows/${workflow.id}`;
  if (!isContinuousPath(workflow.target) || !hasCategoryNode(config, workflow.target)) issue(issues, 'error', 'workflow-target-invalid', base, '工作流必须选择存在且连续的目标分类。');
  const actorIndex = workflow.steps.findIndex((step) => step.kind === 'actor');
  const geometryIndex = workflow.steps.findIndex((step) => step.kind === 'geometry');
  const tailIndex = workflow.steps.findIndex((step) => step.kind === 'tagsExtensions');
  if (actorIndex !== 0) issue(issues, 'error', 'workflow-actor-must-be-first', base, '填写人页必须且只能位于工作流第一步。');
  if (geometryIndex < 0 || geometryIndex !== workflow.steps.length - 1) issue(issues, 'error', 'workflow-geometry-must-be-last', base, '绘制页必须且只能位于工作流最后一步。');
  if (tailIndex < 0 || tailIndex !== geometryIndex - 1) issue(issues, 'error', 'workflow-tail-before-geometry-required', base, 'tags/extensions 尾部区必须紧邻最终绘制页。');
  const formIndexes = workflow.steps.map((step, index) => step.kind === 'form' ? index : -1).filter((index) => index >= 0);
  if (!formIndexes.length) issue(issues, 'error', 'workflow-form-page-required', base, '工作流至少需要一个基本信息填卡页。');
  if (formIndexes.some((index) => index <= actorIndex || index >= tailIndex)) issue(issues, 'error', 'workflow-form-page-order-invalid', base, '基本信息页必须位于填写人和 tags/extensions 尾部区之间。');

  const slots = new Set<string>();
  const controlList = controlsFor(workflow);
  const hasManagedClassification = controlList.some((control) => control.kind === 'classificationPicker' && control.systemManaged);
  if (targetSupportsClassificationPicker(config, workflow.target) !== hasManagedClassification) issue(issues, 'error', 'workflow-classification-picker-stale', base, '工作流目标分类的子分类状态已变化；请打开工作流并刷新系统分类选择控件。');
  for (const step of workflow.steps) {
    for (const control of step.controls ?? []) {
      const controlPath = `${base}/steps/${step.id}/controls/${control.id}`;
      if (control.slot) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(control.slot) || slots.has(control.slot)) issue(issues, 'error', 'workflow-slot-invalid', controlPath, `输出槽位 ${control.slot} 无效或重复。`);
        slots.add(control.slot);
      }
      if (control.kind === 'featureSearch' || control.kind === 'coarseSearch') validateSearch(control, config, controlPath, issues);
      if (control.kind === 'component' && (!control.componentKey || !config.registries.workflowBlocks.some((item) => item.id === control.componentKey))) issue(issues, 'error', 'workflow-component-invalid', controlPath, '组件型工作流控件必须引用受控工作流块。');
    }
  }
  const fields = new Set(resolveEffectiveFields(config, workflow.target).map((field) => field.key));
  for (const assignment of workflow.assignments ?? []) {
    const assignmentPath = `${base}/assignments/${assignment.id}`;
    if (!assignment.target.trim() || !assignment.expression.trim()) issue(issues, 'error', 'workflow-assignment-invalid', assignmentPath, '字段组装必须同时指定目标和表达式。');
    if (!fields.has(assignment.target) && !/^tags\.[A-Za-z][A-Za-z0-9_]*$/.test(assignment.target) && !/^extensions\.[A-Za-z][A-Za-z0-9_]*$/.test(assignment.target) && !SYSTEM_FIELD_KEYS.has(assignment.target)) issue(issues, 'error', 'workflow-assignment-target-invalid', assignmentPath, `字段组装目标 ${assignment.target} 不是有效字段、tags 或 extensions 路径。`);
    for (const token of expressionTokens(assignment.expression)) if (!WORKFLOW_SYSTEM_TOKENS.has(token) && !slots.has(token) && !/^\d+$/.test(token)) issue(issues, 'error', 'workflow-assignment-slot-missing', assignmentPath, `字段组装引用了不存在的输入槽位或系统字段 ${token}。`);
  }
}

function conditionMatches(record: MountedFeatureRecord, conditions: Condition[] | undefined): boolean {
  if (!conditions?.length) return true;
  return conditions.every((condition) => condition.kind === 'always' || (condition.kind === 'fieldEquals' && String(record[condition.field] ?? '') === condition.value));
}

function recordId(record: MountedFeatureRecord, index: number): string {
  return String(record.ID ?? `${String(record.World ?? 'unknown-world')}/${String(record.Class ?? 'unknown-class')}/${index}`);
}

function recordName(record: MountedFeatureRecord): string {
  return String(record.Name ?? record.ID ?? '未命名要素');
}

function aggregateMountedIssues(records: MountedFeatureRecord[], config: ConfigPackageV3): ConfigValidationIssue[] {
  const grouped = new Map<string, ConfigValidationIssue>();
  records.forEach((record, index) => {
    const path: ClassificationPath = {
      class: String(record.Class ?? ''),
      ...(record.Kind ? { kind: String(record.Kind) } : {}),
      ...((record.Skind ?? record.SKind) ? { skind: String(record.Skind ?? record.SKind) } : {}),
      ...((record.Skind2 ?? record.SKind2) ? { skind2: String(record.Skind2 ?? record.SKind2) } : {}),
    };
    for (const field of resolveEffectiveFields(config, path).filter((item) => item.required && conditionMatches(record, item.requiredWhen))) {
      if (record[field.key] !== null && record[field.key] !== undefined && record[field.key] !== '') continue;
      const key = `mounted-data-required-field-missing|${field.key}|${classificationPathKey(path)}`;
      const prior = grouped.get(key) ?? {
        severity: 'error' as const,
        code: 'mounted-data-required-field-missing',
        path: `mounted/${classificationPathKey(path)}/${field.key}`,
        field: field.key,
        expected: 'required',
        message: `缺少必填字段 ${field.key}（${classificationPathKey(path)}）。`,
        affectedFeatures: [],
        count: 0,
      };
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

export function validateConfigPackage(config: ConfigPackageV3, mountedRecords: MountedFeatureRecord[] = []): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = [];
  if (config.schemaVersion !== 'cairnmap.config-package.v3') issue(issues, 'error', 'schema-version-invalid', 'manifest', '配置包不是 cairnmap.config-package.v3。');
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
    const keys = new Set<string>();
    node.fields.forEach((field, index) => validateField(field, `${base}/fields/${index}`, keys, issues));
    for (const geometry of GEOMETRIES) {
      const profile = node.geometryProfiles[geometry];
      if (profile) validateProfile(profile, geometry, `${base}/geometry/${geometry}`, issues);
    }
    if (node.containment?.enabled) {
      if (!node.containment.role) issue(issues, 'error', 'containment-role-required', `${base}/containment`, '包含关系绑定已启用，但尚未选择主结构或附属结构。');
      if (node.containment.role === 'child') {
        const fields = new Set(resolveEffectiveFields(config, node.path).map((field) => field.key));
        if (!node.containment.parentReferenceField || !fields.has(node.containment.parentReferenceField)) issue(issues, 'error', 'containment-parent-field-invalid', `${base}/containment`, '附属结构必须选择一个当前有效的主结构引用字段。');
      }
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
  if (!config.parity) issue(issues, 'error', 'v1-parity-report-missing', 'parity', '配置包缺少 V1 顺承报告，不能导出为可激活包。');
  else for (const entry of config.parity.entries.filter((item) => item.status === 'unsupported')) issue(issues, 'error', 'v1-parity-unsupported', `parity/${entry.kind}/${entry.id}`, `V1 配置 ${entry.id} 未被顺承：${entry.details ?? '未说明原因'}。`);
  const mounted = aggregateMountedIssues(mountedRecords, config);
  issues.push(...mounted);
  const configuration = issues.filter((item) => !item.code.startsWith('mounted-') && !item.code.startsWith('v1-parity')).length;
  const parity = issues.filter((item) => item.code.startsWith('v1-parity')).length;
  return {
    schemaVersion: 'cairnmap.config-validation-report.v3',
    valid: !issues.some((item) => item.severity === 'error'),
    createdAt: new Date().toISOString(),
    issues,
    summary: { configuration, parity, mountedData: mounted.length, affectedFeatures: mounted.reduce((total, item) => total + (item.affectedFeatures?.length ?? 0), 0) },
  };
}

function defaultProfile(color: string, zLevel: number): GeometryProfile {
  return {
    enabled: true,
    allowMultipleParts: false,
    color,
    geometryStack: { zLevel },
    label: { visible: true, anchor: 'featureBbox', conditions: [{ kind: 'always' }], collision: { role: 'optional', basePriority: zLevel, hideWhenColliding: true } },
    zoomPriority: { rules: [{ id: 'default', minExclusive: 0, representation: 'geometry', priority: { mode: 'replace', base: zLevel } }] },
    interaction: { triggers: { label: true } },
  };
}

export function createBundledConfigPackage(): ConfigPackageV3 {
  return {
    schemaVersion: 'cairnmap.config-package.v3',
    packageId: 'cairnmap-config',
    projectId: 'default',
    revision: 1,
    displayName: { zh: '当前工程配置（V3 基准）', en: 'Current project configuration (V3 baseline)' },
    registries: { cardLayouts: [], cardComponents: [], displayProfiles: [], specialDisplayLogic: [], workflowControls: [], workflowBlocks: [] },
    parity: { schemaVersion: 'cairnmap.v1-parity-report.v2', generatedAt: new Date().toISOString(), entries: [] },
    nodes: [{
      nodeId: 'class-rle', path: { class: 'RLE' }, children: [],
      policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' },
      fields: [{ fieldId: 'rle-name', key: 'Name', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '线路名称', en: 'Line name' }, description: { zh: '线路显示名称', en: 'Line display name' } }],
      geometryProfiles: { LineString: defaultProfile('#2766e8', 320) },
      card: { mode: 'fields', items: [{ id: 'rle-name-card', source: 'Name', visible: true, renderer: 'nameColorCapsule' }] },
    }],
    workflows: [],
  };
}
