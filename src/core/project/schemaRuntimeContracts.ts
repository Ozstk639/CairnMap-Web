import type {
  CairnMapSchemaRuntimeContract,
  CairnMapSchemaRuntimeContractsConfig,
} from './schemaTypes';

import schemaRuntimeContractsConfigJson from '../../../project-config/presets/core-structures/shared/format/schemaRuntimeContracts.json';

export const OPENRIAMAP_RIA_SCHEMA_RUNTIME_CONTRACTS_CONFIG =
  schemaRuntimeContractsConfigJson as CairnMapSchemaRuntimeContractsConfig;

const normalizeClassCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();

export function getSchemaRuntimeContractsConfig(): CairnMapSchemaRuntimeContractsConfig {
  return OPENRIAMAP_RIA_SCHEMA_RUNTIME_CONTRACTS_CONFIG;
}

export function listSchemaRuntimeContracts(): CairnMapSchemaRuntimeContract[] {
  return OPENRIAMAP_RIA_SCHEMA_RUNTIME_CONTRACTS_CONFIG.items ?? [];
}

export function getSchemaRuntimeContractByClassCode(
  classCode: string
): CairnMapSchemaRuntimeContract | undefined {
  const normalized = normalizeClassCode(classCode);
  return listSchemaRuntimeContracts().find((item) => normalizeClassCode(item.classCode) === normalized);
}
