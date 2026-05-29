import workflowFinalContractsJson from '../../../project-config/presets/core-structures/shared/workflow/workflowFinalContracts.json';
import type { CairnMapSharedTaggedConfig } from './sharedTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapWorkflowFinalContractItem = {
  classCode: string;
  workflowId: string;
  runtimeMode: string;
  definitionPrimary?: boolean;
  componentExecutor?: string | null;
  legacyFallback?: boolean;
};

export type CairnMapWorkflowFinalContractsConfig = CairnMapSharedTaggedConfig & {
  runtimeStatus?: 'completed' | 'active' | 'shadow' | string;
  definitionSource?: string;
  legacyRole?: string;
  items: CairnMapWorkflowFinalContractItem[];
};

export function getWorkflowFinalContractsConfig(): CairnMapWorkflowFinalContractsConfig {
  return workflowFinalContractsJson as CairnMapWorkflowFinalContractsConfig;
}

export function listWorkflowFinalContracts(): CairnMapWorkflowFinalContractItem[] {
  return getWorkflowFinalContractsConfig().items ?? [];
}

export function getWorkflowFinalContractByClassCode(classCode: string): CairnMapWorkflowFinalContractItem | null {
  const code = normalize(classCode).toUpperCase();
  return listWorkflowFinalContracts().find((item) => normalize(item.classCode).toUpperCase() === code) ?? null;
}

export function isWorkflowDefinitionConfigPrimary(classCode: string): boolean {
  return getWorkflowFinalContractByClassCode(classCode)?.definitionPrimary === true;
}
