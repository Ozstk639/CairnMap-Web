import type { FeatureRecord } from './renderRules';
import { flattenMultipartCoordinates, type MultipartGeometry } from '@/core/geometry/multipartGeometry';

/** Keep source identity/card data, but give anchor/layout one component geometry. */
export function featureLabelParts(record: FeatureRecord, mode: 'featureBbox' | 'perPart'): Array<{ partIndex?: number; record: FeatureRecord }> {
  const geometry = record.multipartGeometry;
  if (mode !== 'perPart' || !geometry || geometry.parts.length < 2) return [{ record }];
  return geometry.parts.map((part, partIndex) => {
    const component = { type: geometry.type, parts: [part] } as MultipartGeometry;
    const coordinates = flattenMultipartCoordinates(component);
    return { partIndex, record: { ...record, multipartGeometry: component, coords3: coordinates, ...(geometry.type === 'Point' ? { p3: coordinates[0] } : {}) } };
  });
}

export function componentLabelId(featureUid: string, partIndex?: number): string {
  return partIndex === undefined ? `${featureUid}#label` : `${featureUid}#label#part-${partIndex}`;
}

/** Filter drawing parts without changing the original feature/card identity. */
export function filterFeatureGeometryParts(record: FeatureRecord, accepts: (part: FeatureRecord) => boolean): FeatureRecord | undefined {
  const geometry = record.multipartGeometry;
  if (!geometry || geometry.parts.length < 2) return accepts(record) ? record : undefined;
  const accepted = featureLabelParts(record, 'perPart').filter(({ record: part }) => accepts(part));
  if (!accepted.length) return undefined;
  if (accepted.length === geometry.parts.length) return record;
  const filtered = { type: geometry.type, parts: accepted.map(({ record: part }) => part.multipartGeometry!.parts[0]) } as MultipartGeometry;
  const coordinates = flattenMultipartCoordinates(filtered);
  return { ...record, multipartGeometry: filtered, coords3: coordinates, ...(geometry.type === 'Point' ? { p3: coordinates[0] } : {}) };
}
