export type CairnMapSpecialFormatterRuntimeStatus = 'planned' | 'legacyFallback' | 'configPrimary' | 'active';

export type CairnMapSpecialFormatterConfigItem = {
  key: string;
  classCodes: string[];
  runtimeStatus: CairnMapSpecialFormatterRuntimeStatus | string;
  description?: string;
};

export type CairnMapSpecialFormattersConfig = {
  schemaVersion: string;
  projectId?: string;
  runtimeStatus?: string;
  items: CairnMapSpecialFormatterConfigItem[];
};
