import type { CairnMapSharedTaggedConfig } from './sharedTypes';

export type CairnMapWorkflowRuntimeMode =
  | 'configPrimary'
  | 'specialComponentPrimary'
  | 'legacyFallback'
  | 'deprecated';

export type CairnMapWorkflowDrawingConfig = {
  enabledFromThisPage?: boolean;
  drawMode?: 'point' | 'polyline' | 'polygon' | string;
  allowBack?: boolean;
  keepDrawingWhenBack?: boolean;
};

export type CairnMapWorkflowBlock = {
  type: string;
  id?: string;
  title?: string;
  field?: string;
  key?: string;
  valueType?: string[];
  persistInSession?: boolean;
  targetClassScope?: string[];
  searchFields?: string[];
  returnField?: string;
  displayField?: string;
  outputPath?: string;
  enableJump?: boolean;
  classCode?: string;
  kind?: string;
  skind?: string;
  skind2?: string;
  kindScope?: string[];
  skindScope?: string[];
  skind2Scope?: string[];
  componentKey?: string;
  dataPath?: string;
  geometryField?: string;
  optional?: boolean;
  props?: Record<string, unknown>;
  summaryPaths?: string[];
};

export type CairnMapWorkflowPage = {
  id: string;
  title?: string;
  subtitle?: string;
  drawing?: CairnMapWorkflowDrawingConfig;
  blocks: CairnMapWorkflowBlock[];
};

export type CairnMapWorkflowOutputConfig = {
  mode?: string;
  fieldMappings?: Array<Record<string, unknown>>;
  computedFields?: Array<Record<string, unknown>>;
  tagMappings?: Array<Record<string, unknown>>;
  extensionMappings?: Array<Record<string, unknown>>;
  idAssembly?: Array<Record<string, unknown>>;
};

export type CairnMapWorkflowEditSupport = {
  enabled?: boolean;
  blockTags?: string[];
  editablePageIds?: string[];
};

export type CairnMapWorkflowConfig = {
  schemaVersion: string;
  projectId?: string;
  id: string;
  label?: string;
  runtimeStatus?: CairnMapWorkflowRuntimeMode | 'active' | string;
  targetClass: string;
  targetGeometry?: string;
  runtimeMode?: 'componentExecutor' | 'blockRunner' | string;
  componentKey?: string;
  legacyWorkflowKey?: string;
  templateId?: string;
  blockRunnerReady?: boolean;
  futureBlockTemplateRef?: string;
  executorDispatch?: string;
  legacyFallback?: boolean;
  pages?: CairnMapWorkflowPage[];
  output?: CairnMapWorkflowOutputConfig;
  editSupport?: CairnMapWorkflowEditSupport;
};

export type CairnMapWorkflowBlockDefinition = {
  id: string;
  label?: string;
  runtimeStatus?: string;
  params?: string[];
};

export type CairnMapWorkflowBlocksConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapWorkflowBlockDefinition[];
};

export type CairnMapWorkflowRuntimeContractItem = {
  classCode: string;
  workflowId: string;
  runtimeMode: CairnMapWorkflowRuntimeMode;
  legacyFallback?: boolean;
  componentKey?: string;
};

export type CairnMapWorkflowRuntimeContractsConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapWorkflowRuntimeContractItem[];
};

export type CairnMapWorkflowParityProfileItem = {
  workflowId: string;
  legacyComponent?: string;
  pageOrder: string[];
  pageTitles?: string[];
  standardBlockLayout?: 'singleRow' | 'compact' | string;
  multiLineBlockIds?: string[];
};

export type CairnMapWorkflowParityProfilesConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapWorkflowParityProfileItem[];
};
