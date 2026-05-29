import {
  getOpenRIAMapRelationActionsConfig,
  getOpenRIAMapRelationBindingsConfig,
  getOpenRIAMapRelationViewProfilesConfig,
} from './openriamapRiaShared';
import type { CairnMapRelationBindingItem } from './specialDisplayLogicTypes';
import type {
  CairnMapRelationActionItem,
  CairnMapRelationViewProfileItem,
  CairnMapResolvedRelationAction,
} from './relationTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export function listRelationActions(): CairnMapRelationActionItem[] {
  return getOpenRIAMapRelationActionsConfig().items ?? [];
}

export function getRelationActionByKey(key: string): CairnMapRelationActionItem | null {
  const normalized = normalize(key);
  if (!normalized) return null;
  return listRelationActions().find((item) => item.actionKey === normalized || item.id === normalized) ?? null;
}

export function listRelationViewProfiles(): CairnMapRelationViewProfileItem[] {
  return getOpenRIAMapRelationViewProfilesConfig().items ?? [];
}

export function getRelationViewProfileById(id: string): CairnMapRelationViewProfileItem | null {
  const normalized = normalize(id);
  if (!normalized) return null;
  return listRelationViewProfiles().find((item) => item.id === normalized) ?? null;
}

export function listRelationBindings(): CairnMapRelationBindingItem[] {
  return getOpenRIAMapRelationBindingsConfig().items ?? [];
}

export function resolveRelationActionForBinding(binding: CairnMapRelationBindingItem): CairnMapResolvedRelationAction {
  const key = normalize(binding.actionKey || binding.bindingKey);
  const definition = getRelationActionByKey(key);
  const sourceClass = normalizeClassCode(binding.sourceClass);
  const targetClass = normalizeClassCode(binding.targetClass);
  const sourceAllowed = !definition?.allowedSourceClasses?.length
    || definition.allowedSourceClasses.map(normalizeClassCode).includes(sourceClass);
  const targetAllowed = !definition?.allowedTargetClasses?.length
    || definition.allowedTargetClasses.map(normalizeClassCode).includes(targetClass);

  return {
    key,
    definition,
    known: Boolean(definition),
    allowedForSourceClass: Boolean(definition) && sourceAllowed,
    allowedForTargetClass: Boolean(definition) && targetAllowed,
  };
}

export function listRelationBindingsByActionKey(actionKey: string): CairnMapRelationBindingItem[] {
  const normalized = normalize(actionKey);
  return listRelationBindings().filter((item) => normalize(item.actionKey || item.bindingKey) === normalized);
}

export function listFloorViewRelationBindings(): CairnMapRelationBindingItem[] {
  return listRelationBindingsByActionKey('floorViewBinding');
}
