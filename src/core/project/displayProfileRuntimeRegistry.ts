import { DISPLAY_PROFILES } from '../../components/Rules/rendering/display/displayProfiles';
import type { FeatureDisplayRuleDraft } from '../../components/Rules/rendering/display/displayTypes';
import { getDisplayProfileById } from './displayMetadata';
import type { CairnMapRuntimeProfileResolution } from './displayRuntimeTypes';

const RUNTIME_PROFILE_KEY_BY_CONFIG_PROFILE: Record<string, keyof typeof DISPLAY_PROFILES> = {
  largeGeoSurface: 'largeGeoSurface',
  networkLine: 'networkLine',
  buildingStructure: 'buildingStructure',
  stationStructure: 'stationStructure',
  transportNode: 'transportNode',
  poiPoint: 'poiPoint',
  indoorUnit: 'indoorUnit',
  geometryOnlyFallback: 'geometryOnlyFallback',
};

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

export function listRuntimeDisplayProfileIds(): string[] {
  return Object.keys(DISPLAY_PROFILES).sort();
}

export function getRuntimeDisplayProfileByKey(profileKey: string): FeatureDisplayRuleDraft | null {
  const normalized = normalize(profileKey) as keyof typeof DISPLAY_PROFILES;
  if (!normalized) return null;
  return DISPLAY_PROFILES[normalized] ?? null;
}

export function resolveRuntimeDisplayProfile(profileId: string): CairnMapRuntimeProfileResolution {
  const configProfileId = normalize(profileId);
  const configProfile = getDisplayProfileById(configProfileId);
  const declaredRuntimeProfile = normalize(configProfile?.sourceRuntimeProfile) || configProfileId;
  const mappedRuntimeProfile = RUNTIME_PROFILE_KEY_BY_CONFIG_PROFILE[configProfileId] ?? declaredRuntimeProfile;
  const runtimeDisplay = getRuntimeDisplayProfileByKey(mappedRuntimeProfile);

  return {
    configProfileId,
    sourceRuntimeProfile: mappedRuntimeProfile,
    runtimeDisplay,
    resolved: Boolean(configProfile && runtimeDisplay),
  };
}

export function hasRuntimeDisplayProfile(profileId: string): boolean {
  return resolveRuntimeDisplayProfile(profileId).resolved;
}
