import { resolveClassDisplayRule } from './displayMetadata';
import { resolveDisplayAlgorithmsForClass } from './displayAlgorithmRegistry';
import type { CairnMapDisplayAlgorithmResolution } from './displayAlgorithmRegistry';
import type { CairnMapDisplayRuleAlgorithmRef } from './displayAlgorithmTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

function readAlgorithmRefs(value: unknown): CairnMapDisplayRuleAlgorithmRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ key: normalize((item as Record<string, unknown> | null)?.key), mode: normalize((item as Record<string, unknown> | null)?.mode) || undefined }))
    .filter((item) => item.key);
}

export function getDisplayAlgorithmRefsForClass(classCode: string): CairnMapDisplayRuleAlgorithmRef[] {
  const resolved = resolveClassDisplayRule(classCode);
  return readAlgorithmRefs((resolved?.rule as unknown as Record<string, unknown> | undefined)?.algorithms);
}

export function resolveDisplayAlgorithmRuntimeForClass(classCode: string): CairnMapDisplayAlgorithmResolution[] {
  const refs = getDisplayAlgorithmRefsForClass(classCode);
  return resolveDisplayAlgorithmsForClass(refs.map((item) => item.key), classCode);
}

export function hasUnresolvedDisplayAlgorithmsForClass(classCode: string): boolean {
  return resolveDisplayAlgorithmRuntimeForClass(classCode).some((item) => !item.registered || !item.allowedForClass);
}
