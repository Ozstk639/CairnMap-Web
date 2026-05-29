import { getClassSchema, listClassSchemas } from './schemaMetadata';
import { getFormatRuntimeContractByClassCode, listFormatRuntimeContracts } from './formatRuntimeContracts';

export type CairnMapFeatureFormatRuntimeRegistryItem = {
  classCode: string;
  sourceFeatureKey?: string;
  schemaOwned: boolean;
  formatMode?: string;
  formatterKey?: string;
};

export function listFeatureFormatRuntimeRegistryItems(): CairnMapFeatureFormatRuntimeRegistryItem[] {
  return listClassSchemas().map((schema) => {
    const contract = getFormatRuntimeContractByClassCode(schema.classCode);
    return {
      classCode: schema.classCode,
      sourceFeatureKey: schema.sourceFeatureKey,
      schemaOwned: true,
      formatMode: contract?.formatMode,
      formatterKey: contract?.formatterKey,
    };
  });
}

export function getFeatureFormatRuntimeRegistryItem(classCode: string): CairnMapFeatureFormatRuntimeRegistryItem | undefined {
  const schema = getClassSchema(classCode);
  if (!schema) return undefined;
  const contract = getFormatRuntimeContractByClassCode(schema.classCode);
  return {
    classCode: schema.classCode,
    sourceFeatureKey: schema.sourceFeatureKey,
    schemaOwned: true,
    formatMode: contract?.formatMode,
    formatterKey: contract?.formatterKey,
  };
}

export function listFeatureFormatRuntimeContractClassCodes(): string[] {
  return listFormatRuntimeContracts().map((item) => item.classCode);
}
