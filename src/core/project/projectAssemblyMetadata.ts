import type { CairnMapAssemblyConfig, CairnMapConfigPackageMeta } from './assemblyTypes';

import assemblyConfigJson from '../../../project-config/assemblies/openriamap-ria.json';
import projectPackageMetaJson from '../../../project-config/packages/openriamap-ria/package.json';
import projectConfigJson from '../../../project-config/packages/openriamap-ria/project.json';

export type CairnMapOpenRIAMapProjectConfig = {
  schemaVersion: string;
  projectId: string;
  label: string;
  runtimeStatus: 'active' | 'shadow' | 'deprecated' | string;
  presets: string[];
  overrides: {
    classes: string[];
    shared: string[];
    workflows: string[];
  };
  notes?: string;
};

export function getOpenRIAMapAssemblyConfig(): CairnMapAssemblyConfig {
  return assemblyConfigJson as CairnMapAssemblyConfig;
}

export function getOpenRIAMapProjectPackageMeta(): CairnMapConfigPackageMeta {
  return projectPackageMetaJson as CairnMapConfigPackageMeta;
}

export function getOpenRIAMapProjectConfig(): CairnMapOpenRIAMapProjectConfig {
  return projectConfigJson as CairnMapOpenRIAMapProjectConfig;
}

export function listOpenRIAMapEnabledPresetIds(): string[] {
  return getOpenRIAMapProjectConfig().presets ?? [];
}
