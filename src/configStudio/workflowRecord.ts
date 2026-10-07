import { featureTypeFromGeometryType, multipartGeometryFromSinglePath, withCanonicalMultipartGeometry, type MultipartCoord } from '../core/geometry/multipartGeometry';
import { resolveEffectiveFields } from './runtime';
import type { ConfigPackageV3, WorkflowOutput } from './types';

/** Serialize authored V3 fields into the shared feature record contract. */
export function finalizeV3WorkflowRecord(config: ConfigPackageV3, output: WorkflowOutput, raw: Record<string, unknown>, options: { coords: MultipartCoord[]; now: Date }): Record<string, unknown> {
  const fields = new Map(resolveEffectiveFields(config, output.classification).map((field) => [field.key, field]));
  const clean = (value: unknown, path: string): unknown => {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value.length ? value.map((item) => clean(item, path)) : undefined;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).flatMap(([key, item]) => {
        const next = clean(item, path ? `${path}.${key}` : key);
        return next === undefined ? [] : [[key, next]];
      });
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    const field = fields.get(path);
    if (value === '' && !field?.required) return undefined;
    if (field?.type === 'number' && value !== null && value !== '') { const number = Number(value); return Number.isFinite(number) ? number : value; }
    if (field?.type === 'boolean' && typeof value === 'string') return value === 'true' ? true : value === 'false' ? false : value;
    return value;
  };
  const record = clean(raw, '') as Record<string, unknown>;
  const creator = String(raw.Creator ?? '').trim();
  delete record.Creator;
  if (creator) record.CreateBy = creator;
  const date = options.now;
  record.CreateTime = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  record.Type = featureTypeFromGeometryType(output.geometry.selected);
  return withCanonicalMultipartGeometry(record, multipartGeometryFromSinglePath(output.geometry.selected, options.coords));
}
