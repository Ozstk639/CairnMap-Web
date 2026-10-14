/** Independent oracle: V1 registry paths plus the real V1 production formatter.
 * Never reads V3 assignments or calls the V3 expression evaluator.
 */
import { getFormatDef, TAG_KEY_OTHER, TAG_REGISTRY, type FeatureKey } from '../../src/components/Common/featureFormats';
import { projectRegistryScene, setByPath, type WorkflowEditorSchema } from '../../src/components/Common/workflowEditorRegistry';
import type { ClassificationPath } from '../../src/configStudio/types';
import type { MultipartCoord } from '../../src/core/geometry/multipartGeometry';

export function assembleV1SchemaRecord(schema: WorkflowEditorSchema, inputs: Record<string, unknown>, options: { classification: ClassificationPath; world: string; worldPrefix: string; actor: string; coords: MultipartCoord[]; now: Date }): Record<string, unknown> {
  const projected = projectRegistryScene(schema, 'workflow');
  const path = options.classification;
  const raw: Record<string, unknown> = { Kind: path.kind, SKind: path.skind, SKind2: path.skind2 };
  for (const field of projected.fields) {
    const value = inputs[field.key];
    setByPath(raw, field.path, typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : value);
  }
  if (schema.idField.workflow?.visible) raw.ID = inputs.ID;
  const abbr = String(inputs.abbr ?? '').trim().replace(/\s+/g, '').replace(/[^A-Za-z0-9_-]/g, '');
  const category = String(inputs.catAbbr ?? '').trim().replace(/\s+/g, '').replace(/[^A-Za-z0-9_-]/g, '');
  const classCode = path.class;
  if (['BUD', 'FLR', 'ROD'].includes(classCode)) raw.ID = `${options.worldPrefix}${classCode}${category ? `_${category}` : ''}_${abbr}`;
  else if (['ISG', 'ISL', 'ISP'].includes(classCode)) raw.ID = `${options.worldPrefix}${path.kind ?? ''}${path.skind ?? ''}${path.skind2 ?? ''}_${abbr}`;
  else if (['TPP', 'WRP'].includes(classCode)) raw.ID = `${options.worldPrefix}${classCode}${path.kind ?? ''}${path.skind ?? ''}_${abbr}`;
  const tags = raw.tags as Record<string, unknown> | undefined;
  const extensions = raw.extensions as Record<string, Record<string, unknown>> | undefined;
  const groups: Record<string, unknown[]> = {};
  for (const group of projected.groups) groups[group.path] = (inputs[group.key] as unknown[]) ?? [];
  groups.tags = Object.entries(tags ?? {}).map(([key, value]) => ({ tagKey: TAG_REGISTRY[key] ? key : TAG_KEY_OTHER, tagKeyOther: key, tagValue: value }));
  groups.extensions = Object.entries(extensions ?? {}).flatMap(([group, fields]) => Object.entries(fields).map(([key, value]) => ({ extGroup: group, extKey: key, extType: 'text', extValue: value })));
  const definition = getFormatDef(schema.match.subType as FeatureKey);
  const mode = options.classification.class === 'ISL' || options.classification.class === 'ROD' ? 'polyline' : options.classification.class === 'ISG' || options.classification.class === 'BUD' || options.classification.class === 'FLR' ? 'polygon' : 'point';
  return definition.buildFeatureInfo({ op: 'create', mode, values: raw, groups, coords: options.coords, editorId: options.actor, worldId: options.world, now: options.now });
}
