import { getOpenRIAMapClassConfigs } from './openriamapRiaClasses';
import type {
  CairnMapCardEnhancementsConfig,
  CairnMapCardLayoutsConfig,
  CairnMapCardRuntimeContractsConfig,
  CairnMapCardRuntimeContractItem,
  CairnMapCardLayoutConfigItem,
  CairnMapClassCardConfig,
} from './cardTypes';

import cardLayoutsConfigJson from '../../../project-config/presets/core-structures/shared/card/cardLayouts.json';
import cardEnhancementsConfigJson from '../../../project-config/presets/core-structures/shared/card/cardEnhancements.json';
import cardRuntimeContractsConfigJson from '../../../project-config/presets/core-structures/shared/card/cardRuntimeContracts.json';

const normalize = (value: unknown): string => String(value ?? '').trim();

export function getOpenRIAMapCardLayoutsConfig(): CairnMapCardLayoutsConfig {
  return cardLayoutsConfigJson as CairnMapCardLayoutsConfig;
}

export function getOpenRIAMapCardEnhancementsConfig(): CairnMapCardEnhancementsConfig {
  return cardEnhancementsConfigJson as CairnMapCardEnhancementsConfig;
}

export function getOpenRIAMapCardRuntimeContractsConfig(): CairnMapCardRuntimeContractsConfig {
  return cardRuntimeContractsConfigJson as CairnMapCardRuntimeContractsConfig;
}

export function listCardLayouts(): CairnMapCardLayoutConfigItem[] {
  return getOpenRIAMapCardLayoutsConfig().items ?? [];
}

export function getCardLayoutById(layoutId: string): CairnMapCardLayoutConfigItem | null {
  const id = normalize(layoutId);
  if (!id) return null;
  return listCardLayouts().find((item) => normalize(item.id) === id) ?? null;
}

export function getCardEnhancementByKey(key: string) {
  const id = normalize(key);
  if (!id) return null;
  return (getOpenRIAMapCardEnhancementsConfig().items ?? []).find((item) => normalize(item.id) === id) ?? null;
}

export function getCardRuntimeContractByClassCode(classCode: string): CairnMapCardRuntimeContractItem | null {
  const code = normalize(classCode).toUpperCase();
  if (!code) return null;
  return (getOpenRIAMapCardRuntimeContractsConfig().items ?? []).find((item) => normalize(item.classCode).toUpperCase() === code) ?? null;
}

export function getClassCardConfigByCode(classCode: string): CairnMapClassCardConfig | null {
  const code = normalize(classCode).toUpperCase();
  const cls = getOpenRIAMapClassConfigs().find((item) => normalize(item.classCode).toUpperCase() === code);
  return (cls?.card ?? null) as CairnMapClassCardConfig | null;
}

export function resolveClassCardLayoutId(classCode: string): string | null {
  const classCard = getClassCardConfigByCode(classCode);
  const fromClass = normalize(classCard?.layoutId);
  if (fromClass) return fromClass;
  return normalize(getCardRuntimeContractByClassCode(classCode)?.layoutId) || null;
}
