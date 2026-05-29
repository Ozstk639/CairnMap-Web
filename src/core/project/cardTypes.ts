import type { CairnMapRuntimeStatus, CairnMapSharedTaggedConfig } from './sharedTypes';

export type CairnMapCardRuntimeMode =
  | 'shadow'
  | 'configPrimary'
  | 'specialCardPrimary'
  | 'specialCardShadow'
  | 'legacyFallback'
  | 'deprecated';

export type CairnMapCardValueTransform = 'plain' | 'externalLink' | 'featureLink' | 'featureLinkList' | 'json';

export type CairnMapCardFeatureLinkTarget = {
  classCode?: string;
  kind?: string;
  skind?: string;
  skind2?: string;
  matchField?: string;
  displayField?: string;
  sourceValuePath?: string;
  fallbackDisplay?: 'raw' | 'id' | string;
};

export type CairnMapCardLayoutItem =
  | { kind: 'classification'; label?: string; hidden?: boolean }
  | {
      kind: 'registryField';
      key?: string;
      path?: string;
      label?: string;
      hidden?: boolean;
      transform?: CairnMapCardValueTransform;
      linkTarget?: CairnMapCardFeatureLinkTarget;
    }
  | { kind: 'registryDefaultGroup' }
  | {
      kind: 'rawField';
      path: string;
      label: string;
      transform?: CairnMapCardValueTransform;
      linkTarget?: CairnMapCardFeatureLinkTarget;
      usedPaths?: string[];
      hidden?: boolean;
    }
  | { kind: 'enhancement'; key: string }
  | { kind: 'relation'; key: string; relationActionKey?: string; hidden?: boolean };

export type CairnMapCardLayoutConfigItem = {
  id: string;
  label?: string;
  items: CairnMapCardLayoutItem[];
};

export type CairnMapCardLayoutsConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapCardLayoutConfigItem[];
};

export type CairnMapCardEnhancementConfigItem = {
  id: string;
  componentKey: string;
  label?: string;
  allowedClasses?: string[];
  dataPath?: string;
  relationActionKey?: string;
  runtimeStatus?: CairnMapRuntimeStatus | 'active';
};

export type CairnMapCardEnhancementsConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapCardEnhancementConfigItem[];
};

export type CairnMapCardRuntimeContractItem = {
  classCode: string;
  layoutId: string;
  runtimeMode: CairnMapCardRuntimeMode;
  legacyFallback?: boolean;
};

export type CairnMapCardRuntimeContractsConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapCardRuntimeContractItem[];
};

export type CairnMapClassCardConfig = {
  runtimeStatus?: CairnMapRuntimeStatus | CairnMapCardRuntimeMode;
  layoutId?: string;
  sections?: Array<{ id: string; title?: string; slot?: string; collapsedByDefault?: boolean }>;
  fields?: Array<Record<string, unknown>>;
  relations?: Array<{ key: string; relationActionKey?: string; runtimeStatus?: string }>;
  enhancements?: Array<{ key: string; componentKey?: string; dataPath?: string; runtimeStatus?: string }>;
};
