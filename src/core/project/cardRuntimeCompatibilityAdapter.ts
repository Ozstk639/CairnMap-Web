import { resolveCardRuntimeLayout } from './cardRuntimeResolver';

export function describeCardRuntimeCompatibility(classCode: string): {
  classCode: string;
  layoutId: string | null;
  runtimeMode: string;
  role: 'config-primary' | 'special-card' | 'legacy-fallback';
} {
  const resolved = resolveCardRuntimeLayout(classCode);
  if (!resolved) {
    return { classCode, layoutId: null, runtimeMode: 'legacyFallback', role: 'legacy-fallback' };
  }
  if (resolved.runtimeMode === 'specialCardPrimary') {
    return { classCode, layoutId: resolved.layoutId, runtimeMode: resolved.runtimeMode, role: 'special-card' };
  }
  if (resolved.runtimeMode === 'configPrimary') {
    return { classCode, layoutId: resolved.layoutId, runtimeMode: resolved.runtimeMode, role: 'config-primary' };
  }
  return { classCode, layoutId: resolved.layoutId, runtimeMode: resolved.runtimeMode, role: 'legacy-fallback' };
}
