import type {
  CairnMapRelationBindingDirection,
  CairnMapRelationBindingItem,
  CairnMapSpecialDisplayLogicItem,
  CairnMapResolvedSpecialLogic,
} from './specialDisplayLogicTypes';
import {
  getOpenRIAMapRelationBindingsConfig,
  getOpenRIAMapSpecialDisplayLogicConfig,
} from './openriamapRiaShared';

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export function listSpecialDisplayLogicDefs(): CairnMapSpecialDisplayLogicItem[] {
  return getOpenRIAMapSpecialDisplayLogicConfig().items;
}

export function getSpecialDisplayLogicDef(key: string): CairnMapSpecialDisplayLogicItem | null {
  const normalized = normalize(key);
  if (!normalized) return null;
  return (
    listSpecialDisplayLogicDefs().find((item) => item.logicKey === normalized || item.id === normalized) ?? null
  );
}

export function isKnownSpecialDisplayLogicKey(key: string): boolean {
  return Boolean(getSpecialDisplayLogicDef(key));
}

export function isSpecialDisplayLogicAllowedForClass(key: string, classCode: string): boolean {
  const definition = getSpecialDisplayLogicDef(key);
  if (!definition) return false;
  const allowedClasses = Array.isArray(definition.allowedClasses)
    ? definition.allowedClasses.map(normalizeClassCode).filter(Boolean)
    : [];
  if (!allowedClasses.length) return true;
  return allowedClasses.includes(normalizeClassCode(classCode));
}

export function resolveSpecialDisplayLogicForClass(
  classCode: string,
  keys: string[]
): CairnMapResolvedSpecialLogic[] {
  const normalizedClassCode = normalizeClassCode(classCode);
  return keys
    .map((key) => normalize(key))
    .filter(Boolean)
    .map((key) => {
      const definition = getSpecialDisplayLogicDef(key);
      return {
        key,
        definition,
        known: Boolean(definition),
        allowedForClass: definition ? isSpecialDisplayLogicAllowedForClass(key, normalizedClassCode) : false,
        runtimeStatus: definition?.runtimeStatus,
      };
    });
}

export function listRelationBindings(): CairnMapRelationBindingItem[] {
  return getOpenRIAMapRelationBindingsConfig().items;
}

export function getRelationBindingById(id: string): CairnMapRelationBindingItem | null {
  const normalized = normalize(id);
  if (!normalized) return null;
  return listRelationBindings().find((item) => item.id === normalized) ?? null;
}

export function listRelationBindingsByKey(bindingKey: string): CairnMapRelationBindingItem[] {
  const normalized = normalize(bindingKey);
  if (!normalized) return [];
  return listRelationBindings().filter((item) => item.bindingKey === normalized);
}

export function listRelationBindingsBySourceClass(classCode: string): CairnMapRelationBindingItem[] {
  const normalized = normalizeClassCode(classCode);
  if (!normalized) return [];
  return listRelationBindings().filter((item) => normalizeClassCode(item.sourceClass) === normalized);
}

export function listRelationBindingsByTargetClass(classCode: string): CairnMapRelationBindingItem[] {
  const normalized = normalizeClassCode(classCode);
  if (!normalized) return [];
  return listRelationBindings().filter((item) => normalizeClassCode(item.targetClass) === normalized);
}

export function listRelationBindingsForClass(
  classCode: string,
  direction: CairnMapRelationBindingDirection = 'either'
): CairnMapRelationBindingItem[] {
  if (direction === 'source') return listRelationBindingsBySourceClass(classCode);
  if (direction === 'target') return listRelationBindingsByTargetClass(classCode);

  const normalized = normalizeClassCode(classCode);
  if (!normalized) return [];
  return listRelationBindings().filter(
    (item) => normalizeClassCode(item.sourceClass) === normalized || normalizeClassCode(item.targetClass) === normalized
  );
}
