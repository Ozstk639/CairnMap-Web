export type CairnMapLocalizedLabel = string | {
  'zh-CN'?: string;
  en?: string;
  [locale: string]: string | undefined;
};

export type CairnMapClassRuntimeStatus = 'shadow' | 'active' | 'deprecated';
export type CairnMapClassGeometryType = 'Point' | 'LineString' | 'Polygon';
export type CairnMapClassAxisOrder = 'x,z,y' | 'x,y,z' | string;

export type CairnMapClassDataConfig = {
  typeField: string;
  classField: string;
  worldField: string;
  defaultType: 'Points' | 'Polyline' | 'Polygon' | string;
  defaultClass: string;
};

export type CairnMapClassGeometryConfig = {
  type: CairnMapClassGeometryType;
  sourceField: string;
  axisOrder: CairnMapClassAxisOrder;
  required?: boolean;
};

export type CairnMapClassIdentityConfig = {
  idField: string;
  nameField?: string;
  displayNameField?: string;
};

export type CairnMapClassFieldOption = {
  label: string;
  value: unknown;
};

export type CairnMapClassFieldScenes = {
  workflow?: boolean;
  editor?: boolean;
  infocard?: boolean;
  search?: boolean;
};

export type CairnMapClassFieldType = 'text' | 'number' | 'select' | 'bool' | 'featureRef' | string;

export type CairnMapFeatureRefConfig = {
  classCode: string;
  matchField: string;
  displayField?: string;
};

export type CairnMapClassFieldConfig = {
  key: string;
  label: CairnMapLocalizedLabel;
  type: CairnMapClassFieldType;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: CairnMapClassFieldOption[];
  sourceRuntimeField?: string;
  scenes?: CairnMapClassFieldScenes;
  ref?: CairnMapFeatureRefConfig;
  notes?: string;
};

export type CairnMapClassGroupConfig = {
  key: string;
  label: CairnMapLocalizedLabel;
  type: 'array' | string;
  optional?: boolean;
  minItems?: number;
  addButtonText?: string;
  fields: CairnMapClassFieldConfig[];
};

export type CairnMapClassClassificationOption = {
  kind: string;
  skind?: string;
  skind2?: string;
  drawMode?: string;
  geom?: string;
  label: CairnMapLocalizedLabel;
  workflow?: {
    visible?: boolean;
  };
  display?: {
    ruleId?: string | null;
  };
};

export type CairnMapClassClassificationConfig = {
  kindField?: string;
  skindField?: string;
  skind2Field?: string;
  required?: boolean;
  options: CairnMapClassClassificationOption[];
};

export type CairnMapClassTagItem = {
  key: string;
  label: CairnMapLocalizedLabel;
  type: 'text' | 'number' | 'bool' | 'select' | string;
  options?: CairnMapClassFieldOption[];
  usage?: string[];
};

export type CairnMapClassTagsConfig = {
  enabled: boolean;
  allowOther?: boolean;
  items: CairnMapClassTagItem[];
};

export type CairnMapClassExtensionNamespace = {
  id: string;
  label?: string;
  allowCustomKeys?: boolean;
};

export type CairnMapClassExtensionsConfig = {
  enabled: boolean;
  allowOtherNamespaces?: boolean;
  namespaces: CairnMapClassExtensionNamespace[];
};

export type CairnMapClassSpecialLogic = {
  key: string;
  mode?: 'optional' | 'required' | string;
};

export type CairnMapClassDisplayRule = {
  id: string;
  match?: Record<string, unknown>;
  profile?: string;
  style?: Record<string, unknown>;
  label?: Record<string, unknown>;
  specialLogic?: CairnMapClassSpecialLogic[];
};

export type CairnMapClassDisplayConfig = {
  runtimeStatus?: CairnMapClassRuntimeStatus;
  rules: CairnMapClassDisplayRule[];
};

export type CairnMapClassCardConfig = {
  runtimeStatus?: CairnMapClassRuntimeStatus;
  layoutId?: string;
  specialCardKey?: string;
  items?: Array<Record<string, unknown>>;
};

export type CairnMapClassWorkflowBinding = {
  workflowId: string;
  default?: boolean;
  preset?: string;
  runtimeStatus?: CairnMapClassRuntimeStatus | 'planned';
};

export type CairnMapClassConfig = {
  schemaVersion: string;
  projectId?: string;
  runtimeStatus?: CairnMapClassRuntimeStatus;
  classCode: string;
  classKey: string;
  sourceFeatureKey?: string;
  label: CairnMapLocalizedLabel;
  description?: string;
  data: CairnMapClassDataConfig;
  geometry: CairnMapClassGeometryConfig;
  identity: CairnMapClassIdentityConfig;
  classification?: CairnMapClassClassificationConfig;
  fields: CairnMapClassFieldConfig[];
  groups?: CairnMapClassGroupConfig[];
  tags?: CairnMapClassTagsConfig;
  extensions?: CairnMapClassExtensionsConfig;
  display?: CairnMapClassDisplayConfig;
  card?: CairnMapClassCardConfig;
  workflowBindings?: CairnMapClassWorkflowBinding[];
};
