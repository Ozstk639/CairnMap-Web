import { getCardLayoutById, getCardRuntimeContractByClassCode, resolveClassCardLayoutId } from './cardMetadata';
import type { CairnMapCardLayoutItem, CairnMapCardRuntimeMode } from './cardTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapResolvedCardRuntimeLayout = {
  classCode: string;
  layoutId: string;
  runtimeMode: CairnMapCardRuntimeMode;
  legacyFallback: boolean;
  items: CairnMapCardLayoutItem[];
};

export function resolveCardRuntimeLayout(classCode: string): CairnMapResolvedCardRuntimeLayout | null {
  const code = normalize(classCode).toUpperCase();
  if (!code) return null;
  const contract = getCardRuntimeContractByClassCode(code);
  const layoutId = resolveClassCardLayoutId(code);
  if (!layoutId) return null;
  const layout = getCardLayoutById(layoutId);
  if (!layout) return null;
  return {
    classCode: code,
    layoutId,
    runtimeMode: contract?.runtimeMode ?? 'shadow',
    legacyFallback: contract?.legacyFallback !== false,
    items: layout.items ?? [],
  };
}

export function resolveCardRuntimeCardLayout(args: { classCode?: string }): { items: CairnMapCardLayoutItem[] } | null {
  const resolved = resolveCardRuntimeLayout(args.classCode ?? '');
  if (!resolved || resolved.items.length <= 0) return null;
  return { items: resolved.items };
}

export function isCardRuntimeConfigPrimary(classCode: string): boolean {
  const mode = resolveCardRuntimeLayout(classCode)?.runtimeMode;
  return mode === 'configPrimary' || mode === 'specialCardPrimary';
}
