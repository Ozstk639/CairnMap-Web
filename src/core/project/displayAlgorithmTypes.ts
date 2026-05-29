export type CairnMapDisplayAlgorithmRuntimeStatus = 'shadow' | 'registry' | 'active' | 'deprecated';

export type CairnMapDisplayAlgorithmItem = {
  id: string;
  algorithmKey: string;
  label?: string;
  allowedClasses?: string[];
  runtimeStatus?: CairnMapDisplayAlgorithmRuntimeStatus | string;
  description?: string;
};

export type CairnMapDisplayAlgorithmsConfig = {
  schemaVersion: string;
  projectId?: string;
  runtimeStatus?: string;
  items: CairnMapDisplayAlgorithmItem[];
};

export type CairnMapDisplayRuleAlgorithmRef = {
  key: string;
  mode?: string;
};
