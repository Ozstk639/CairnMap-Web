import { listRelationViewProfiles } from './relationMetadata';
import type { CairnMapCardFeatureLinkTarget } from './cardTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

const firstViewProfileForAction = (actionKey: string) => {
  const key = normalize(actionKey);
  if (!key) return null;
  return listRelationViewProfiles().find((item) => normalize(item.actionKey) === key) ?? null;
};

export function buildCardFeatureLinkTargetFromRelation(args: {
  relationActionKey?: string;
  targetClass?: string;
  targetClassScope?: string[];
  matchField?: string;
  displayField?: string;
  returnField?: string;
}): CairnMapCardFeatureLinkTarget | null {
  const actionKey = normalize(args.relationActionKey);
  const profile = actionKey ? firstViewProfileForAction(actionKey) : null;
  const classCode = normalize(args.targetClass || args.targetClassScope?.[0] || profile?.targetClassScope?.[0] || '');
  if (!classCode) return null;
  return {
    classCode,
    matchField: normalize(args.matchField || args.returnField || profile?.returnField || profile?.targetField || 'ID') || 'ID',
    displayField: normalize(args.displayField || profile?.displayField || 'Name') || 'Name',
    fallbackDisplay: 'raw',
  };
}

export function listCardRelationViewProfiles() {
  return listRelationViewProfiles();
}
