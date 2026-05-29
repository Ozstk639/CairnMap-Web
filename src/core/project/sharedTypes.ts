export type CairnMapSharedTaggedConfig = {
  schemaVersion: string;
  projectId?: string;
};

export type CairnMapRuntimeStatus = 'shadow' | 'runtime' | 'deprecated';

export type CairnMapDisplayProfileShadowItem = {
  id: string;
  label?: string;
  displayTier?: string;
  runtimeStatus?: CairnMapRuntimeStatus;
  sourceRuntimeProfile?: string;
  notes?: string;
};

export type CairnMapDisplayProfilesConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapDisplayProfileShadowItem[];
};

export type CairnMapLabelStyleShadowItem = {
  id: string;
  label?: string;
  runtimeStatus?: CairnMapRuntimeStatus;
  sourceRuntimeKey?: string;
  sourceRuntimePattern?: string;
  family?: string;
  notes?: string;
};

export type CairnMapLabelStylesConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapLabelStyleShadowItem[];
};

export type CairnMapIconRegistryItem = {
  id: string;
  componentKey: string;
  usage?: string[];
};

export type CairnMapIconRegistryConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapIconRegistryItem[];
};

export type CairnMapFieldControlItem = {
  id: string;
  componentKey: string;
  label?: string;
};

export type CairnMapFieldControlsConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapFieldControlItem[];
};

export type CairnMapWorkflowTemplateStep = {
  id: string;
  title: string;
  slot: string;
};

export type CairnMapWorkflowTemplateItem = {
  id: string;
  label?: string;
  targetGeometry?: 'Point' | 'LineString' | 'Polygon' | 'Any' | string;
  steps: CairnMapWorkflowTemplateStep[];
};

export type CairnMapWorkflowTemplatesConfig = CairnMapSharedTaggedConfig & {
  items: CairnMapWorkflowTemplateItem[];
};
