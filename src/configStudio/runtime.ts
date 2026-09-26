import type {
  CardItem,
  CategoryNode,
  ClassificationPath,
  ConfigPackageV2,
  ConfigValidationIssue,
  ConfigValidationReport,
  FieldDefinition,
  GeometryKind,
  GeometryProfile,
  MountedFeatureRecord,
  WorkflowDefinition,
} from './types';

const GEOMETRIES: GeometryKind[] = ['Point', 'LineString', 'Polygon'];
const SYSTEM_FIELD_KEYS = new Set(['ID', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG']);

export function classificationPathKey(path: ClassificationPath): string {
  return [path.class, path.kind, path.skind, path.skind2].filter((value): value is string => Boolean(value)).join('/');
}

export function isContinuousPath(path: ClassificationPath): boolean {
  return Boolean(path.class)
    && (!path.skind || Boolean(path.kind))
    && (!path.skind2 || Boolean(path.skind));
}

export function nodeMatchesPath(node: CategoryNode, path: ClassificationPath): boolean {
  return Object.entries(node.path).every(([key, value]) => !value || path[key as keyof ClassificationPath] === value);
}

function nodeSpecificity(node: CategoryNode): number {
  return Object.values(node.path).filter(Boolean).length;
}

export function resolveCategoryNodes(config: ConfigPackageV2, path: ClassificationPath): CategoryNode[] {
  return config.nodes
    .filter((node) => nodeMatchesPath(node, path))
    .sort((left, right) => nodeSpecificity(left) - nodeSpecificity(right));
}

export function resolveEffectiveFields(config: ConfigPackageV2, path: ClassificationPath): FieldDefinition[] {
  const values = new Map<string, FieldDefinition>();
  for (const node of resolveCategoryNodes(config, path)) {
    for (const field of node.fields) values.set(field.key, field);
  }
  return [...values.values()];
}

export function resolveGeometryProfile(config: ConfigPackageV2, path: ClassificationPath, geometry: GeometryKind): GeometryProfile | undefined {
  let profile: GeometryProfile | undefined;
  for (const node of resolveCategoryNodes(config, path)) {
    const candidate = node.geometryProfiles[geometry];
    if (candidate) profile = candidate;
  }
  return profile;
}

export function resolveCardItems(config: ConfigPackageV2, path: ClassificationPath): CardItem[] {
  const values = new Map<string, CardItem>();
  for (const node of resolveCategoryNodes(config, path)) {
    for (const item of node.card) values.set(item.id, item);
  }
  return [...values.values()];
}

function validateField(field: FieldDefinition, path: string, knownKeys: Set<string>, issues: ConfigValidationIssue[]): void {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field.key)) issues.push({ severity: 'error', code: 'field-key-invalid', path, message: `字段名 ${field.key || '（空）'} 必须以字母开头，且仅包含字母、数字或下划线。` });
  if (SYSTEM_FIELD_KEYS.has(field.key)) issues.push({ severity: 'error', code: 'system-field-redefined', path, message: `系统字段 ${field.key} 不能在分类配置中重新定义。` });
  if (knownKeys.has(field.key)) issues.push({ severity: 'error', code: 'field-key-duplicate', path, message: `字段 ${field.key} 在同一分类节点中重复。` });
  knownKeys.add(field.key);
  if (!field.labels.zh.trim()) issues.push({ severity: 'error', code: 'field-label-zh-required', path, message: '字段必须提供中文标签。' });
  if (field.type === 'enum' && (!field.options || !field.options.length)) issues.push({ severity: 'error', code: 'enum-options-required', path, message: '枚举字段必须至少提供一个选项。' });
}

function validateWorkflow(workflow: WorkflowDefinition, config: ConfigPackageV2, issues: ConfigValidationIssue[]): void {
  const base = `workflows/${workflow.id}`;
  if (!isContinuousPath(workflow.target)) issues.push({ severity: 'error', code: 'workflow-target-invalid', path: base, message: '工作流分类路径不连续。' });
  const geometryIndex = workflow.steps.findIndex((step) => step.kind === 'geometry');
  if (geometryIndex < 0 || geometryIndex !== workflow.steps.length - 1) issues.push({ severity: 'error', code: 'workflow-geometry-must-be-last', path: base, message: '绘制页必须且只能位于工作流最后一步。' });
  const tailIndex = workflow.steps.findIndex((step) => step.kind === 'tagsExtensions');
  if (tailIndex >= 0 && geometryIndex >= 0 && tailIndex > geometryIndex) issues.push({ severity: 'error', code: 'workflow-tail-after-geometry', path: base, message: 'tags/extensions 尾部区必须位于绘制页之前。' });
  const fields = new Set(resolveEffectiveFields(config, workflow.target).map((field) => field.key));
  for (const step of workflow.steps) {
    if (step.kind === 'special' && (!/^[a-z][a-z0-9-]{2,64}$/.test(step.specialKey ?? '') || !config.specialComponentKeys?.includes(step.specialKey ?? ''))) issues.push({ severity: 'error', code: 'workflow-special-key-invalid', path: `${base}/steps/${step.id}`, message: '特殊步骤必须引用配置包受控注册表中的键。' });
    for (const control of step.controls ?? []) {
      if (control.binding?.target === 'field' && !fields.has(control.binding.path)) issues.push({ severity: 'error', code: 'workflow-field-binding-missing', path: `${base}/steps/${step.id}/controls/${control.id}`, message: `工作流绑定字段 ${control.binding.path} 不存在于目标分类。` });
    }
  }
  if (workflow.idAssembly && !fields.has(workflow.idAssembly.targetField) && workflow.idAssembly.targetField !== 'ID') issues.push({ severity: 'error', code: 'workflow-id-target-invalid', path: base, message: 'ID 组装目标必须是 ID 或已定义字段。' });
}

export function validateConfigPackage(config: ConfigPackageV2, mountedRecords: MountedFeatureRecord[] = []): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = [];
  if (config.schemaVersion !== 'cairnmap.config-package.v2') issues.push({ severity: 'error', code: 'schema-version-invalid', path: 'manifest', message: '配置包不是 cairnmap.config-package.v2。' });
  if (!/^[a-z][a-z0-9-]{2,80}$/.test(config.packageId)) issues.push({ severity: 'error', code: 'package-id-invalid', path: 'manifest', message: '配置包 ID 格式无效。' });
  if (!Number.isSafeInteger(config.revision) || config.revision < 1) issues.push({ severity: 'error', code: 'revision-invalid', path: 'manifest', message: '统一 revision 必须是正整数。' });
  const nodeIds = new Set<string>();
  const paths = new Set<string>();
  for (const node of config.nodes) {
    const nodePath = `nodes/${node.nodeId}`;
    if (nodeIds.has(node.nodeId)) issues.push({ severity: 'error', code: 'node-id-duplicate', path: nodePath, message: '分类节点 ID 重复。' });
    nodeIds.add(node.nodeId);
    const key = classificationPathKey(node.path);
    if (!isContinuousPath(node.path)) issues.push({ severity: 'error', code: 'classification-path-invalid', path: nodePath, message: '分类路径必须从 Class 连续向下定义。' });
    if (paths.has(key)) issues.push({ severity: 'error', code: 'classification-path-duplicate', path: nodePath, message: '分类路径重复。' });
    paths.add(key);
    const fieldKeys = new Set<string>();
    node.fields.forEach((field, index) => validateField(field, `${nodePath}/fields/${index}`, fieldKeys, issues));
    for (const geometry of GEOMETRIES) {
      const profile = node.geometryProfiles[geometry];
      if (!profile) continue;
      if (!Number.isInteger(profile.zLevel) || profile.zLevel < 100 || profile.zLevel > 699) issues.push({ severity: 'error', code: 'zlevel-out-of-range', path: `${nodePath}/geometry/${geometry}`, message: '业务 zLevel 必须在 100 到 699 之间；系统覆盖层由运行时保留。' });
      if (!Number.isInteger(profile.interactionPriority)) issues.push({ severity: 'error', code: 'interaction-priority-invalid', path: `${nodePath}/geometry/${geometry}`, message: '交互优先级必须是整数。' });
    }
    const effectiveFields = new Set(resolveEffectiveFields(config, node.path).map((field) => field.key));
    for (const item of node.card) {
      if (item.source.startsWith('tags.')) continue;
      if (!effectiveFields.has(item.source)) issues.push({ severity: 'error', code: 'card-field-missing', path: `${nodePath}/card/${item.id}`, message: `信息卡字段 ${item.source} 未定义。` });
    }
  }
  const workflowIds = new Set<string>();
  for (const workflow of config.workflows) {
    if (workflowIds.has(workflow.id)) issues.push({ severity: 'error', code: 'workflow-id-duplicate', path: `workflows/${workflow.id}`, message: '工作流 ID 重复。' });
    workflowIds.add(workflow.id);
    validateWorkflow(workflow, config, issues);
  }
  for (const [index, record] of mountedRecords.entries()) {
    const path: ClassificationPath = { class: String(record.Class ?? ''), ...(record.Kind ? { kind: String(record.Kind) } : {}), ...((record.Skind ?? record.SKind) ? { skind: String(record.Skind ?? record.SKind) } : {}), ...((record.Skind2 ?? record.SKind2) ? { skind2: String(record.Skind2 ?? record.SKind2) } : {}) };
    const fields = resolveEffectiveFields(config, path);
    for (const field of fields.filter((item) => item.required)) {
      if (record[field.key] === null || record[field.key] === undefined || record[field.key] === '') issues.push({ severity: 'error', code: 'mounted-data-required-field-missing', path: `mounted/${index}/${field.key}`, message: `已挂载数据缺少必填字段 ${field.key}。` });
    }
  }
  return { schemaVersion: 'cairnmap.config-validation-report.v2', valid: !issues.some((issue) => issue.severity === 'error'), createdAt: new Date().toISOString(), issues };
}

function profile(color: string, zLevel: number, interaction: GeometryProfile['interaction']['mode'] = 'standard'): GeometryProfile {
  return { enabled: true, allowMultipleParts: true, color, zLevel, labelOffset: 10, interactionPriority: zLevel, label: { visible: true, scope: 'featureBbox', conditions: [{ kind: 'zoomRange', min: 2 }] }, interaction: { mode: interaction } };
}

export function createBundledConfigPackage(): ConfigPackageV2 {
  return {
    schemaVersion: 'cairnmap.config-package.v2', packageId: 'cairnmap-config', projectId: 'default', revision: 1,
    displayName: { zh: '当前工程配置（v2 基准）', en: 'Current project configuration (v2 baseline)' },
    nodes: [
      { nodeId: 'class-rle', path: { class: 'RLE' }, children: [], policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' }, fields: [{ fieldId: 'rle-name', key: 'Name', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '线路名称', en: 'Line name' }, description: { zh: '线路显示名称', en: 'Line display name' } }], geometryProfiles: { LineString: profile('#2766e8', 320) }, card: [{ id: 'rle-name-card', source: 'Name', visible: true, renderer: 'nameColorCapsule' }] },
      { nodeId: 'class-sta', path: { class: 'STA' }, children: [], policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' }, fields: [{ fieldId: 'sta-name', key: 'Name', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '站点名称', en: 'Station name' }, description: { zh: '站点显示名称', en: 'Station display name' } }], geometryProfiles: { Point: profile('#e04747', 420) }, card: [{ id: 'sta-name-card', source: 'Name', visible: true, renderer: 'text' }] },
      { nodeId: 'class-bud', path: { class: 'BUD' }, children: [], policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' }, fields: [{ fieldId: 'bud-name', key: 'Name', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '建筑名称', en: 'Building name' }, description: { zh: '建筑显示名称', en: 'Building display name' } }], geometryProfiles: { Polygon: profile('#7c3aed', 360, 'building') }, card: [{ id: 'bud-name-card', source: 'Name', visible: true, renderer: 'text' }] },
    ],
    workflows: [{ id: 'standard-feature', label: { zh: '标准要素填卡', en: 'Standard feature form' }, target: { class: 'BUD' }, steps: [{ id: 'actor', kind: 'actor', label: { zh: '填写人', en: 'Author' } }, { id: 'form', kind: 'form', label: { zh: '基本信息', en: 'Basic information' }, controls: [{ id: 'name', kind: 'text', columns: 1, label: { zh: '建筑名称', en: 'Building name' }, binding: { target: 'field', path: 'Name' }, required: true }] }, { id: 'tail', kind: 'tagsExtensions', label: { zh: '标签与扩展', en: 'Tags and extensions' } }, { id: 'geometry', kind: 'geometry', label: { zh: '绘制', en: 'Geometry' }, geometry: ['Polygon'] }] }],
  };
}
