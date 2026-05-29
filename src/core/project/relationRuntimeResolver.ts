import {
  getRelationViewProfileById,
  listFloorViewRelationBindings,
  listRelationBindings,
  resolveRelationActionForBinding,
} from './relationMetadata';
import type { CairnMapRelationBindingItem } from './specialDisplayLogicTypes';
import type { CairnMapRelationViewProfileItem } from './relationTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export type CairnMapResolvedRelationBinding = {
  binding: CairnMapRelationBindingItem;
  actionKnown: boolean;
  actionAllowed: boolean;
  viewProfile: CairnMapRelationViewProfileItem | null;
  enableJump: boolean;
  displayField: string;
  returnField: string;
};

function resolveBinding(binding: CairnMapRelationBindingItem): CairnMapResolvedRelationBinding {
  const action = resolveRelationActionForBinding(binding);
  const viewProfile = binding.viewProfile ? getRelationViewProfileById(binding.viewProfile) : null;
  return {
    binding,
    actionKnown: action.known,
    actionAllowed: action.allowedForSourceClass && action.allowedForTargetClass,
    viewProfile,
    enableJump: binding.enableJump ?? viewProfile?.enableJump ?? true,
    displayField: binding.displayField || viewProfile?.displayField || 'Name',
    returnField: binding.returnField || viewProfile?.returnField || binding.targetField || 'ID',
  };
}

export function resolveRelationBindingsForClass(classCode: string): CairnMapResolvedRelationBinding[] {
  const normalized = normalizeClassCode(classCode);
  return listRelationBindings()
    .filter((binding) => normalizeClassCode(binding.sourceClass) === normalized || normalizeClassCode(binding.targetClass) === normalized)
    .map(resolveBinding);
}

export function resolveFloorViewBindingsForClass(classCode: string): CairnMapResolvedRelationBinding[] {
  const normalized = normalizeClassCode(classCode);
  return listFloorViewRelationBindings()
    .filter((binding) => normalizeClassCode(binding.sourceClass) === normalized || normalizeClassCode(binding.targetClass) === normalized)
    .map(resolveBinding);
}

export function listAllowedFloorViewParentClasses(): string[] {
  return Array.from(new Set(listFloorViewRelationBindings().map((binding) => normalizeClassCode(binding.targetClass))));
}
