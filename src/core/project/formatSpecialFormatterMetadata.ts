import formatSpecialFormattersConfigJson from '../../../project-config/presets/core-structures/shared/format/formatSpecialFormatters.json';

import type { CairnMapSpecialFormatterConfigItem, CairnMapSpecialFormattersConfig } from './formatSpecialFormatterTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export const OPENRIAMAP_RIA_FORMAT_SPECIAL_FORMATTERS_CONFIG =
  formatSpecialFormattersConfigJson as CairnMapSpecialFormattersConfig;

export function getFormatSpecialFormattersConfig(): CairnMapSpecialFormattersConfig {
  return OPENRIAMAP_RIA_FORMAT_SPECIAL_FORMATTERS_CONFIG;
}

export function listSpecialFormatterConfigItems(): CairnMapSpecialFormatterConfigItem[] {
  return OPENRIAMAP_RIA_FORMAT_SPECIAL_FORMATTERS_CONFIG.items ?? [];
}

export function getSpecialFormatterConfigByKey(key: string): CairnMapSpecialFormatterConfigItem | undefined {
  const normalized = normalize(key);
  return listSpecialFormatterConfigItems().find((item) => item.key === normalized);
}

export function getSpecialFormatterConfigByClassCode(classCode: string): CairnMapSpecialFormatterConfigItem | undefined {
  const normalizedClassCode = normalizeClassCode(classCode);
  return listSpecialFormatterConfigItems().find((item) => item.classCodes.map(normalizeClassCode).includes(normalizedClassCode));
}
