import renderFormatFinalContractsJson from '../../../project-config/presets/core-structures/shared/common/renderFormatFinalContracts.json';

import type {
  CairnMapRenderFormatFinalContractItem,
  CairnMapRenderFormatFinalContractsConfig,
} from './renderFormatFinalTypes';

const normalizeClassCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();

export const OPENRIAMAP_RIA_RENDER_FORMAT_FINAL_CONTRACTS_CONFIG =
  renderFormatFinalContractsJson as CairnMapRenderFormatFinalContractsConfig;

export function getRenderFormatFinalContractsConfig(): CairnMapRenderFormatFinalContractsConfig {
  return OPENRIAMAP_RIA_RENDER_FORMAT_FINAL_CONTRACTS_CONFIG;
}

export function listRenderFormatFinalContracts(): CairnMapRenderFormatFinalContractItem[] {
  return OPENRIAMAP_RIA_RENDER_FORMAT_FINAL_CONTRACTS_CONFIG.items ?? [];
}

export function getRenderFormatFinalContractByClassCode(
  classCode: string,
): CairnMapRenderFormatFinalContractItem | undefined {
  const normalized = normalizeClassCode(classCode);
  return listRenderFormatFinalContracts().find((item) => normalizeClassCode(item.classCode) === normalized);
}

export function isRenderFormatConfigOwnedClass(classCode: string): boolean {
  const contract = getRenderFormatFinalContractByClassCode(classCode);
  return contract?.displaySource === 'config' && contract.formatSource === 'config' && contract.schemaSource === 'config';
}
