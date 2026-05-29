import type { FeatureDisplayRuleDraft } from '../../components/Rules/rendering/display/displayTypes';
import type { CairnMapDisplayRule, CairnMapDisplayRuleMetadata } from './displayTypes';
import type { CairnMapRelationBindingItem, CairnMapResolvedSpecialLogic } from './specialDisplayLogicTypes';

export type CairnMapDisplayRuntimeMode =
  | 'legacyPrimary'
  | 'configOverlay'
  | 'configPrimary'
  | 'legacyAlgorithmFallback';

export type CairnMapDisplayRuntimeOverlayGroup = 'point' | 'line' | 'surface' | 'none';

export const DISPLAY_RUNTIME_POINT_CLASS_CODES = [
  'TPP',
  'WRP',
  'TRP',
  'ISP',
  'SBP',
  'PLF',
  'STA',
] as const;

export const DISPLAY_RUNTIME_LINE_CLASS_CODES = [
  'RLE',
  'ROD',
  'ISL',
] as const;

export const DISPLAY_RUNTIME_SURFACE_CLASS_CODES = [
  'ISG',
  'BUD',
  'FLR',
  'STB',
  'STF',
  'PFB',
] as const;

export const DISPLAY_RUNTIME_CORE_CLASS_CODES = [
  ...DISPLAY_RUNTIME_POINT_CLASS_CODES,
  ...DISPLAY_RUNTIME_LINE_CLASS_CODES,
  ...DISPLAY_RUNTIME_SURFACE_CLASS_CODES,
] as const;

export type CairnMapDisplayRuntimeClassCode = (typeof DISPLAY_RUNTIME_CORE_CLASS_CODES)[number];


export const DISPLAY_RUNTIME_CONFIG_PRIMARY_POINT_CLASS_CODES = [
  ...DISPLAY_RUNTIME_POINT_CLASS_CODES,
] as const;

export const DISPLAY_RUNTIME_CONFIG_PRIMARY_LINE_SURFACE_CLASS_CODES = [
  'ROD',
  'ISL',
  'ISG',
] as const;

export const DISPLAY_RUNTIME_CONFIG_PRIMARY_CLASS_CODES = [
  ...DISPLAY_RUNTIME_CONFIG_PRIMARY_POINT_CLASS_CODES,
  ...DISPLAY_RUNTIME_CONFIG_PRIMARY_LINE_SURFACE_CLASS_CODES,
] as const;

export const DISPLAY_RUNTIME_LEGACY_ALGORITHM_FALLBACK_CLASS_CODES = [
  'RLE',
  'BUD',
  'FLR',
  'STB',
  'STF',
  'PFB',
] as const;

export type CairnMapRuntimeProfileResolution = {
  configProfileId: string;
  sourceRuntimeProfile: string;
  runtimeDisplay: FeatureDisplayRuleDraft | null;
  resolved: boolean;
};

export type CairnMapDisplayRuntimeContract = {
  classCode: string;
  mode: CairnMapDisplayRuntimeMode;
  overlayGroup: CairnMapDisplayRuntimeOverlayGroup;
  rule: CairnMapDisplayRule | null;
  ruleMetadata: CairnMapDisplayRuleMetadata | null;
  runtimeProfile: CairnMapRuntimeProfileResolution | null;
  specialLogic: CairnMapResolvedSpecialLogic[];
  relationBindings: CairnMapRelationBindingItem[];
  preserveLegacyDynamicLabel: boolean;
  fallbackReason?: string;
  configSource?: string;
  algorithmExecution?: string;
};

export type CairnMapDisplayRuntimeModePolicy = {
  mode: CairnMapDisplayRuntimeMode;
  preserveLegacyDynamicLabel?: boolean;
  fallbackReason?: string;
};

export type CairnMapDisplayRuntimeContractConfigItem = {
  classCode: string;
  mode: CairnMapDisplayRuntimeMode;
  preserveLegacyDynamicLabel?: boolean;
  fallbackReason?: string;
  notes?: string;
};

export type CairnMapDisplayRuntimeContractsConfig = {
  schemaVersion: string;
  projectId?: string;
  items: CairnMapDisplayRuntimeContractConfigItem[];
};
