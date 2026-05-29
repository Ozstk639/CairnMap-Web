import type { CairnMapFormatRuntimeMode } from './formatTypes';

import formatRuntimeContractsConfigJson from '../../../project-config/presets/core-structures/shared/format/formatRuntimeContracts.json';

export type CairnMapFormatRuntimeContract = {
  classCode: string;
  sourceFeatureKey?: string;
  formatMode: CairnMapFormatRuntimeMode | string;
  formatterKey?: string;
  fallback?: 'legacy' | string;
  notes?: string;
};

export type CairnMapFormatRuntimeContractsConfig = {
  schemaVersion: string;
  projectId?: string;
  runtimeStatus?: string;
  items: CairnMapFormatRuntimeContract[];
};

export const OPENRIAMAP_RIA_FORMAT_RUNTIME_CONTRACTS_CONFIG =
  formatRuntimeContractsConfigJson as CairnMapFormatRuntimeContractsConfig;

const normalizeClassCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();

export function getFormatRuntimeContractsConfig(): CairnMapFormatRuntimeContractsConfig {
  return OPENRIAMAP_RIA_FORMAT_RUNTIME_CONTRACTS_CONFIG;
}

export function listFormatRuntimeContracts(): CairnMapFormatRuntimeContract[] {
  return OPENRIAMAP_RIA_FORMAT_RUNTIME_CONTRACTS_CONFIG.items ?? [];
}

export function getFormatRuntimeContractByClassCode(classCode: string): CairnMapFormatRuntimeContract | undefined {
  const normalized = normalizeClassCode(classCode);
  return listFormatRuntimeContracts().find((item) => normalizeClassCode(item.classCode) === normalized);
}

export function getFormatRuntimeModeByClassCode(classCode: string): string | undefined {
  return getFormatRuntimeContractByClassCode(classCode)?.formatMode;
}
