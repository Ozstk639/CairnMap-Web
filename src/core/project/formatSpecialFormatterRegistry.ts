import { getFormatRuntimeContractByClassCode } from './formatRuntimeContracts';
import {
  getSpecialFormatterConfigByClassCode,
  getSpecialFormatterConfigByKey,
  listSpecialFormatterConfigItems,
} from './formatSpecialFormatterMetadata';

export type CairnMapSpecialFormatterDescriptor = {
  key: string;
  classCodes: string[];
  runtimeStatus: 'legacyFallback' | 'planned' | 'active' | 'configPrimary' | string;
  description?: string;
};

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export function listSpecialFormatterDescriptors(): CairnMapSpecialFormatterDescriptor[] {
  return listSpecialFormatterConfigItems().map((item) => ({
    key: item.key,
    classCodes: item.classCodes,
    runtimeStatus: item.runtimeStatus,
    description: item.description,
  }));
}

export const SPECIAL_FORMATTER_DESCRIPTORS: CairnMapSpecialFormatterDescriptor[] = listSpecialFormatterDescriptors();

export function getSpecialFormatterDescriptor(formatterKey: string): CairnMapSpecialFormatterDescriptor | undefined {
  const item = getSpecialFormatterConfigByKey(formatterKey);
  if (!item) return undefined;
  return {
    key: item.key,
    classCodes: item.classCodes,
    runtimeStatus: item.runtimeStatus,
    description: item.description,
  };
}

export function getSpecialFormatterDescriptorByClassCode(classCode: string): CairnMapSpecialFormatterDescriptor | undefined {
  const normalized = normalizeClassCode(classCode);
  const contract = getFormatRuntimeContractByClassCode(normalized);
  if (contract?.formatterKey) return getSpecialFormatterDescriptor(contract.formatterKey);
  const item = getSpecialFormatterConfigByClassCode(normalized);
  if (!item) return undefined;
  return {
    key: item.key,
    classCodes: item.classCodes,
    runtimeStatus: item.runtimeStatus,
    description: item.description,
  };
}

export function hasRegisteredSpecialFormatter(formatterKey: string): boolean {
  return Boolean(getSpecialFormatterDescriptor(formatterKey));
}
