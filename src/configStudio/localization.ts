import type { ConfigPackageV3, LocalizedText } from './types';

/** Explicit English stays independent; clear the known copied-Chinese residue. */
export function normalizeImportedText(zh: unknown, en: unknown): LocalizedText {
  const chinese = String(zh ?? ''); const english = String(en ?? '');
  return { zh: chinese, en: /[\u3400-\u9fff]/.test(chinese) && english.trim() === chinese.trim() ? '' : english };
}

export function normalizeImportedLocalization(config: ConfigPackageV3): ConfigPackageV3 {
  if(config.contractRevision>=8)return structuredClone(config);
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const record = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    return 'zh' in record && 'en' in record ? { ...record, ...normalizeImportedText(record.zh, record.en) } : record;
  };
  return visit(config) as ConfigPackageV3;
}
