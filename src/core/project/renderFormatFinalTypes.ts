export type CairnMapRenderFormatFinalSource = 'config' | 'legacy' | 'runtime';

export type CairnMapRenderFormatFinalDisplayContract =
  | 'configPrimary'
  | 'configPrimaryWithAlgorithmRegistry'
  | 'legacyCompatibility';

export type CairnMapRenderFormatFinalFormatContract =
  | 'genericConfigPrimary'
  | 'specialFormatterConfigPrimary'
  | 'legacyCompatibility';

export type CairnMapRenderFormatFinalLegacyRole =
  | 'algorithmRuntimeAndCompatibilityAdapter'
  | 'compatibilityAdapter'
  | 'legacyFallback';

export type CairnMapRenderFormatFinalContractItem = {
  classCode: string;
  sourceFeatureKey?: string;
  displaySource: CairnMapRenderFormatFinalSource;
  displayContract: CairnMapRenderFormatFinalDisplayContract | string;
  formatSource: CairnMapRenderFormatFinalSource;
  formatContract: CairnMapRenderFormatFinalFormatContract | string;
  schemaSource: CairnMapRenderFormatFinalSource;
  legacyRole: CairnMapRenderFormatFinalLegacyRole | string;
  legacyFallbackAllowed?: boolean;
  notes?: string;
};

export type CairnMapRenderFormatFinalLegacyFile = {
  path: string;
  finalRole: string;
};

export type CairnMapRenderFormatFinalContractsConfig = {
  schemaVersion: string;
  projectId?: string;
  runtimeStatus?: string;
  items: CairnMapRenderFormatFinalContractItem[];
  legacyFiles?: CairnMapRenderFormatFinalLegacyFile[];
};
