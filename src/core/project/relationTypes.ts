export type CairnMapRelationRuntimeStatus = 'shadow' | 'diagnostic' | 'active' | 'disabled' | string;

export type CairnMapRelationRole =
  | 'generic'
  | 'source'
  | 'target'
  | 'parentSurface'
  | 'floorSurface'
  | string;

export type CairnMapRelationActionItem = {
  id: string;
  actionKey: string;
  label?: string;
  description?: string;
  roles?: CairnMapRelationRole[];
  allowedSourceClasses?: string[];
  allowedTargetClasses?: string[];
  paramsSchema?: Record<string, unknown>;
};

export type CairnMapRelationActionsConfig = {
  schemaVersion: string;
  projectId?: string;
  items: CairnMapRelationActionItem[];
};

export type CairnMapRelationViewProfileItem = {
  id: string;
  actionKey: string;
  role?: CairnMapRelationRole;
  sourceClassScope?: string[];
  targetClassScope?: string[];
  sourceField?: string;
  sourceFieldCandidates?: string[];
  targetField?: string;
  targetFieldCandidates?: string[];
  searchFields?: string[];
  returnField?: string;
  displayField?: string;
  enableJump?: boolean;
  optional?: boolean;
  description?: string;
};

export type CairnMapRelationViewProfilesConfig = {
  schemaVersion: string;
  projectId?: string;
  items: CairnMapRelationViewProfileItem[];
};

export type CairnMapResolvedRelationAction = {
  key: string;
  definition: CairnMapRelationActionItem | null;
  known: boolean;
  allowedForSourceClass: boolean;
  allowedForTargetClass: boolean;
};
