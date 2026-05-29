import type {
  CairnMapClassFieldConfig,
  CairnMapClassGroupConfig,
} from './classTypes';
import {
  getClassConfigByCode,
  getClassConfigByFeatureKey,
  getClassFieldConfig,
  getClassGeometryByCode,
  getClassGroupConfig,
  listClassConfigs,
} from './classMetadata';
import { getSchemaRuntimeContractByClassCode, listSchemaRuntimeContracts } from './schemaRuntimeContracts';
import type { CairnMapResolvedClassSchema, CairnMapSchemaRuntimeContract } from './schemaTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export function listClassSchemas(): CairnMapResolvedClassSchema[] {
  return listClassConfigs().map((config) => ({
    classCode: config.classCode,
    classKey: config.classKey,
    sourceFeatureKey: config.sourceFeatureKey,
    config,
    geometry: config.geometry,
    identity: config.identity,
    fields: config.fields ?? [],
    groups: config.groups ?? [],
    classification: config.classification,
    tags: config.tags,
    extensions: config.extensions,
    contract: getSchemaRuntimeContractByClassCode(config.classCode),
  }));
}

export function getClassSchema(classCode: string): CairnMapResolvedClassSchema | undefined {
  const normalized = normalizeClassCode(classCode);
  return listClassSchemas().find((schema) => normalizeClassCode(schema.classCode) === normalized);
}

export function getClassSchemaByFeatureKey(featureKey: string): CairnMapResolvedClassSchema | undefined {
  const config = getClassConfigByFeatureKey(featureKey);
  return config ? getClassSchema(config.classCode) : undefined;
}

export function getClassFieldSchema(
  classCode: string,
  fieldKey: string
): CairnMapClassFieldConfig | undefined {
  return getClassFieldConfig(classCode, fieldKey);
}

export function getClassGroupSchema(
  classCode: string,
  groupKey: string
): CairnMapClassGroupConfig | undefined {
  return getClassGroupConfig(classCode, groupKey);
}

export function getClassGeometrySchema(classCode: string) {
  return getClassGeometryByCode(classCode);
}

export function getClassIdentitySchema(classCode: string) {
  return getClassConfigByCode(classCode)?.identity;
}

export function listClassSchemaContracts(): CairnMapSchemaRuntimeContract[] {
  return listSchemaRuntimeContracts();
}

export function getClassCodeByFeatureKey(featureKey: string): string | undefined {
  return getClassConfigByFeatureKey(featureKey)?.classCode;
}

export function listSchemaFieldKeys(classCode: string): string[] {
  return getClassSchema(classCode)?.fields.map((field) => field.key) ?? [];
}

export function hasClassSchemaField(classCode: string, fieldKey: string): boolean {
  const key = normalize(fieldKey);
  if (!key) return false;
  const schema = getClassSchema(classCode);
  if (!schema) return false;
  if (schema.fields.some((field) => normalize(field.key) === key || normalize(field.sourceRuntimeField) === key)) {
    return true;
  }
  const identity = schema.identity;
  return [identity.idField, identity.nameField, identity.displayNameField].some((item) => normalize(item) === key);
}
