import workflowBlocksConfigJson from '../../../project-config/presets/core-structures/shared/workflow/workflowBlocks.json';
import workflowRuntimeContractsConfigJson from '../../../project-config/presets/core-structures/shared/workflow/workflowRuntimeContracts.json';
import workflowParityProfilesConfigJson from '../../../project-config/presets/core-structures/shared/workflow/workflowParityProfiles.json';
import { getOpenRIAMapWorkflowConfigByClassCode, getOpenRIAMapWorkflowConfigById, getOpenRIAMapWorkflowConfigs } from './openriamapRiaWorkflows';
import type {
  CairnMapWorkflowBlockDefinition,
  CairnMapWorkflowBlocksConfig,
  CairnMapWorkflowConfig,
  CairnMapWorkflowRuntimeContractItem,
  CairnMapWorkflowRuntimeContractsConfig,
  CairnMapWorkflowParityProfileItem,
  CairnMapWorkflowParityProfilesConfig,
} from './workflowTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

export function getOpenRIAMapWorkflowBlocksConfig(): CairnMapWorkflowBlocksConfig {
  return workflowBlocksConfigJson as CairnMapWorkflowBlocksConfig;
}

export function getOpenRIAMapWorkflowRuntimeContractsConfig(): CairnMapWorkflowRuntimeContractsConfig {
  return workflowRuntimeContractsConfigJson as CairnMapWorkflowRuntimeContractsConfig;
}

export function getOpenRIAMapWorkflowParityProfilesConfig(): CairnMapWorkflowParityProfilesConfig {
  return workflowParityProfilesConfigJson as CairnMapWorkflowParityProfilesConfig;
}

export function listWorkflowConfigs(): CairnMapWorkflowConfig[] {
  return getOpenRIAMapWorkflowConfigs();
}

export function getWorkflowConfigById(workflowId: string): CairnMapWorkflowConfig | null {
  return getOpenRIAMapWorkflowConfigById(workflowId);
}

export function getWorkflowConfigByClassCode(classCode: string): CairnMapWorkflowConfig | null {
  return getOpenRIAMapWorkflowConfigByClassCode(classCode);
}

export function listWorkflowBlockDefinitions(): CairnMapWorkflowBlockDefinition[] {
  return getOpenRIAMapWorkflowBlocksConfig().items ?? [];
}

export function getWorkflowBlockDefinition(blockType: string): CairnMapWorkflowBlockDefinition | null {
  const type = normalize(blockType);
  return listWorkflowBlockDefinitions().find((item) => normalize(item.id) === type) ?? null;
}

export function getWorkflowRuntimeContractByClassCode(classCode: string): CairnMapWorkflowRuntimeContractItem | null {
  const code = normalize(classCode).toUpperCase();
  return (getOpenRIAMapWorkflowRuntimeContractsConfig().items ?? []).find((item) => normalize(item.classCode).toUpperCase() === code) ?? null;
}

export function getWorkflowRuntimeContractByWorkflowId(workflowId: string): CairnMapWorkflowRuntimeContractItem | null {
  const id = normalize(workflowId);
  return (getOpenRIAMapWorkflowRuntimeContractsConfig().items ?? []).find((item) => normalize(item.workflowId) === id) ?? null;
}

export function isWorkflowConfigPrimary(classCode: string): boolean {
  const mode = getWorkflowRuntimeContractByClassCode(classCode)?.runtimeMode;
  return mode === 'configPrimary' || mode === 'specialComponentPrimary';
}

export function listWorkflowParityProfiles(): CairnMapWorkflowParityProfileItem[] {
  return getOpenRIAMapWorkflowParityProfilesConfig().items ?? [];
}

export function getWorkflowParityProfileByWorkflowId(workflowId: string): CairnMapWorkflowParityProfileItem | null {
  const id = normalize(workflowId);
  return listWorkflowParityProfiles().find((item) => normalize(item.workflowId) === id) ?? null;
}
