import type {
  CairnMapDisplayProfilesConfig,
  CairnMapFieldControlsConfig,
  CairnMapIconRegistryConfig,
  CairnMapLabelStylesConfig,
  CairnMapWorkflowTemplatesConfig,
} from './sharedTypes';
import type { CairnMapDisplayRuntimeContractsConfig } from './displayRuntimeTypes';
import type {
  CairnMapRelationBindingsConfig,
  CairnMapSpecialDisplayLogicConfig,
} from './specialDisplayLogicTypes';
import type {
  CairnMapRelationActionsConfig,
  CairnMapRelationViewProfilesConfig,
} from './relationTypes';

import displayProfilesConfigJson from '../../../project-config/presets/core-structures/shared/display/displayProfiles.json';
import labelStylesConfigJson from '../../../project-config/presets/core-structures/shared/display/labelStyles.json';
import iconRegistryConfigJson from '../../../project-config/presets/core-structures/shared/common/iconRegistry.json';
import fieldControlsConfigJson from '../../../project-config/presets/core-structures/shared/workflow/fieldControls.json';
import workflowTemplatesConfigJson from '../../../project-config/presets/core-structures/shared/workflow/workflowTemplates.json';
import specialDisplayLogicConfigJson from '../../../project-config/presets/core-structures/shared/display/specialDisplayLogic.json';
import relationBindingsConfigJson from '../../../project-config/presets/core-structures/shared/relation/relationBindings.json';
import relationActionsConfigJson from '../../../project-config/presets/core-structures/shared/relation/relationActions.json';
import relationViewProfilesConfigJson from '../../../project-config/presets/core-structures/shared/relation/relationViewProfiles.json';
import displayRuntimeContractsConfigJson from '../../../project-config/presets/core-structures/shared/display/displayRuntimeContracts.json';

export function getOpenRIAMapDisplayProfilesConfig(): CairnMapDisplayProfilesConfig {
  return displayProfilesConfigJson as CairnMapDisplayProfilesConfig;
}

export function getOpenRIAMapLabelStylesConfig(): CairnMapLabelStylesConfig {
  return labelStylesConfigJson as CairnMapLabelStylesConfig;
}

export function getOpenRIAMapIconRegistryConfig(): CairnMapIconRegistryConfig {
  return iconRegistryConfigJson as CairnMapIconRegistryConfig;
}

export function getOpenRIAMapFieldControlsConfig(): CairnMapFieldControlsConfig {
  return fieldControlsConfigJson as CairnMapFieldControlsConfig;
}

export function getOpenRIAMapWorkflowTemplatesConfig(): CairnMapWorkflowTemplatesConfig {
  return workflowTemplatesConfigJson as CairnMapWorkflowTemplatesConfig;
}

export function getOpenRIAMapSpecialDisplayLogicConfig(): CairnMapSpecialDisplayLogicConfig {
  return specialDisplayLogicConfigJson as CairnMapSpecialDisplayLogicConfig;
}

export function getOpenRIAMapRelationBindingsConfig(): CairnMapRelationBindingsConfig {
  return relationBindingsConfigJson as CairnMapRelationBindingsConfig;
}

export function getOpenRIAMapDisplayRuntimeContractsConfig(): CairnMapDisplayRuntimeContractsConfig {
  return displayRuntimeContractsConfigJson as CairnMapDisplayRuntimeContractsConfig;
}

export function getOpenRIAMapRelationActionsConfig(): CairnMapRelationActionsConfig {
  return relationActionsConfigJson as CairnMapRelationActionsConfig;
}

export function getOpenRIAMapRelationViewProfilesConfig(): CairnMapRelationViewProfilesConfig {
  return relationViewProfilesConfigJson as CairnMapRelationViewProfilesConfig;
}
