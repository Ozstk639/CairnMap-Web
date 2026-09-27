export type GeometryKind = 'Point' | 'LineString' | 'Polygon';

export type LocalizedText = Record<'zh' | 'en', string>;

export type ClassificationPath = {
  class: string;
  kind?: string;
  skind?: string;
  skind2?: string;
};

export type InheritanceMode = 'sealed' | 'overridable' | 'localOnly';

export type FieldValueType = 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'reference';

export type FieldDefinition = {
  fieldId: string;
  key: string;
  type: FieldValueType;
  cardinality: 'single' | 'multiple';
  input: 'text' | 'textarea' | 'select' | 'toggle' | 'json';
  required?: boolean;
  labels: LocalizedText;
  description: LocalizedText;
  options?: string[];
  inheritance?: InheritanceMode;
};

export type LabelCondition =
  | { kind: 'always' }
  | { kind: 'zoomRange'; min?: number; max?: number }
  | { kind: 'bboxArea'; min?: number; max?: number; scope: 'part' | 'feature' | 'building' }
  | { kind: 'fieldEquals'; field: string; value: string };

export type GeometryProfile = {
  enabled: boolean;
  allowMultipleParts: boolean;
  color: string;
  zLevel: number;
  labelOffset: number;
  interactionPriority: number;
  label: {
    visible: boolean;
    scope: 'part' | 'featureBbox' | 'buildingAggregate';
    conditions: LabelCondition[];
  };
  interaction: {
    mode: 'standard' | 'building' | 'floor';
    targetField?: string;
  };
};

export type CardItem = {
  id: string;
  source: string;
  visible: boolean;
  renderer: 'text' | 'tag' | 'colorCapsule' | 'nameColorCapsule' | 'relationLink' | 'media';
  label?: LocalizedText;
  relation?: {
    targetClassification?: ClassificationPath;
    targetMatchField?: string;
    targetDisplayField?: string;
    clickable?: boolean;
  };
};

export type CategoryNode = {
  nodeId: string;
  path: ClassificationPath;
  children: string[];
  policies: {
    fields: InheritanceMode;
    display: InheritanceMode;
    card: InheritanceMode;
    workflow: InheritanceMode;
  };
  fields: FieldDefinition[];
  geometryProfiles: Partial<Record<GeometryKind, GeometryProfile>>;
  card: CardItem[];
};

export type WorkflowControl = {
  id: string;
  kind: 'text' | 'textarea' | 'select' | 'classificationPicker' | 'notice';
  columns: 1 | 2 | 3;
  label: LocalizedText;
  binding?: { target: 'field' | 'tag' | 'extension'; path: string };
  options?: string[];
  classificationScope?: ClassificationPath;
  required?: boolean;
};

export type WorkflowStep = {
  id: string;
  kind: 'actor' | 'form' | 'tagsExtensions' | 'geometry' | 'special';
  label: LocalizedText;
  controls?: WorkflowControl[];
  geometry?: GeometryKind[];
  specialKey?: string;
};

export type WorkflowDefinition = {
  id: string;
  label: LocalizedText;
  target: ClassificationPath;
  steps: WorkflowStep[];
  idAssembly?: {
    targetField: string;
    operator: 'concat' | 'template';
    parts: string[];
    separator?: string;
  };
};

export type ConfigPackageV2 = {
  schemaVersion: 'cairnmap.config-package.v2';
  packageId: string;
  projectId: string;
  revision: number;
  displayName: LocalizedText;
  sourceManifestSha256?: string;
  /** Explicit registry for hybrid legacy components.  A workflow may never
   * execute an arbitrary component key supplied by a package. */
  specialComponentKeys?: string[];
  nodes: CategoryNode[];
  workflows: WorkflowDefinition[];
};

export type ConfigValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
};

export type ConfigValidationReport = {
  schemaVersion: 'cairnmap.config-validation-report.v2';
  valid: boolean;
  createdAt: string;
  issues: ConfigValidationIssue[];
};

export type MountedFeatureRecord = Record<string, unknown> & {
  Class?: string;
  Kind?: string;
  Skind?: string;
  Skind2?: string;
};
