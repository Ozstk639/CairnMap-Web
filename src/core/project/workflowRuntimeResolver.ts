import { getWorkflowConfigByClassCode, getWorkflowRuntimeContractByClassCode } from './workflowMetadata';
import { getWorkflowOutputRuntimeSummary } from './workflowOutputAssembler';
import { getWorkflowPageRuntimeSummary } from './workflowPageRuntime';
import type { CairnMapWorkflowConfig, CairnMapWorkflowRuntimeMode } from './workflowTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapResolvedWorkflowRuntime = {
  classCode: string;
  workflowId: string;
  runtimeMode: CairnMapWorkflowRuntimeMode;
  legacyFallback: boolean;
  workflow: CairnMapWorkflowConfig;
  pageSummary: ReturnType<typeof getWorkflowPageRuntimeSummary>;
  outputSummary: ReturnType<typeof getWorkflowOutputRuntimeSummary>;
};

export function resolveWorkflowRuntimeByClassCode(classCode: string): CairnMapResolvedWorkflowRuntime | null {
  const code = normalize(classCode).toUpperCase();
  if (!code) return null;
  const contract = getWorkflowRuntimeContractByClassCode(code);
  const workflow = getWorkflowConfigByClassCode(code);
  if (!contract || !workflow) return null;
  return {
    classCode: code,
    workflowId: workflow.id,
    runtimeMode: contract.runtimeMode,
    legacyFallback: contract.legacyFallback !== false,
    workflow,
    pageSummary: getWorkflowPageRuntimeSummary(workflow),
    outputSummary: getWorkflowOutputRuntimeSummary(workflow),
  };
}

export function isWorkflowRuntimeConfigPrimary(classCode: string): boolean {
  const runtime = resolveWorkflowRuntimeByClassCode(classCode);
  return runtime?.runtimeMode === 'configPrimary' || runtime?.runtimeMode === 'specialComponentPrimary';
}

export function getWorkflowRuntimeMode(classCode: string): CairnMapWorkflowRuntimeMode | null {
  return resolveWorkflowRuntimeByClassCode(classCode)?.runtimeMode ?? null;
}
