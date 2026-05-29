export type CairnMapAssemblyPackageRef = {
  path: string;
  enabled: boolean;
};

export type CairnMapMergePolicy = {
  presetPriority: 'low' | 'normal';
  classConflict: 'nonNativeOverridesPresetWithVisibleError' | 'lastWins' | 'error';
  sharedConflict: 'lastWins' | 'error';
  workflowConflict: 'lastWins' | 'error';
  environmentConflict: 'projectOnly' | 'lastWins' | 'error';
};

export type CairnMapAssemblyConfig = {
  schemaVersion: string;
  assemblyId: string;
  displayName: string;
  description?: string;
  loadOrder: CairnMapAssemblyPackageRef[];
  mergePolicy: CairnMapMergePolicy;
  runtime: {
    defaultPackagePath: string;
    defaultWorldId: string;
  };
};

export type CairnMapConfigPackageMeta = {
  schemaVersion: string;
  packageId: string;
  packageType: 'project' | 'preset';
  displayName: string;
  nativePreset?: boolean;
  contains: {
    environment: boolean;
    shared: boolean;
    classes: boolean;
    workflows: boolean;
  };
};
