import type { CardItem, CategoryNode, ClassificationPath, Condition, ConfigPackageV2, ConfigValidationIssue, ConfigValidationReport, FieldDefinition, GeometryKind, GeometryProfile, MountedFeatureRecord, WorkflowDefinition } from './types';

const GEOMETRIES: GeometryKind[] = ['Point', 'LineString', 'Polygon'];
const SYSTEM_FIELD_KEYS = new Set(['ID', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG']);

export function classificationPathKey(path: ClassificationPath): string { return [path.class, path.kind, path.skind, path.skind2].filter((value): value is string => Boolean(value)).join('/'); }
export function isContinuousPath(path: ClassificationPath): boolean { return Boolean(path.class) && (!path.skind || Boolean(path.kind)) && (!path.skind2 || Boolean(path.skind)); }
export function nodeMatchesPath(node: CategoryNode, path: ClassificationPath): boolean { return Object.entries(node.path).every(([key, value]) => !value || path[key as keyof ClassificationPath] === value); }
function specificity(node: CategoryNode): number { return Object.values(node.path).filter(Boolean).length; }
export function resolveCategoryNodes(config: ConfigPackageV2, path: ClassificationPath): CategoryNode[] { return config.nodes.filter((node) => nodeMatchesPath(node, path)).sort((a, b) => specificity(a) - specificity(b)); }
export function resolveEffectiveFields(config: ConfigPackageV2, path: ClassificationPath): FieldDefinition[] { const values = new Map<string, FieldDefinition>(); for (const node of resolveCategoryNodes(config, path)) for (const field of node.fields) values.set(field.key, field); return [...values.values()]; }
export function resolveGeometryProfile(config: ConfigPackageV2, path: ClassificationPath, geometry: GeometryKind): GeometryProfile | undefined { let result: GeometryProfile | undefined; for (const node of resolveCategoryNodes(config, path)) { const candidate = node.geometryProfiles[geometry]; if (candidate) result = candidate; } return result; }
export function resolveCardItems(config: ConfigPackageV2, path: ClassificationPath): CardItem[] { const values = new Map<string, CardItem>(); for (const node of resolveCategoryNodes(config, path)) for (const item of node.card) values.set(item.id, item); return [...values.values()]; }

function issue(issues: ConfigValidationIssue[], severity: ConfigValidationIssue['severity'], code: string, path: string, message: string, extra: Partial<ConfigValidationIssue> = {}): void { issues.push({ severity, code, path, message, ...extra }); }
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
function validateWorkflow(workflow: WorkflowDefinition, config: ConfigPackageV2, issues: ConfigValidationIssue[]): void {
  const base = `workflows/${workflow.id}`;
  if (!isContinuousPath(workflow.target)) issue(issues, 'error', 'workflow-target-invalid', base, '工作流分类路径不连续。');
  const geometryIndex = workflow.steps.findIndex((step) => step.kind === 'geometry');
  if (geometryIndex < 0 || geometryIndex !== workflow.steps.length - 1) issue(issues, 'error', 'workflow-geometry-must-be-last', base, '绘制页必须且只能位于工作流最后一步。');
  const tailIndex = workflow.steps.findIndex((step) => step.kind === 'tagsExtensions');
  if (tailIndex >= 0 && tailIndex > geometryIndex) issue(issues, 'error', 'workflow-tail-after-geometry', base, 'tags/extensions 尾部区必须位于绘制页之前。');
  const fields = new Set(resolveEffectiveFields(config, workflow.target).map((field) => field.key));
  const slots = new Set<string>();
  for (const step of workflow.steps) for (const control of step.controls ?? []) {
    const controlPath = `${base}/steps/${step.id}/controls/${control.id}`;
    if (step.kind === 'special' && (!/^[a-z][a-z0-9-]{2,64}$/.test(step.specialKey ?? '') || !config.specialComponentKeys?.includes(step.specialKey ?? ''))) issue(issues, 'error', 'workflow-special-key-invalid', `${base}/steps/${step.id}`, '特殊步骤必须引用受控注册表中的键。');
    if (control.binding?.target === 'field' && !fields.has(control.binding.path)) issue(issues, 'error', 'workflow-field-binding-missing', controlPath, `工作流绑定字段 ${control.binding.path} 不存在于目标分类。`, { field: control.binding.path });
    if ((control.kind === 'coarseSearch' || control.kind === 'featureSearch') && !control.search?.registryKey) issue(issues, 'error', 'workflow-search-profile-missing', controlPath, '搜索控件必须引用受控搜索配置。');
    if (control.slot) { if (!/^[A-Z][A-Z0-9_]*$/.test(control.slot) || slots.has(control.slot)) issue(issues, 'error', 'workflow-slot-invalid', controlPath, `输出槽位 ${control.slot} 无效或重复。`); slots.add(control.slot); }
  }
  for (const assignment of workflow.assignments ?? []) {
    if (!assignment.target.trim() || !assignment.expression.trim()) issue(issues, 'error', 'workflow-assignment-invalid', `${base}/assignments/${assignment.id}`, '字段组装必须同时指定目标和表达式。');
    for (const token of assignment.expression.match(/\b[A-Z][A-Z0-9_]*\b/g) ?? []) if (!['ID', 'World', 'Class', 'Kind', 'Skind', 'Skind2'].includes(token) && !slots.has(token)) issue(issues, 'error', 'workflow-assignment-slot-missing', `${base}/assignments/${assignment.id}`, `字段组装引用了不存在的输入槽位 ${token}。`);
  }
}
function conditionMatches(record: MountedFeatureRecord, conditions: Condition[] | undefined): boolean {
  if (!conditions?.length) return true;
  return conditions.every((condition) => condition.kind === 'always' || (condition.kind === 'fieldEquals' && String(record[condition.field] ?? '') === condition.value));
}
function recordId(record: MountedFeatureRecord, index: number): string { return String(record.ID ?? `${String(record.World ?? 'unknown-world')}/${String(record.Class ?? 'unknown-class')}/${index}`); }
function aggregateMountedIssues(records: MountedFeatureRecord[], config: ConfigPackageV2): ConfigValidationIssue[] {
  const grouped = new Map<string, ConfigValidationIssue>();
  records.forEach((record, index) => {
    const path: ClassificationPath = { class: String(record.Class ?? ''), ...(record.Kind ? { kind: String(record.Kind) } : {}), ...((record.Skind ?? record.SKind) ? { skind: String(record.Skind ?? record.SKind) } : {}), ...((record.Skind2 ?? record.SKind2) ? { skind2: String(record.Skind2 ?? record.SKind2) } : {}) };
    for (const field of resolveEffectiveFields(config, path).filter((item) => item.required && conditionMatches(record, item.requiredWhen))) {
      if (record[field.key] !== null && record[field.key] !== undefined && record[field.key] !== '') continue;
      const key = `mounted-data-required-field-missing|${field.key}|${classificationPathKey(path)}`;
      const prior = grouped.get(key) ?? { severity: 'error', code: 'mounted-data-required-field-missing', path: `mounted/${classificationPathKey(path)}/${field.key}`, field: field.key, expected: 'required', message: `缺少必填字段 ${field.key}（${classificationPathKey(path)}）。`, featureIds: [], count: 0 };
      prior.featureIds?.push(recordId(record, index)); prior.count = (prior.count ?? 0) + 1; grouped.set(key, prior);
    }
  });
  return [...grouped.values()].map((entry) => ({ ...entry, featureIds: [...new Set(entry.featureIds)].sort() }));
}

export function validateConfigPackage(config: ConfigPackageV2, mountedRecords: MountedFeatureRecord[] = []): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = [];
  if (config.schemaVersion !== 'cairnmap.config-package.v2') issue(issues, 'error', 'schema-version-invalid', 'manifest', '配置包不是 cairnmap.config-package.v2。');
  if (!/^[a-z][a-z0-9-]{2,80}$/.test(config.packageId)) issue(issues, 'error', 'package-id-invalid', 'manifest', '配置包 ID 格式无效。');
  if (!Number.isSafeInteger(config.revision) || config.revision < 1) issue(issues, 'error', 'revision-invalid', 'manifest', '统一 revision 必须是正整数。');
  const nodeIds = new Set<string>(); const paths = new Set<string>();
  for (const node of config.nodes) {
    const base = `nodes/${node.nodeId}`; const pathKey = classificationPathKey(node.path);
    if (nodeIds.has(node.nodeId)) issue(issues, 'error', 'node-id-duplicate', base, '分类节点 ID 重复。'); nodeIds.add(node.nodeId);
    if (!isContinuousPath(node.path)) issue(issues, 'error', 'classification-path-invalid', base, '分类路径必须从 Class 连续向下定义。');
    if (paths.has(pathKey)) issue(issues, 'error', 'classification-path-duplicate', base, '分类路径重复。'); paths.add(pathKey);
    const keys = new Set<string>(); node.fields.forEach((field, index) => validateField(field, `${base}/fields/${index}`, keys, issues));
    for (const geometry of GEOMETRIES) { const profile = node.geometryProfiles[geometry]; if (!profile) continue; const profilePath = `${base}/geometry/${geometry}`;
      if (!Number.isInteger(profile.zLevel) || profile.zLevel < 100 || profile.zLevel > 699) issue(issues, 'error', 'zlevel-out-of-range', profilePath, '业务 zLevel 必须在 100 到 699 之间。');
      if (!Number.isInteger(profile.interactionPriority)) issue(issues, 'error', 'interaction-priority-invalid', profilePath, '交互优先级必须是整数。');
      for (const interval of profile.label.zoomIntervals ?? []) if (interval.minExclusive !== undefined && interval.maxExclusive !== undefined && interval.minExclusive >= interval.maxExclusive) issue(issues, 'error', 'zoom-interval-invalid', profilePath, '每个显示区间必须符合 n < zoom < n。');
      const aggregate = profile.aggregatePriority; if (aggregate?.enabled && (aggregate.inputRange.min >= aggregate.inputRange.max || aggregate.priorityRange.min > aggregate.priorityRange.max || !Number.isFinite(aggregate.multiplier))) issue(issues, 'error', 'aggregate-priority-invalid', profilePath, '建筑整体优先级范围或系数无效。');
    }
    const fields = new Set(resolveEffectiveFields(config, node.path).map((field) => field.key));
    for (const item of node.card) if (!item.source.startsWith('tags.') && !item.source.startsWith('extensions.') && !fields.has(item.source) && item.renderer !== 'specialCard') issue(issues, 'error', 'card-field-missing', `${base}/card/${item.id}`, `信息卡字段 ${item.source} 未定义。`, { field: item.source });
  }
  const workflowIds = new Set<string>(); for (const workflow of config.workflows) { if (workflowIds.has(workflow.id)) issue(issues, 'error', 'workflow-id-duplicate', `workflows/${workflow.id}`, '工作流 ID 重复。'); workflowIds.add(workflow.id); validateWorkflow(workflow, config, issues); }
  if (!config.parity) issue(issues, 'error', 'v1-parity-report-missing', 'parity', '配置包缺少 V1 顺承报告，不能导出为可激活包。');
  else for (const entry of config.parity.entries.filter((item) => item.status === 'unsupported')) issue(issues, 'error', 'v1-parity-unsupported', `parity/${entry.kind}/${entry.id}`, `V1 配置 ${entry.id} 未被顺承：${entry.details ?? '未说明原因'}。`);
  const mounted = aggregateMountedIssues(mountedRecords, config); issues.push(...mounted);
  const configuration = issues.filter((item) => !item.code.startsWith('mounted-') && !item.code.startsWith('v1-parity')).length;
  const parity = issues.filter((item) => item.code.startsWith('v1-parity')).length;
  return { schemaVersion: 'cairnmap.config-validation-report.v2', valid: !issues.some((item) => item.severity === 'error'), createdAt: new Date().toISOString(), issues, summary: { configuration, parity, mountedData: mounted.length, affectedFeatures: mounted.reduce((total, item) => total + (item.featureIds?.length ?? 0), 0) } };
}

function profile(color: string, zLevel: number, mode: GeometryProfile['interaction']['mode'] = 'standard'): GeometryProfile { return { enabled: true, allowMultipleParts: true, color, zLevel, labelOffset: 10, interactionPriority: zLevel, featureScope: 'wholeFeature', label: { visible: true, scope: 'featureBbox', conditions: [{ kind: 'zoomRange', min: 2 }], zoomIntervals: [{ id: 'default', minExclusive: 1 }] }, interaction: { mode } }; }
export function createBundledConfigPackage(): ConfigPackageV2 { return { schemaVersion: 'cairnmap.config-package.v2', packageId: 'cairnmap-config', projectId: 'default', revision: 1, displayName: { zh: '当前工程配置（v2 基准）', en: 'Current project configuration (v2 baseline)' }, parity: { schemaVersion: 'cairnmap.v1-parity-report.v1', generatedAt: new Date().toISOString(), entries: [] }, nodes: [{ nodeId: 'class-rle', path: { class: 'RLE' }, children: [], policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' }, fields: [{ fieldId: 'rle-name', key: 'Name', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '线路名称', en: 'Line name' }, description: { zh: '线路显示名称', en: 'Line display name' } }], geometryProfiles: { LineString: profile('#2766e8', 320) }, card: [{ id: 'rle-name-card', source: 'Name', visible: true, renderer: 'nameColorCapsule' }] }], workflows: [] }; }
