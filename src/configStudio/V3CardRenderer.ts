import type { CardItem, ClassificationPath, ConfigPackageV3 } from './types';
import { resolveCardConfiguration, resolveEffectiveFields } from './runtime';
import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import type { CardRow, InfoSections } from '@/components/Rules/cardrules/fieldRules';
import type { RailNewIndex } from '@/components/Navigation/railNewIndex';
import {
  makeExternalLink,
  makeFeatureLink,
  makeFeatureLinkList,
} from '@/components/Rules/cardrules/cardInteractions';
import {
  buildPlatformLineChipsRow,
  buildStationBuildingLineChipsRow,
  buildStationLineChipsRow,
} from '@/components/Rules/cardrules/cardEnhancements';

/**
 * Declarative information-card executor for V3. It deliberately produces the
 * same row values consumed by FeatureInteractionCard, so normal cards remain
 * editable V3 data rather than silently becoming Class-specific components.
 * TRP is the only deliberately specialised component-card exception.
 */
function valueAt(record: FeatureRecord, source: string): unknown {
  if (source === 'ID') return record.meta?.idValue ?? record.featureInfo?.ID;
  return source.split('.').reduce<unknown>((value, key) => value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined, record.featureInfo as Record<string, unknown>);
}

function valueWithin(value: unknown, path?: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object'
    ? (current as Record<string, unknown>)[key]
    : undefined, value);
}

function classificationFor(record: FeatureRecord): ClassificationPath {
  const value = (key: string) => String((record.featureInfo as Record<string, unknown>)?.[key] ?? record.meta?.sig?.[key] ?? '').trim();
  const kind = value('Kind');
  const skind = value('Skind') || value('SKind');
  const skind2 = value('Skind2') || value('SKind2');
  return {
    class: String(record.meta?.Class ?? value('Class')).trim(),
    ...(kind ? { kind } : {}),
    ...(skind ? { skind } : {}),
    ...(skind2 ? { skind2 } : {}),
  };
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function labelFor(item: CardItem): string {
  return item.label?.zh?.trim() || item.source;
}

function relationTarget(item: CardItem) {
  const target = item.relation?.targetClassification;
  return {
    classCode: target?.class,
    kind: target?.kind,
    skind: target?.skind,
    skind2: target?.skind2,
    matchField: item.relation?.targetMatchField || 'ID',
    displayField: item.relation?.targetDisplayField || 'Name',
    fallbackDisplay: item.relation?.fallbackDisplay || 'raw',
  } as const;
}

function relationValues(raw: unknown, item: CardItem): string[] {
  const candidates = item.relation?.multiple || Array.isArray(raw) ? (Array.isArray(raw) ? raw : [raw]) : [raw];
  return candidates
    .map((value) => text(valueWithin(value, item.relation?.sourceValuePath)).trim())
    .filter(Boolean);
}

function lineChipsRow(item: CardItem, record: FeatureRecord, railIndex?: RailNewIndex | null): CardRow | undefined {
  const source = item.options?.lineChipSource;
  if (source === 'platform') return { ...buildPlatformLineChipsRow(record, railIndex), label: labelFor(item) };
  if (source === 'station') return { ...buildStationLineChipsRow(record, railIndex), label: labelFor(item) };
  if (source === 'stationBuilding') return { ...buildStationBuildingLineChipsRow(record, railIndex), label: labelFor(item) };
  return undefined;
}

function rowFor(item: CardItem, record: FeatureRecord, railIndex?: RailNewIndex | null): CardRow | undefined {
  if (!item.visible) return undefined;
  if (item.renderer === 'lineChips') return lineChipsRow(item, record, railIndex);

  const raw = valueAt(record, item.source);
  const rawText = text(raw).trim();
  const label = labelFor(item);
  const colorText = text(valueAt(record, item.options?.colorSource || item.source)).trim();
  const needsValue = item.renderer !== 'media' && item.renderer !== 'colorCapsule';
  if (!rawText && needsValue && item.hideWhenEmpty !== false) return undefined;

  if (item.renderer === 'relationLink') {
    const values = relationValues(raw, item);
    if (!values.length) return item.hideWhenEmpty === false ? { label, value: '' } : undefined;
    if (item.relation?.clickable === false) return { label, value: item.relation?.multiple || values.length > 1 ? values.join(', ') : values[0] };
    const target = relationTarget(item);
    if (item.relation?.multiple || values.length > 1) {
      return { label, value: makeFeatureLinkList(values.map((targetId) => makeFeatureLink(targetId, undefined, target))) };
    }
    return { label, value: makeFeatureLink(values[0], undefined, target) };
  }
  if (item.renderer === 'colorCapsule') {
    const color = colorText || item.options?.fallbackColor || '#64748b';
    if (!rawText && !colorText && item.hideWhenEmpty !== false) return undefined;
    return { label, value: { kind: 'colorChip', color, text: rawText || color } };
  }
  if (item.renderer === 'nameColorCapsule') {
    const color = colorText || item.options?.fallbackColor || '#64748b';
    const name = text(valueAt(record, item.options?.nameSource || item.source)).trim() || rawText;
    if (!name && item.hideWhenEmpty !== false) return undefined;
    return { label, value: { kind: 'lineChips', items: name ? [{ name, color, text: rawText || color }] : [] } };
  }
  if (item.renderer === 'tag') {
    if (!rawText && item.hideWhenEmpty !== false) return undefined;
    return { label, value: { kind: 'tag', text: rawText, color: item.options?.tagColor || item.options?.fallbackColor } };
  }
  if (item.renderer === 'media') {
    return rawText ? { label, value: item.options?.mediaSource === 'external-url' ? makeExternalLink(rawText, rawText) : rawText } : undefined;
  }
  if (item.options?.format === 'externalLink') return rawText ? { label, value: makeExternalLink(rawText, rawText) } : undefined;
  if (item.options?.format === 'boolean') return { label, value: raw === true || rawText === 'true' ? '是' : '否' };
  if (item.options?.format === 'json') return { label, value: rawText };
  return { label, value: rawText };
}

/** Returns undefined for the deliberately specialised TRP card. */
export function buildV3CardSections(
  config: ConfigPackageV3 | undefined,
  record: FeatureRecord,
  railIndex?: RailNewIndex | null,
): InfoSections | undefined {
  if (!config || config.contractRevision !== 5) return undefined;
  const path = classificationFor(record);
  const card = resolveCardConfiguration(config, path);
  if (!card || card.mode === 'component') return undefined;
  const items = card.mode === 'fields'
    ? card.items
    : resolveEffectiveFields(config, path).map((field) => ({
      id: `layout-fallback-${field.key}`,
      source: field.key,
      visible: field.scenes?.infocard !== false,
      hideWhenEmpty: true,
      section: 'main' as const,
      renderer: field.reference ? 'relationLink' as const : 'text' as const,
      label: field.labels,
      ...(field.reference ? {
        relation: {
          targetClassification: { class: field.reference.classCode },
          targetMatchField: field.reference.matchField,
          targetDisplayField: field.reference.displayField,
          clickable: true,
        },
      } : {}),
    }));
  const mainRows: CardRow[] = [];
  const otherRows: CardRow[] = [];
  for (const item of items) {
    const row = rowFor(item, record, railIndex);
    if (!row) continue;
    if (item.section === 'other') otherRows.push(row);
    else mainRows.push(row);
  }
  return { mainRows, otherRows };
}
