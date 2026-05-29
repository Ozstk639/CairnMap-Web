import { getOpenRIAMapCardEnhancementsConfig } from './cardMetadata';

const normalize = (value: unknown): string => String(value ?? '').trim();

export function listCardEnhancementConfigs() {
  return getOpenRIAMapCardEnhancementsConfig().items ?? [];
}

export function getCardEnhancementConfig(key: string) {
  const id = normalize(key);
  return listCardEnhancementConfigs().find((item) => normalize(item.id) === id) ?? null;
}

export function isCardEnhancementAllowedForClass(key: string, classCode: string): boolean {
  const cfg = getCardEnhancementConfig(key);
  if (!cfg) return false;
  const allowed = cfg.allowedClasses ?? [];
  if (allowed.includes('*')) return true;
  return allowed.map((item) => normalize(item).toUpperCase()).includes(normalize(classCode).toUpperCase());
}
