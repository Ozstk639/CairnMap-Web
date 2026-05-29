import type {
  CairnMapClassClassificationConfig,
  CairnMapClassConfig,
  CairnMapClassExtensionsConfig,
  CairnMapClassFieldConfig,
  CairnMapClassGeometryConfig,
  CairnMapClassGroupConfig,
  CairnMapClassIdentityConfig,
  CairnMapClassTagsConfig,
} from './classTypes';

export type CairnMapSchemaRuntimeStatus = 'shadow' | 'metadata' | 'active' | 'deprecated';
export type CairnMapSchemaMode = 'schemaMetadata' | 'schemaPrimary' | 'legacyFallback';
export type CairnMapFormatMode =
  | 'legacyAlgorithmFallback'
  | 'genericDiagnostic'
  | 'genericConfigPrimary'
  | 'specialFormatter'
  | 'specialFormatterConfigPrimary';

export type CairnMapSchemaRuntimeContract = {
  classCode: string;
  sourceFeatureKey?: string;
  schemaMode: CairnMapSchemaMode | string;
  formatMode: CairnMapFormatMode | string;
  formatterKey?: string;
  notes?: string;
};

export type CairnMapSchemaRuntimeContractsConfig = {
  schemaVersion: string;
  projectId?: string;
  runtimeStatus?: CairnMapSchemaRuntimeStatus;
  items: CairnMapSchemaRuntimeContract[];
};

export type CairnMapResolvedClassSchema = {
  classCode: string;
  classKey: string;
  sourceFeatureKey?: string;
  config: CairnMapClassConfig;
  geometry: CairnMapClassGeometryConfig;
  identity: CairnMapClassIdentityConfig;
  fields: CairnMapClassFieldConfig[];
  groups: CairnMapClassGroupConfig[];
  classification?: CairnMapClassClassificationConfig;
  tags?: CairnMapClassTagsConfig;
  extensions?: CairnMapClassExtensionsConfig;
  contract?: CairnMapSchemaRuntimeContract;
};

export type CairnMapSchemaLookupResult<T> = {
  classCode: string;
  value: T | null;
  found: boolean;
};
