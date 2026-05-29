export type CairnMapProjectTaggedConfig = {
  schemaVersion: string;
  projectId?: string;
};


export type CairnMapWorldItem = {
  id: string;
  numericCode: number;
  label?: string;
  enabled?: boolean;
  default?: boolean;
  center?: { x: number; y?: number; z: number };
  projectionId?: string;
  tileSourceId?: string;
  dataSourceId?: string;
};

export type CairnMapWorldsConfig = CairnMapProjectTaggedConfig & {
  items: CairnMapWorldItem[];
};

export type CairnMapSourceLinkModeItem = {
  id: string;
  label: string;
  rawCompatibleBaseUrl: string;
  default?: boolean;
};

export type CairnMapSourceLinkModesConfig = CairnMapProjectTaggedConfig & {
  storageKey: string;
  legacyStorageKeys?: string[];
  items: CairnMapSourceLinkModeItem[];
};

export type CairnMapDataSourceMode = 'pub' | 'dat';

export type CairnMapDataSourceItem = {
  id?: string;
  worldId: string;
  label?: string;
  type?: string;
  baseUrl: string;
  files: string[];
  sourceMode?: CairnMapDataSourceMode;
  pictureSourceMode?: CairnMapDataSourceMode;
};

export type CairnMapDataSourcesConfig = CairnMapProjectTaggedConfig & {
  items: CairnMapDataSourceItem[];
};

export type CairnMapRuleButtonTone = 'blue' | 'green' | 'cyan' | 'purple' | 'gray' | 'orange' | 'slate';

export type CairnMapRuleButtonCriteria = {
  classCode?: string[];
  kind?: string[];
  skind?: string[];
  skind2?: string[];
};

export type CairnMapRuleButtonLinkedButton = {
  targetId: string;
  mode: 'enableWhenThisEnabled' | 'disableWhenThisEnabled' | 'mirrorThisState';
};

export type CairnMapRuleButtonBehavior = {
  exclusiveWith?: string[];
  exclusiveGroup?: string | null;
  linkedButtons?: CairnMapRuleButtonLinkedButton[];
  disableWhenEnabled?: string[];
  enableWhenEnabled?: string[];
  persistState?: boolean;
};

export type CairnMapRuleButtonItem = {
  id: string;
  label: string;
  tone: CairnMapRuleButtonTone;
  iconKey: string;
  defaultEnabled?: boolean;
  criteria: CairnMapRuleButtonCriteria;
  behavior?: CairnMapRuleButtonBehavior;
};

export type CairnMapRuleButtonsConfig = CairnMapProjectTaggedConfig & {
  storageKey?: string;
  legacyStorageKeys?: string[];
  policy?: {
    maxActive?: number;
  };
  defaults?: {
    fallback?: string[];
    byWorld?: Record<string, string[] | undefined>;
  };
  items: CairnMapRuleButtonItem[];
};

export type CairnMapSearchRuleItem = {
  classCode?: string;
  kind?: string;
  skind?: string;
  skind2?: string;
};

export type CairnMapSearchCategoryOverride = {
  classCode: string;
  name: string;
};

export type CairnMapSearchProfile = {
  id: string;
  searchFields?: string[];
  blacklist?: CairnMapSearchRuleItem[];
  priority?: CairnMapSearchRuleItem[];
  categoryOverrides?: CairnMapSearchCategoryOverride[];
};

export type CairnMapSearchProfilesConfig = CairnMapProjectTaggedConfig & {
  defaultProfileId: string;
  items: CairnMapSearchProfile[];
};
