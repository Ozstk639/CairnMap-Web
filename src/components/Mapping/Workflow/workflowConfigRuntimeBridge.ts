import { listWorkflowConfigs, getWorkflowRuntimeContractByWorkflowId } from '../../../core/project/workflowMetadata';
import { resolveWorkflowRuntimeByClassCode } from '../../../core/project/workflowRuntimeResolver';
import { getWorkflowFinalContractByClassCode } from '../../../core/project/workflowFinalRuntimeContracts';
import type { WorkflowKey, WorkflowRegistry } from './WorkflowHost';
import { buildConfigDrivenWorkflowRegistry, getWorkflowExecutorLabel } from './workflowComponentExecutorRegistry';

export type WorkflowSelectOption = { key: WorkflowKey; label: string; hidden?: boolean };

const WORKFLOW_ID_TO_KEY: Record<string, WorkflowKey> = {
  'rail-line-workflow': 'railway',
  'rail-station-workflow': 'station',
  'rail-platform-workflow': 'station',
  'rail-platform-boundary-workflow': 'station',
  'rail-station-building-workflow': 'station',
  'rail-station-building-point-workflow': 'station',
  'rail-station-building-floor-workflow': 'station',
  'teleport-workflow': 'tpp_point',
  'warp-workflow': 'wrp_point',
  'trade-point-workflow': 'trp_point',
  'road-workflow': 'rod_road',
  'generic-point-workflow': 'adm_point_special',
  'generic-line-workflow': 'adm_line_settlement',
  'generic-polygon-workflow': 'ngf_land',
  'building-workflow': 'bud_building',
  'floor-workflow': 'flr_unit',
};

const WORKFLOW_KEY_TO_CLASS_CODE: Partial<Record<WorkflowKey, string>> = {
  railway: 'RLE',
  station: 'STA',
  tpp_point: 'TPP',
  wrp_point: 'WRP',
  trp_point: 'TRP',
  rod_road: 'ROD',
  ngf_land: 'ISG',
  ngf_lis: 'ISG',
  ngf_wtb: 'ISG',
  ngf_wtr: 'ISL',
  ngf_bod: 'ISL',
  adm_dbz_set: 'ISG',
  adm_plz_plan: 'ISG',
  adm_line_settlement: 'ISL',
  adm_point_special: 'ISP',
  bud_building: 'BUD',
  flr_unit: 'FLR',
};

const WORKFLOW_KEY_PRIORITY: WorkflowKey[] = [
  'railway',
  'station',
  'rod_road',
  'bud_building',
  'flr_unit',
  'ngf_land',
  'ngf_lis',
  'ngf_wtb',
  'ngf_wtr',
  'adm_dbz_set',
  'adm_plz_plan',
  'tpp_point',
  'wrp_point',
  'trp_point',
  'ngf_bod',
  'adm_line_settlement',
  'adm_point_special',
];

const WORKFLOW_KEY_LABELS: Record<WorkflowKey, string> = {
  railway: '铁路',
  station: '车站和站台',
  tpp_point: '传送点',
  wrp_point: 'Warp点',
  trp_point: '交易点',
  rod_road: '道路',
  ngf_land: '自然要素-陆地',
  ngf_lis: '自然要素-陆面要素',
  ngf_wtb: '自然要素-水域',
  ngf_wtr: '自然要素-河道',
  ngf_bod: '自然要素-地理边界',
  adm_dbz_set: '聚落范围-确定范围',
  adm_plz_plan: '聚落范围-规划范围',
  adm_line_settlement: '聚落边界线要素',
  adm_point_special: '特殊人文点要素',
  bud_building: '建筑',
  flr_unit: '楼内单元',
};

const WORKFLOW_LEGACY_KEY_TO_KEY: Record<string, WorkflowKey> = {
  铁路: 'railway',
  车站: 'station',
  道路: 'rod_road',
  建筑: 'bud_building',
  楼内单元: 'flr_unit',
  传送点: 'tpp_point',
  Warp点: 'wrp_point',
  交易点: 'trp_point',
};

const reportedWorkflowRuntimeIssues = new Set<string>();

const normalize = (value: unknown): string => String(value ?? '').trim();

function reportWorkflowRuntimeIssueOnce(level: 'warn' | 'error', key: string, message: string, detail?: Record<string, unknown>): void {
  if (reportedWorkflowRuntimeIssues.has(key)) return;
  reportedWorkflowRuntimeIssues.add(key);
  const prefix = '[CairnMap Workflow Runtime]';
  if (level === 'error') console.error(`${prefix} ${message}`, detail ?? {});
  else console.warn(`${prefix} ${message}`, detail ?? {});
}

export function resolveWorkflowKeyForConfig(workflowId: string, legacyWorkflowKey?: string): WorkflowKey | null {
  const direct = WORKFLOW_ID_TO_KEY[normalize(workflowId)];
  if (direct) return direct;
  const legacy = WORKFLOW_LEGACY_KEY_TO_KEY[normalize(legacyWorkflowKey)];
  return legacy ?? null;
}

export function getClassCodeForWorkflowKey(workflowKey: WorkflowKey): string | null {
  return WORKFLOW_KEY_TO_CLASS_CODE[workflowKey] ?? null;
}

export function getConfigDrivenWorkflowSelectOptions(fallback: WorkflowSelectOption[]): WorkflowSelectOption[] {
  const fallbackByKey = new Map(fallback.map((item) => [item.key, item]));
  const keys = new Set<WorkflowKey>();

  for (const workflow of listWorkflowConfigs()) {
    const contract = getWorkflowRuntimeContractByWorkflowId(workflow.id);
    if (!contract) continue;
    const key = resolveWorkflowKeyForConfig(workflow.id, workflow.legacyWorkflowKey);
    if (key) keys.add(key);
  }

  if (keys.size === 0) return fallback;

  return WORKFLOW_KEY_PRIORITY.filter((key) => keys.has(key) || fallbackByKey.has(key)).map((key) => ({
    key,
    label: fallbackByKey.get(key)?.label ?? WORKFLOW_KEY_LABELS[key] ?? key,
    hidden: fallbackByKey.get(key)?.hidden,
  }));
}

function validateWorkflowRuntimeForKey(workflowKey: WorkflowKey, registry: WorkflowRegistry): void {
  const classCode = getClassCodeForWorkflowKey(workflowKey);
  if (!classCode) return;

  const runtime = resolveWorkflowRuntimeByClassCode(classCode);
  const finalContract = getWorkflowFinalContractByClassCode(classCode);
  if (!runtime || !finalContract?.definitionPrimary) {
    reportWorkflowRuntimeIssueOnce(
      'error',
      `${workflowKey}:missing-config-runtime`,
      `Workflow key ${workflowKey} does not have a config-primary runtime contract. Falling back to legacy registry.`,
      { workflowKey, classCode, fallback: 'legacy workflow component' },
    );
    return;
  }

  if (!registry[workflowKey]) {
    reportWorkflowRuntimeIssueOnce(
      'error',
      `${workflowKey}:missing-component-executor`,
      `Workflow key ${workflowKey} has a config runtime contract but no TS component executor is registered.`,
      { workflowKey, classCode, workflowId: runtime.workflowId },
    );
  }
}

export function getConfigDrivenWorkflowRegistry(registry: WorkflowRegistry): WorkflowRegistry {
  for (const key of WORKFLOW_KEY_PRIORITY) validateWorkflowRuntimeForKey(key, registry);
  return buildConfigDrivenWorkflowRegistry(registry);
}

export function describeWorkflowRuntimeSelection(workflowKey: WorkflowKey): string {
  const classCode = getClassCodeForWorkflowKey(workflowKey);
  const runtime = classCode ? resolveWorkflowRuntimeByClassCode(classCode) : null;
  const executorLabel = getWorkflowExecutorLabel(workflowKey);
  if (executorLabel) return executorLabel;
  if (runtime?.workflow?.label) return runtime.workflow.label;
  return WORKFLOW_KEY_LABELS[workflowKey] ?? workflowKey;
}
