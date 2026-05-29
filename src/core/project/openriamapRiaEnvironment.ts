import type {
  CairnMapDataSourcesConfig,
  CairnMapRuleButtonsConfig,
  CairnMapWorldsConfig,
  CairnMapSearchProfilesConfig,
  CairnMapSourceLinkModesConfig,
} from './environmentTypes';

import sourceLinkModesConfigJson from '../../../project-config/packages/openriamap-ria/environment/sourceLinkModes.json';
import dataSourcesConfigJson from '../../../project-config/packages/openriamap-ria/environment/dataSources.json';
import ruleButtonsConfigJson from '../../../project-config/packages/openriamap-ria/environment/ruleButtons.json';
import searchProfilesConfigJson from '../../../project-config/packages/openriamap-ria/environment/searchProfiles.json';
import worldsConfigJson from '../../../project-config/packages/openriamap-ria/environment/worlds.json';

export function getOpenRIAMapSourceLinkModesConfig(): CairnMapSourceLinkModesConfig {
  return sourceLinkModesConfigJson as CairnMapSourceLinkModesConfig;
}

export function getOpenRIAMapDataSourcesConfig(): CairnMapDataSourcesConfig {
  return dataSourcesConfigJson as CairnMapDataSourcesConfig;
}

export function getOpenRIAMapRuleButtonsConfig(): CairnMapRuleButtonsConfig {
  return ruleButtonsConfigJson as CairnMapRuleButtonsConfig;
}

export function getOpenRIAMapSearchProfilesConfig(): CairnMapSearchProfilesConfig {
  return searchProfilesConfigJson as CairnMapSearchProfilesConfig;
}

export function getOpenRIAMapWorldsConfig(): CairnMapWorldsConfig {
  return worldsConfigJson as CairnMapWorldsConfig;
}
