import { normalizeRuleSourceWorldId } from '@/components/Rules/data/ruleDataSources';
import { isNativeConfigRevision } from './contract';
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

function labelFor(item: CardItem, config?: ConfigPackageV3, record?: FeatureRecord): string {
  if (item.labelMode === 'field' && config && record) return resolveEffectiveFields(config,classificationFor(record)).find(field=>field.key===item.source)?.labels.zh ?? item.source;
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

function lineChipsRow(item: CardItem, record: FeatureRecord, config:ConfigPackageV3, railIndex?: RailNewIndex | null): CardRow | undefined {
  const source = item.options?.lineChipSource;
  if (source === 'platform') return { ...buildPlatformLineChipsRow(record, railIndex), label: labelFor(item,config,record) };
  if (source === 'station') return { ...buildStationLineChipsRow(record, railIndex), label: labelFor(item,config,record) };
  if (source === 'stationBuilding') return { ...buildStationBuildingLineChipsRow(record, railIndex), label: labelFor(item,config,record) };
  return undefined;
}

function rowFor(item: CardItem, record: FeatureRecord, config: ConfigPackageV3, railIndex?: RailNewIndex | null): CardRow | undefined {
  if (!item.visible) return undefined;
  const defined = config.contractRevision<9?resolveEffectiveFields(config,classificationFor(record)).find(field=>field.key===item.source):undefined;
  if(item.valueMode==='field'&&item.options?.format===undefined&&defined?.format)item={...item,options:{...item.options,format:defined.format}};
  if (item.renderer === 'lineChips') return lineChipsRow(item, record, config, railIndex);

  const raw = [item.source, ...(item.fallbackSources ?? [])].map(source => valueAt(record, source)).find(value => !isEmpty(value));
  const rawText = text(raw).trim();
  const label = labelFor(item,config,record);
  const colorText = text(valueAt(record, item.options?.colorSource || item.source)).trim();
  const needsValue = item.renderer !== 'media' && item.renderer !== 'colorCapsule';
  if (!rawText && needsValue && item.hideWhenEmpty !== false && item.options?.format !== 'classification') return undefined;

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
  if (item.options?.format === 'externalLink') return rawText ? { label, value: makeExternalLink(rawText, item.options.linkText === 'raw' ? rawText : undefined) } : undefined;
  if (item.options?.format === 'boolean') return { label, value: raw === true || rawText.toLowerCase() === 'true' ? '是' : raw === false || rawText.toLowerCase() === 'false' ? '否' : rawText || '未知' };
  if (item.options?.format === 'classification') {
    const path = classificationFor(record);
    const nodes = config.nodes.filter(node => node.path.class === path.class && (!node.path.kind || node.path.kind === path.kind) && (!node.path.skind || node.path.skind === path.skind) && (!node.path.skind2 || node.path.skind2 === path.skind2)).sort((a,b) => Object.keys(b.path).length - Object.keys(a.path).length);
    const node = nodes[0];
    const level = path.skind2 ? 'skind2' : path.skind ? 'skind' : path.kind ? 'kind' : 'class';
    return { label, value: node?.classificationLabels?.[level]?.zh || [path.kind,path.skind,path.skind2].filter(Boolean).join('/') || path.class };
  }
  const mappedOptions = item.valueMode === 'field' ? defined?.options : item.valueOptions;
  const shown = mappedOptions?.find(option=>option.value===rawText)?.label.zh;
  if(item.renderer==='text'&&Array.isArray(raw)&&mappedOptions?.length){const values=raw.map(value=>mappedOptions.find(option=>option.value===text(value))?.label.zh??value);return {label,value:values};}
  if (shown !== undefined && item.renderer === 'text') return {label,value:shown};
  if (item.options?.format === 'enum') {
    if (config.contractRevision>=9 || item.valueMode === 'override') return {label,value:shown ?? rawText};
    const field = resolveEffectiveFields(config, classificationFor(record)).find(field => field.key === item.source);
    return { label, value: field?.options?.find(option => String(option.value) === rawText)?.label.zh || rawText };
  }
  if (item.options?.format === 'world') return { label, value: normalizeRuleSourceWorldId(rawText) };
  if (item.options?.format === 'date') {
    const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(rawText);
    const date = new Date(typeof raw === 'number' ? raw : compact ? `${compact[1]}-${compact[2]}-${compact[3]}T00:00:00Z` : rawText);
    return { label, value: Number.isNaN(date.getTime()) ? rawText : date.toISOString().slice(0, 10) };
  }
  if (item.options?.format === 'plain') return { label, value: rawText || '未知' };
  return { label, value: isEmpty(raw) ? '未知' : raw };
}

function isEmpty(value: unknown): boolean { return value == null || typeof value === 'string' && !value.trim() || Array.isArray(value) && !value.length || typeof value === 'object' && !Object.keys(value).length; }
const AUDIT_FIELDS = ['CreateTime','createTime','CreateBy','createBy','ModifityTime','ModifyTime','ModifiedTime','modifityTime','modifyTime','modifiedTime','ModifityBy','ModifyBy','ModifiedBy','modifityBy','modifyBy','modifiedBy','UpdateTime','updateTime','UpdateBy','updateBy'];
function remainingRows(record: FeatureRecord, items: CardItem[], settings: NonNullable<Extract<import('./types').CardConfiguration, { mode: 'fields' }>['remaining']>): CardRow[] {
  const used = new Set([...items.filter(item => item.renderer !== 'lineChips').flatMap(item => item.options?.format === 'classification' ? ['Class','Kind','Skind','Skind2','SKind','SKind2'] : [item.source, ...(item.fallbackSources ?? [])]), ...(settings.exclude ?? []), ...(!settings.includeSystem ? AUDIT_FIELDS : [])]);
  const rows: CardRow[] = [];
  const excluded = (key: string) => [...used].some(path => key === path || key.startsWith(path + '.'));
  const walk = (value: unknown, prefix: string, depth: number) => {
    if (excluded(prefix) || settings.hideWhenEmpty && isEmpty(value)) return;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length && depth <= (settings.maxDepth ?? 3)) {
      let entries = Object.entries(value); if (settings.order === 'alphabetical') entries = entries.sort(([a],[b]) => a.localeCompare(b));
      for (const [key, child] of entries) walk(child, prefix ? `${prefix}.${key}` : key, depth + 1);
    } else rows.push({ label: prefix, value: Array.isArray(value) && value.length > (settings.maxArrayLength ?? 50) ? `[Array(${value.length})]` : value });
  };
  let entries = Object.entries(record.featureInfo); if (settings.order === 'alphabetical') entries = entries.sort(([a],[b]) => a.localeCompare(b));
  for (const [key, value] of entries) walk(value, key, 1);
  return rows;
}

/** Returns undefined for the deliberately specialised TRP card. */
export function buildV3CardSections(
  config: ConfigPackageV3 | undefined,
  record: FeatureRecord,
  railIndex?: RailNewIndex | null,
): InfoSections | undefined {
  if (!config || !isNativeConfigRevision(config.contractRevision)) return undefined;
  const path = classificationFor(record);
  const card = resolveCardConfiguration(config, path);
  if (!card || card.mode === 'component') return undefined;
  const items: CardItem[] = card.mode === 'fields'
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
  const add = (item: CardItem) => {
    if (card.mode === 'fields' && card.remaining?.includeSystem === false && AUDIT_FIELDS.includes(item.source)) return;
    const row = rowFor(item, record, config, railIndex);
    if (!row) return;
    if (item.section === 'other') otherRows.push(row);
    else mainRows.push(row);
  };
  items.filter(item => !item.afterRemaining).forEach(add);
  if (card.mode === 'fields' && card.remaining?.enabled) (card.remaining.section === 'main' ? mainRows : otherRows).push(...remainingRows(record, items, card.remaining));
  items.filter(item => item.afterRemaining).forEach(add);
  return { mainRows, otherRows };
}
