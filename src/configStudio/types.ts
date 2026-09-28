/**
 * The Config Studio package deliberately models the pieces which are resolved
 * independently by the map runtime. In particular, vector stacking is not a
 * label-collision priority and neither is a zoom/metric priority override.
 */
export type GeometryKind = 'Point' | 'LineString' | 'Polygon';
export type LocalizedText = Record<'zh' | 'en', string>;

export type ClassificationPath = { class: string; kind?: string; skind?: string; skind2?: string };
export type InheritanceMode = 'sealed' | 'overridable' | 'localOnly';
export type FieldValueType = 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'reference';
export type Condition =
  | { kind: 'always' }
  | { kind: 'zoomRange'; min?: number; max?: number }
  | { kind: 'bboxArea'; min?: number; max?: number; scope: 'part' | 'feature' }
  | { kind: 'fieldEquals'; field: string; value: string };

export type FieldDefinition = {
  fieldId: string;
  key: string;
  type: FieldValueType;
  cardinality: 'single' | 'multiple';
  input: 'text' | 'textarea' | 'select' | 'toggle' | 'json' | 'featureSearch';
  required?: boolean;
  requiredWhen?: Condition[];
  labels: LocalizedText;
  description: LocalizedText;
  options?: string[];
  optionSource?: { registryKey: string; runtimeField?: string };
  placeholder?: string;
  defaultValue?: unknown;
  sourceRuntimeField?: string;
  scenes?: { workflow?: boolean; editor?: boolean; infocard?: boolean; search?: boolean };
  reference?: { classCode: string; matchField: string; displayField?: string };
  inheritance?: InheritanceMode;
};

export type LabelRole = 'ignore' | 'soft' | 'optional' | 'important' | 'required';
export type LabelAnchor = 'perPart' | 'featureBbox';
export type DisplayRepresentation = 'hidden' | 'geometry' | 'point';
export type PriorityMetric = 'area' | 'length' | 'partCount' | 'field';

/** First independent block: vector draw order and stacking. */
export type GeometryStackPolicy = { zLevel: number; pane?: string; zIndexOffset?: number };

/** Second independent block: label collision policy. */
export type LabelCollisionPolicy = {
  role: LabelRole;
  basePriority: number;
  collisionGroup?: string;
  hideWhenColliding: boolean;
  densityLimit?: number;
};

/** Third independent block: zoom visibility and metric-based priority. */
export type ZoomPriorityRule = {
  id: string;
  minExclusive?: number;
  maxExclusive?: number;
  representation: DisplayRepresentation;
  labelRole?: LabelRole;
  priority?: {
    mode: 'add' | 'replace';
    base?: number;
    metric?: {
      kind: PriorityMetric;
      field?: string;
      multiplier: number;
      divisor?: number;
      rounding: 'floor' | 'round' | 'ceil' | 'none';
      min?: number;
      max?: number;
    };
  };
};

export type GeometryInteractionTriggers = { point?: boolean; line?: boolean; boundary?: boolean; interior?: boolean; label?: boolean };

export type GeometryProfile = {
  enabled: boolean;
  allowMultipleParts: boolean;
  color: string;
  style?: { weight?: number; fillOpacity?: number; opacity?: number; dashArray?: string };
  geometryStack: GeometryStackPolicy;
  label: { visible: boolean; anchor: LabelAnchor; conditions: Condition[]; collision: LabelCollisionPolicy };
  zoomPriority: { rules: ZoomPriorityRule[] };
  interaction: { triggers: GeometryInteractionTriggers };
  legacyDisplay?: { ruleIds: string[]; profileIds: string[]; specialLogicKeys: string[] };
};

export type ContainmentBinding = { enabled: boolean; role?: 'parent' | 'child'; parentReferenceField?: string; viewProfileKey?: string };

export type CardRenderer = 'text' | 'tag' | 'colorCapsule' | 'nameColorCapsule' | 'relationLink' | 'media';
export type CardRelation = { targetClassification?: ClassificationPath; targetMatchField?: string; targetDisplayField?: string; clickable?: boolean };
export type CardItem = {
  id: string;
  source: string;
  visible: boolean;
  renderer: CardRenderer;
  label?: LocalizedText;
  options?: { colorSource?: string; nameSource?: string; fallbackColor?: string; mediaSource?: 'picture-index' | 'external-url' };
  relation?: CardRelation;
};

/** A layout and a code component are intentionally mutually exclusive. */
export type CardConfiguration =
  | { mode: 'fields'; items: CardItem[] }
  | { mode: 'layout'; layoutId: string; options?: Record<string, unknown> }
  | { mode: 'component'; componentKey: string; options?: Record<string, unknown> };

export type CategoryNode = {
  nodeId: string;
  path: ClassificationPath;
  children: string[];
  policies: { fields: InheritanceMode; display: InheritanceMode; card: InheritanceMode; workflow: InheritanceMode };
  fields: FieldDefinition[];
  geometryProfiles: Partial<Record<GeometryKind, GeometryProfile>>;
  containment?: ContainmentBinding;
  card: CardConfiguration;
  legacy?: {
    classCode: string;
    displayRuleIds: string[];
    cardLayoutId?: string;
    specialCardKey?: string;
    source?: Record<string, unknown>;
  };
};

export type SearchProfile = {
  mode: 'coarse' | 'feature';
  target: ClassificationPath;
  searchFields: string[];
  displayFields: string[];
  returnFields: string[];
  cacheScope: 'world' | 'loadedWorlds';
  coarse?: { matcher: 'contains' | 'prefix' | 'token' | 'fuzzy'; minQueryLength: number; maxResults: number; debounceMs?: number };
};

export type WorkflowControl = {
  id: string;
  slot?: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'classificationPicker' | 'featureSearch' | 'coarseSearch' | 'notice' | 'json' | 'runtimeValue' | 'component';
  columns: 1 | 2 | 3;
  label: LocalizedText;
  options?: string[];
  optionSource?: { registryKey: string };
  search?: SearchProfile;
  classificationScope?: ClassificationPath;
  required?: boolean;
  systemManaged?: boolean;
  componentKey?: string;
  legacyBlock?: Record<string, unknown>;
};

export type WorkflowStep = {
  id: string;
  kind: 'actor' | 'form' | 'tagsExtensions' | 'geometry' | 'special';
  label: LocalizedText;
  subtitle?: LocalizedText;
  controls?: WorkflowControl[];
  geometry?: GeometryKind[];
  specialKey?: string;
  tagsExtensions?: { tagsEnabled: boolean; extensionsEnabled: boolean };
  drawing?: { enabledFromThisPage?: boolean; drawMode?: string; allowBack?: boolean; keepDrawingWhenBack?: boolean };
  legacyPage?: Record<string, unknown>;
};

/** Target paths include field, tags.xxx and extensions.xxx; expressions contain slots and system tokens. */
export type WorkflowAssignment = { id: string; target: string; expression: string };
export type WorkflowDefinition = {
  id: string;
  label: LocalizedText;
  target: ClassificationPath;
  steps: WorkflowStep[];
  assignments?: WorkflowAssignment[];
  legacy?: { runtimeMode?: string; componentKey?: string; output?: Record<string, unknown>; source?: Record<string, unknown> };
};

export type ControlledRegistryItem = {
  id: string;
  label: LocalizedText;
  allowedClasses?: string[];
  optionSchema?: Array<{ key: string; label: LocalizedText; type: 'text' | 'number' | 'boolean' | 'select'; options?: string[] }>;
};
export type ConfigRegistries = {
  cardLayouts: ControlledRegistryItem[];
  cardComponents: ControlledRegistryItem[];
  displayProfiles: ControlledRegistryItem[];
  specialDisplayLogic: ControlledRegistryItem[];
  workflowControls: ControlledRegistryItem[];
  workflowBlocks: ControlledRegistryItem[];
};

export type ParityEntry = {
  kind: 'class' | 'workflow' | 'shared';
  id: string;
  source: string;
  status: 'resolved' | 'registryReference' | 'unsupported';
  details?: string;
  fingerprint?: string;
};
export type ParityReport = { schemaVersion: 'cairnmap.v1-parity-report.v2'; sourceManifestSha256?: string; entries: ParityEntry[]; generatedAt: string };

export type ConfigPackageV3 = {
  schemaVersion: 'cairnmap.config-package.v3';
  packageId: string;
  projectId: string;
  /** Persistence metadata only. It is not a user-facing configuration rule. */
  revision: number;
  displayName: LocalizedText;
  sourceManifestSha256?: string;
  registries: ConfigRegistries;
  nodes: CategoryNode[];
  workflows: WorkflowDefinition[];
  parity?: ParityReport;
};

/** The v2 import shape is intentionally loose: it is migrated before editing. */
export type ConfigPackageV2Import = {
  schemaVersion: 'cairnmap.config-package.v2';
  packageId: string;
  projectId: string;
  revision: number;
  displayName: LocalizedText;
  nodes: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
  parity?: Record<string, unknown>;
  specialComponentKeys?: string[];
};

export type AffectedFeature = { id: string; name: string };
export type ConfigValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
  field?: string;
  expected?: string;
  affectedFeatures?: AffectedFeature[];
  count?: number;
};
export type ConfigValidationReport = {
  schemaVersion: 'cairnmap.config-validation-report.v3';
  valid: boolean;
  createdAt: string;
  issues: ConfigValidationIssue[];
  summary?: { configuration: number; parity: number; mountedData: number; affectedFeatures: number };
};
export type MountedFeatureRecord = Record<string, unknown> & {
  ID?: string;
  Name?: string;
  World?: string;
  Class?: string;
  Kind?: string;
  Skind?: string;
  Skind2?: string;
  SKind?: string;
  SKind2?: string;
};
