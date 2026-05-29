import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import { resolvePictureEntriesForFeature, type FeaturePictureEntry } from '@/components/Rules/cardrules/pictureRules';

export type MinimalFeatureEditPackage = {
  feature: Record<string, unknown>;
  pictures: FeaturePictureEntry[];
};

export async function buildMinimalFeatureEditPackage(feature?: FeatureRecord | null): Promise<MinimalFeatureEditPackage | null> {
  if (!feature) return null;
  const featureInfo = (feature.featureInfo ?? {}) as Record<string, unknown>;
  const copied = JSON.parse(JSON.stringify(featureInfo || {}));
  const pictures = await resolvePictureEntriesForFeature(feature);
  return { feature: copied, pictures };
}
