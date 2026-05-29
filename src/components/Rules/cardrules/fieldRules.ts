// CairnMap LEGACY CLEANUP: card field rendering helpers only.
// Do not add new Class-level card layouts here.
import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import { buildCardRowsFromRegistry } from './cardRegistryRows';
import type { CardInteractiveValue } from './cardInteractions';
import type { RailNewIndex } from '../../Navigation/railNewIndex';

export type CardColorChip = {
  kind: 'colorChip';
  color: string;
  text: string;
};

export type CardLineChips = {
  kind: 'lineChips';
  items: Array<{ name: string; color: string; text?: string }>;
};

export type CardRichValue = CardColorChip | CardLineChips | CardInteractiveValue;

export type CardRow = {
  label: string;
  value: any;
  usedPaths?: string[];
};

export type InfoSections = {
  /** 主要信息（默认直接展示） */
  mainRows: CardRow[];
  /** 其他信息（默认收起，用户可展开） */
  otherRows: CardRow[];
};

export function buildInfoSectionsForFeature(
  feature: FeatureRecord,
  railIndex?: RailNewIndex | null,
  _options?: { disableFieldRules?: boolean },
): InfoSections {
  const { mainRows, otherRows } = buildCardRowsFromRegistry(feature, railIndex);
  return { mainRows, otherRows };
}

// 兼容旧调用：仍保留拼接后的版本
export function buildInfoRowsForFeature(feature: FeatureRecord): CardRow[] {
  const { mainRows, otherRows } = buildInfoSectionsForFeature(feature, null);
  return [...mainRows, ...otherRows];
}

function pickFirstString(fi: any, candidates: string[]): string {
  for (const k of candidates) {
    const s = String(fi?.[k] ?? '').trim();
    if (s) return s;
  }
  return '';
}

// =========================
// 标题（Name 字段）解析
// =========================
export function pickFeatureDisplayName(feature?: FeatureRecord | null): string {
  if (!feature) return '';
  const fi: any = feature.featureInfo ?? {};

  const direct = pickFirstString(fi, ['Name', 'name', 'staName']);
  if (direct) return direct;

  for (const k of Object.keys(fi)) {
    if (!/name$/i.test(k)) continue;
    const s = String(fi?.[k] ?? '').trim();
    if (s) return s;
  }

  const cls = String(feature?.meta?.Class ?? '').trim();
  const id = String(feature?.meta?.idValue ?? '').trim();
  if (cls || id) return `${cls || 'Feature'}${id ? `: ${id}` : ''}`;
  return '';
}
