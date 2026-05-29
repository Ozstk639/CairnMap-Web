import type { CairnMapLegacyFormatSummary, CairnMapSchemaFormatDiff } from './formatTypes';
import type { CairnMapResolvedClassSchema } from './schemaTypes';

const asSet = (items: string[]) => new Set(items.filter(Boolean));

function diffMissing(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((item) => !right.has(item)).sort();
}

export function compareClassSchemaWithLegacyFormat(
  schema: CairnMapResolvedClassSchema,
  legacy: CairnMapLegacyFormatSummary
): CairnMapSchemaFormatDiff {
  const schemaFields = asSet(schema.fields.map((field) => field.key));
  const legacyFields = asSet(legacy.fields);

  const schemaGroups = new Map(schema.groups.map((group) => [group.key, group.fields.map((field) => field.key)]));
  const legacyGroups = new Map(legacy.groups.map((group) => [group.key, group.fields]));
  const groupMismatches: string[] = [];

  for (const [groupKey, schemaGroupFields] of schemaGroups) {
    const legacyGroupFields = legacyGroups.get(groupKey);
    if (!legacyGroupFields) {
      groupMismatches.push(`${groupKey}: missing in legacy`);
      continue;
    }
    const missingLegacy = diffMissing(asSet(schemaGroupFields), asSet(legacyGroupFields));
    const missingSchema = diffMissing(asSet(legacyGroupFields), asSet(schemaGroupFields));
    if (missingLegacy.length || missingSchema.length) {
      groupMismatches.push(`${groupKey}: missingInLegacy=${missingLegacy.join(',') || '-'} missingInSchema=${missingSchema.join(',') || '-'}`);
    }
  }

  for (const groupKey of legacyGroups.keys()) {
    if (!schemaGroups.has(groupKey)) groupMismatches.push(`${groupKey}: missing in schema`);
  }

  return {
    classCode: schema.classCode,
    sourceFeatureKey: schema.sourceFeatureKey,
    fieldCount: { schema: schemaFields.size, legacy: legacyFields.size },
    groupCount: { schema: schemaGroups.size, legacy: legacyGroups.size },
    missingInSchema: diffMissing(legacyFields, schemaFields),
    missingInLegacy: diffMissing(schemaFields, legacyFields),
    groupMismatches,
  };
}

export function summarizeSchemaFormatDiff(diff: CairnMapSchemaFormatDiff): string {
  const parts = [
    `${diff.classCode}`,
    `fields ${diff.fieldCount.schema}/${diff.fieldCount.legacy}`,
    `groups ${diff.groupCount.schema}/${diff.groupCount.legacy}`,
  ];
  if (diff.missingInSchema.length) parts.push(`missingInSchema=${diff.missingInSchema.join(',')}`);
  if (diff.missingInLegacy.length) parts.push(`missingInLegacy=${diff.missingInLegacy.join(',')}`);
  if (diff.groupMismatches.length) parts.push(`groupMismatches=${diff.groupMismatches.length}`);
  return parts.join(' | ');
}
