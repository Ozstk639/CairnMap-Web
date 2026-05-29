import type { CairnMapResolvedClassSchema } from './schemaTypes';

export type CairnMapFormatRuntimeMode =
  | 'legacyAlgorithmFallback'
  | 'genericDiagnostic'
  | 'genericConfigPrimary'
  | 'specialFormatter'
  | 'specialFormatterConfigPrimary';

export type CairnMapLegacyFormatSummary = {
  featureKey: string;
  classCode?: string;
  modes?: string[];
  fields: string[];
  groups: Array<{ key: string; fields: string[] }>;
};

export type CairnMapSchemaFormatDiff = {
  classCode: string;
  sourceFeatureKey?: string;
  fieldCount: {
    schema: number;
    legacy: number;
  };
  groupCount: {
    schema: number;
    legacy: number;
  };
  missingInSchema: string[];
  missingInLegacy: string[];
  groupMismatches: string[];
  geometryMismatch?: string;
};

export type CairnMapRuntimeFormatSchemaMetadata = {
  classCode: string;
  sourceFeatureKey?: string;
  schema: CairnMapResolvedClassSchema;
  runtimeMode: CairnMapFormatRuntimeMode | string;
};
