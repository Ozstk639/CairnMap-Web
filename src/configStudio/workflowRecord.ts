import { featureTypeFromGeometryType, multipartGeometryFromSinglePath, withCanonicalMultipartGeometry, type MultipartCoord, type MultipartGeometry } from '../core/geometry/multipartGeometry';
import { resolveEffectiveFields } from './runtime';
import type { ConfigPackageV3, WorkflowOutput } from './types';
import { isSafeWorkflowTarget } from './workflowExpression';

/** Serialize authored V3 fields into the shared feature record contract. */
export function finalizeV3WorkflowRecord(config: ConfigPackageV3, output: WorkflowOutput, raw: Record<string, unknown>, options: { coords: MultipartCoord[]; geometry?:MultipartGeometry; now: Date; preservePaths?:string[] }): Record<string, unknown> {
  const fields = new Map(resolveEffectiveFields(config, output.classification).map((field) => [field.key, field]));
  const input = structuredClone(raw);
  for (const field of fields.values()) if (field.defaultValue !== undefined && isSafeWorkflowTarget(field.key)) {
    const parts = field.key.split('.');
    let node: Record<string, unknown> = input;
    let blocked = false;
    for (const key of parts.slice(0,-1)) {
      const value = node[key];
      if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) { blocked = true; break; }
      if (value === undefined) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    if (blocked) continue;
    const key = parts[parts.length - 1]; if (node[key] === undefined) node[key] = structuredClone(field.defaultValue);
  }
  const preserved=new Set(options.preservePaths??[]);
  const clean = (value: unknown, path: string): unknown => {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value.length ? value.map((item) => clean(item, path)) : preserved.has(path)?[]:undefined;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).flatMap(([key, item]) => {
        const next = clean(item, path ? `${path}.${key}` : key);
        return next === undefined ? [] : [[key, next]];
      });
      return entries.length ? Object.fromEntries(entries) : preserved.has(path)?{}:undefined;
    }
    const field = fields.get(path);
    if (value === '' && !preserved.has(path) && !field?.required && field?.emptyValue !== 'preserve') return undefined;
    if (field?.type === 'number' && value !== null && value !== '') { const number = Number(value); return Number.isFinite(number) ? number : value; }
    if (field?.type === 'boolean' && typeof value === 'string') return value === 'true' ? true : value === 'false' ? false : value;
    return value;
  };
  const record = clean(input, '') as Record<string, unknown>;
  const creator = String(raw.Creator ?? '').trim();
  delete record.Creator;
  if (creator) record.CreateBy = creator;
  const date = options.now;
  record.CreateTime = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  record.Type = featureTypeFromGeometryType(output.geometry.selected);
  return withCanonicalMultipartGeometry(record, options.geometry ?? multipartGeometryFromSinglePath(output.geometry.selected, options.coords));
}
