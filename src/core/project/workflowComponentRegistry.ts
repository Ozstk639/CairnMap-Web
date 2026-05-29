import workflowComponentsConfigJson from '../../../project-config/presets/core-structures/shared/workflow/workflowComponents.json';
import type { CairnMapSharedTaggedConfig } from './sharedTypes';

export type CairnMapWorkflowComponentConfigItem = {
  id: string;
  componentKey: string;
  label?: string;
  allowedClasses?: string[];
  dataPath?: string;
  runtimeStatus?: string;
};

export type CairnMapWorkflowComponentsConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapWorkflowComponentConfigItem[];
};

const normalize = (value: unknown): string => String(value ?? '').trim();

export function getOpenRIAMapWorkflowComponentsConfig(): CairnMapWorkflowComponentsConfig {
  return workflowComponentsConfigJson as CairnMapWorkflowComponentsConfig;
}

export function listWorkflowComponentConfigs(): CairnMapWorkflowComponentConfigItem[] {
  return getOpenRIAMapWorkflowComponentsConfig().items ?? [];
}

export function getWorkflowComponentByKey(componentKey: string): CairnMapWorkflowComponentConfigItem | null {
  const key = normalize(componentKey);
  if (!key) return null;
  return listWorkflowComponentConfigs().find((item) => normalize(item.componentKey) === key || normalize(item.id) === key) ?? null;
}

export function isWorkflowComponentAllowedForClass(componentKey: string, classCode: string): boolean {
  const component = getWorkflowComponentByKey(componentKey);
  if (!component) return false;
  const allowed = component.allowedClasses ?? [];
  if (allowed.length === 0) return true;
  const code = normalize(classCode).toUpperCase();
  return allowed.map((item) => normalize(item).toUpperCase()).includes(code);
}
