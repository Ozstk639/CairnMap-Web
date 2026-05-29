export type CairnMapDisplayRuntimeStatus = 'shadow' | 'active' | 'deprecated' | string;

export type CairnMapDisplayMatch = {
  classCode: string;
  kind?: string | string[];
  skind?: string | string[];
  skind2?: string | string[];
};

export type CairnMapDisplayRuleLabel = {
  enabled?: boolean;
  source?: string;
  styleKey?: string;
};

export type CairnMapDisplayRuleGeometry = {
  render?: string;
};

export type CairnMapDisplaySpecialLogic = {
  key: string;
  mode?: string;
};

export type CairnMapDisplayBinding = {
  key: string;
  targetClass?: string;
  sourceField?: string;
  targetField?: string;
};

export type CairnMapDisplayRule = {
  id: string;
  runtimeStatus?: CairnMapDisplayRuntimeStatus;
  match: CairnMapDisplayMatch;
  profile: string;
  displayTier?: string;
  geometry?: CairnMapDisplayRuleGeometry;
  label?: CairnMapDisplayRuleLabel;
  style?: Record<string, unknown>;
  specialLogic?: CairnMapDisplaySpecialLogic[];
  bindings?: CairnMapDisplayBinding[];
  notes?: string;
};

export type CairnMapDisplayProfileConfig = {
  id: string;
  label?: string;
  displayTier?: string;
  runtimeStatus?: CairnMapDisplayRuntimeStatus;
  sourceRuntimeProfile?: string;
  notes?: string;
};

export type CairnMapLabelStyleConfig = {
  id: string;
  label?: string;
  runtimeStatus?: CairnMapDisplayRuntimeStatus;
  sourceRuntimeKey?: string;
  sourceRuntimePattern?: string;
  family?: string;
  notes?: string;
};

export type CairnMapResolvedClassDisplay = {
  classCode: string;
  rules: CairnMapDisplayRule[];
  primaryRule: CairnMapDisplayRule | null;
};

export type CairnMapLabelStyleResolveMode = 'id' | 'sourceRuntimeKey' | 'sourceRuntimePattern' | 'missing' | 'none';

export type CairnMapResolvedLabelStyle = {
  labelStyle: CairnMapLabelStyleConfig | null;
  resolvedBy: CairnMapLabelStyleResolveMode;
};

export type CairnMapResolvedDisplayRule = {
  classCode: string;
  rule: CairnMapDisplayRule;
  profile: CairnMapDisplayProfileConfig | null;
  labelStyle: CairnMapLabelStyleConfig | null;
  labelStyleResolvedBy: CairnMapLabelStyleResolveMode;
};

export type CairnMapDisplayRuleMetadata = {
  classCode: string;
  ruleId: string;
  profileId: string;
  displayTier?: string;
  geometryRender?: string;
  labelEnabled: boolean;
  labelSource?: string;
  labelStyleKey?: string;
  specialLogicKeys: string[];
  bindingKeys: string[];
  runtimeStatus?: CairnMapDisplayRuntimeStatus;
};
