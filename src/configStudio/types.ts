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

/** Dynamic V1 selects remain a registry reference, rather than being treated
 * as an invalid static enum with no choices. */
export type FieldDefinition = {
  fieldId: string; key: string; type: FieldValueType; cardinality: 'single' | 'multiple';
  input: 'text' | 'textarea' | 'select' | 'toggle' | 'json' | 'featureSearch';
  required?: boolean; requiredWhen?: Condition[]; labels: LocalizedText; description: LocalizedText;
  options?: string[]; optionSource?: { registryKey: string; runtimeField?: string };
  placeholder?: string; defaultValue?: unknown; sourceRuntimeField?: string;
  scenes?: { workflow?: boolean; editor?: boolean; infocard?: boolean; search?: boolean };
  reference?: { classCode: string; matchField: string; displayField?: string }; inheritance?: InheritanceMode;
};

export type ZoomInterval = { id: string; minExclusive?: number; maxExclusive?: number; conditions?: Condition[] };
export type AggregatePriority = {
  enabled: boolean; metric: 'area' | 'length' | 'partCount' | 'field'; field?: string; multiplier: number;
  inputRange: { min: number; max: number }; priorityRange: { min: number; max: number }; curve: 'linear' | 'step';
};
export type GeometryProfile = {
  enabled: boolean; allowMultipleParts: boolean; color: string; zLevel: number; labelOffset: number; interactionPriority: number;
  featureScope: 'perPart' | 'wholeFeature';
  label: { visible: boolean; scope: 'part' | 'featureBbox'; conditions: Condition[]; zoomIntervals?: ZoomInterval[] };
  interaction: { mode: 'standard' | 'building' | 'floor'; targetField?: string };
  aggregatePriority?: AggregatePriority;
  legacyDisplay?: { ruleIds: string[]; profileIds: string[]; specialLogicKeys: string[] };
};

export type CardRenderer = 'text' | 'tag' | 'colorCapsule' | 'nameColorCapsule' | 'relationLink' | 'media' | 'specialCard';
export type CardItem = {
  id: string; source: string; visible: boolean; renderer: CardRenderer; label?: LocalizedText;
  options?: { colorSource?: string; nameSource?: string; fallbackColor?: string; mediaSource?: 'picture-index' | 'external-url'; specialCardKey?: string };
  relation?: { targetClassification?: ClassificationPath; targetMatchField?: string; targetDisplayField?: string; clickable?: boolean };
};

export type CategoryNode = {
  nodeId: string; path: ClassificationPath; children: string[];
  policies: { fields: InheritanceMode; display: InheritanceMode; card: InheritanceMode; workflow: InheritanceMode };
  fields: FieldDefinition[]; geometryProfiles: Partial<Record<GeometryKind, GeometryProfile>>; card: CardItem[];
  /** Exact V1 metadata is retained until an explicit V2 runtime registry maps it. */
  legacy?: { classCode: string; displayRuleIds: string[]; cardLayoutId?: string; specialCardKey?: string; source?: Record<string, unknown> };
};

export type SearchProfile = {
  registryKey: string; mode: 'coarse' | 'feature'; targetClassScope?: string[]; kindScope?: string[]; skindScope?: string[]; skind2Scope?: string[];
  searchFields: string[]; displayFields: string[]; returnFields: string[]; cacheScope: 'world' | 'loadedWorlds';
};
export type WorkflowControl = {
  id: string; slot?: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'classificationPicker' | 'featureSearch' | 'coarseSearch' | 'notice' | 'json';
  columns: 1 | 2 | 3; label: LocalizedText; binding?: { target: 'field' | 'tag' | 'extension'; path: string };
  options?: string[]; optionSource?: { registryKey: string }; search?: SearchProfile; classificationScope?: ClassificationPath; required?: boolean;
  legacyBlock?: Record<string, unknown>;
};
export type WorkflowStep = { id: string; kind: 'actor' | 'form' | 'tagsExtensions' | 'geometry' | 'special'; label: LocalizedText; controls?: WorkflowControl[]; geometry?: GeometryKind[]; specialKey?: string; legacyPage?: Record<string, unknown> };
export type WorkflowAssignment = { id: string; target: string; expression: string; source?: 'field' | 'tag' | 'extension' };
export type WorkflowDefinition = {
  id: string; label: LocalizedText; target: ClassificationPath; steps: WorkflowStep[]; assignments?: WorkflowAssignment[];
  idAssembly?: { targetField: string; operator: 'concat' | 'template'; parts: string[]; separator?: string };
  legacy?: { runtimeMode?: string; componentKey?: string; output?: Record<string, unknown>; source?: Record<string, unknown> };
};

export type ParityEntry = { kind: 'class' | 'workflow' | 'shared'; id: string; source: string; status: 'preserved' | 'registryReference' | 'unsupported'; details?: string };
export type ParityReport = { schemaVersion: 'cairnmap.v1-parity-report.v1'; sourceManifestSha256?: string; entries: ParityEntry[]; generatedAt: string };
export type ConfigPackageV2 = {
  schemaVersion: 'cairnmap.config-package.v2'; packageId: string; projectId: string; revision: number; displayName: LocalizedText;
  sourceManifestSha256?: string; specialComponentKeys?: string[]; nodes: CategoryNode[]; workflows: WorkflowDefinition[]; parity?: ParityReport;
};

export type ConfigValidationIssue = { severity: 'error' | 'warning'; code: string; path: string; message: string; field?: string; expected?: string; featureIds?: string[]; count?: number };
export type ConfigValidationReport = { schemaVersion: 'cairnmap.config-validation-report.v2'; valid: boolean; createdAt: string; issues: ConfigValidationIssue[]; summary?: { configuration: number; parity: number; mountedData: number; affectedFeatures: number } };
export type MountedFeatureRecord = Record<string, unknown> & { ID?: string; World?: string; Class?: string; Kind?: string; Skind?: string; Skind2?: string; SKind?: string; SKind2?: string };
