import type { CairnMapClassConfig } from './classTypes';

import budClassConfig from '../../../project-config/presets/building/classes/BUD.json';
import flrClassConfig from '../../../project-config/presets/building/classes/FLR.json';
import isgClassConfig from '../../../project-config/presets/core-structures/classes/ISG.json';
import islClassConfig from '../../../project-config/presets/core-structures/classes/ISL.json';
import ispClassConfig from '../../../project-config/presets/core-structures/classes/ISP.json';
import pfbClassConfig from '../../../project-config/presets/rail/classes/PFB.json';
import plfClassConfig from '../../../project-config/presets/rail/classes/PLF.json';
import rleClassConfig from '../../../project-config/presets/rail/classes/RLE.json';
import rodClassConfig from '../../../project-config/presets/road/classes/ROD.json';
import sbpClassConfig from '../../../project-config/presets/rail/classes/SBP.json';
import staClassConfig from '../../../project-config/presets/rail/classes/STA.json';
import stbClassConfig from '../../../project-config/presets/rail/classes/STB.json';
import stfClassConfig from '../../../project-config/presets/rail/classes/STF.json';
import tppClassConfig from '../../../project-config/presets/teleport/classes/TPP.json';
import trpClassConfig from '../../../project-config/presets/trade/classes/TRP.json';
import wrpClassConfig from '../../../project-config/presets/warp/classes/WRP.json';

export const OPENRIAMAP_RIA_CLASS_CONFIGS = [
  budClassConfig,
  flrClassConfig,
  isgClassConfig,
  islClassConfig,
  ispClassConfig,
  pfbClassConfig,
  plfClassConfig,
  rleClassConfig,
  rodClassConfig,
  sbpClassConfig,
  staClassConfig,
  stbClassConfig,
  stfClassConfig,
  tppClassConfig,
  trpClassConfig,
  wrpClassConfig,
] as CairnMapClassConfig[];

export function getOpenRIAMapClassConfigs(): CairnMapClassConfig[] {
  return OPENRIAMAP_RIA_CLASS_CONFIGS;
}

export function getOpenRIAMapClassConfigByCode(classCode: string): CairnMapClassConfig | undefined {
  const normalized = String(classCode ?? '').trim().toUpperCase();
  if (!normalized) return undefined;
  return OPENRIAMAP_RIA_CLASS_CONFIGS.find((item) => item.classCode.toUpperCase() === normalized);
}

export function getOpenRIAMapClassConfigByKey(classKey: string): CairnMapClassConfig | undefined {
  const normalized = String(classKey ?? '').trim();
  if (!normalized) return undefined;
  return OPENRIAMAP_RIA_CLASS_CONFIGS.find(
    (item) => item.classKey === normalized || item.sourceFeatureKey === normalized
  );
}
