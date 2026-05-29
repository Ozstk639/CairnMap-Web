export type CairnMapSpecialRuntimeStatus = 'shadow' | 'diagnostic' | 'active' | 'disabled' | string;

export type CairnMapSpecialDisplayLogicItem = {
  id: string;
  logicKey: string;
  label?: string;
  category?: string;
  allowedClasses?: string[];
  runtimeStatus?: CairnMapSpecialRuntimeStatus;
  defaultEnabled?: boolean;
  description?: string;
  paramsSchema?: Record<string, unknown>;
  notes?: string;
};

export type CairnMapSpecialDisplayLogicConfig = {
  schemaVersion: string;
  projectId?: string;
  items: CairnMapSpecialDisplayLogicItem[];
};

export type CairnMapRelationBindingItem = {
  id: string;
  bindingKey: string;
  sourceClass: string;
  targetClass: string;
  sourceField: string;
  targetField: string;
  runtimeStatus?: CairnMapSpecialRuntimeStatus;
  mode?: string;
  actionKey?: string;
  viewProfile?: string;
  sourceRole?: string;
  targetRole?: string;
  targetClassScope?: string[];
  returnField?: string;
  displayField?: string;
  enableJump?: boolean;
  description?: string;
  notes?: string;
};

export type CairnMapRelationBindingsConfig = {
  schemaVersion: string;
  projectId?: string;
  items: CairnMapRelationBindingItem[];
};

export type CairnMapResolvedSpecialLogic = {
  key: string;
  definition: CairnMapSpecialDisplayLogicItem | null;
  known: boolean;
  allowedForClass: boolean;
  runtimeStatus?: CairnMapSpecialRuntimeStatus;
};

export type CairnMapRelationBindingDirection = 'source' | 'target' | 'either';
