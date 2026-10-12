import {resolveMappedColor} from '../../../configStudio/renderScalar';
import { isNativeConfigRevision } from '../../../configStudio/contract';
import type {
  ConfigPackageV3,
  ConfigPane,
  Condition,
  ContextBinding,
  GeometryKind,
  InteractionVisual,
  InteractionState,
  LabelStyleFamily,
  RenderColorBinding,
  RenderDashPreset,
  RenderRuleExtensions,
  RenderLabelVisualStyle,
  ZoomPriorityRule,
} from '@/configStudio/types';
import { createDefaultGeometryProfile } from '@/configStudio/v32Defaults';
import { isCompiledConfigRuntime, resolveGeometryProfile, resolveZoomRule, resolveRenderExtensions } from '@/configStudio/runtime';
import { buildV3CardSections } from '@/configStudio/V3CardRenderer';
import type { FeatureStore } from '@/components/Rules/data/featureStore';
import type { FeatureRecord, RenderContext, RenderRule } from '@/components/Rules/rendering/renderRules';
import { fmtFloorLabel } from '@/components/Rules/utils/ruleHelpers';
import { normalizeRuleSourceWorldId } from '@/components/Rules/data/ruleDataSources';

/**
 * V3.2 native execution boundary. A package is either absent (the immutable
 * V1 runtime owns the feature) or contract r5 (every visible value comes from
 * V3.2). A partially authored V3 node must never inherit a V1 visual rule.
 */
type RuntimePath = { class: string; kind?: string; skind?: string; skind2?: string };

export type ConfigRuntimeScreenGate = {
  minScreenAreaPx?: number;
  minScreenLengthPx?: number;
};

type RuntimeBinding = {
  geometry: GeometryKind;
  profile: ReturnType<typeof resolveGeometryProfile>;
  active: ZoomPriorityRule | undefined;
  visuals: Partial<Record<InteractionState, InteractionVisual>>;
  stack?: { geometryZ: number; displayPriority: number };
  native?: RenderRule | null;
  nativeResolved?: boolean;
};
const bindingCache = new WeakMap<ConfigPackageV3, WeakMap<FeatureRecord, { key: string; store?: FeatureStore; floors: RenderContext['activeBuildingFloorRefSet']; binding: RuntimeBinding }>>();
function runtimeBinding(config: ConfigPackageV3, record: FeatureRecord, ctx: RenderContext, store?: FeatureStore, storeIndependent = false): RuntimeBinding {
  const key = [ctx.worldId, ctx.dataVersion, ctx.zoomLevel, ctx.leafletZoom, ctx.inFloorView, ctx.activeBuildingUid, ctx.activeContextBindingId, ctx.activeFloorSelector].join('\u001f');
  const compiled = isCompiledConfigRuntime(config);
  let cache = bindingCache.get(config);
  const prior = compiled ? cache?.get(record) : undefined;
  if (prior?.key === key && (storeIndependent || prior.store === store) && prior.floors === ctx.activeBuildingFloorRefSet) return prior.binding;
  const geometry = geometryFor(record);
  const profile = resolveGeometryProfile(config, pathFor(record), geometry);
  const resolved = profile ? activeRuleFor(profile, record, ctx) : undefined;
  const active = resolved ? { ...resolved, extensions: resolveRenderExtensions(config, geometry, resolved.extensions) } : undefined;
  const binding: RuntimeBinding = { geometry, profile, active, visuals: {} };
  if (compiled) {
    if (!cache) { cache = new WeakMap(); bindingCache.set(config, cache); }
    // Only the latest binding per record is retained, rather than 9 x 5 states.
    cache.set(record, { key, store, floors: ctx.activeBuildingFloorRefSet, binding });
  }
  return binding;
}

/** Conservative screen reach used before building a full drawing rule. */
export function configRuntimeViewportReach(config: ConfigPackageV3, record: FeatureRecord, ctx: RenderContext, store?: FeatureStore): number {
  const active = runtimeBinding(config, record, ctx, store).active;
  const label = active?.label; const style = active?.style;
  const fontSize = label?.style?.size ?? label?.size ?? 16;
  const textLength = Math.max(0, ...[label?.source ?? 'Name', ...(label?.fallbackSources ?? [])].map(source => String(featureValue(record, source) ?? '').length));
  const offsets = active?.extensions?.anchor?.candidateOffsetsPx ?? [];
  return Math.max(1024, textLength * fontSize * 2 + Math.abs(label?.offsetX ?? 0) + Math.abs(label?.offsetY ?? 0)
    + Math.abs(style?.symbolOffsetPx?.x ?? 0) + Math.abs(style?.symbolOffsetPx?.y ?? 0)
    + (style?.size ?? 0) + (style?.weight ?? 0) + Math.max(0, ...(style?.icon?.size ?? []), ...(style?.icon?.anchor ?? []).map(Math.abs))
    + Math.max(0, ...offsets.map(offset => Math.abs(offset.x) + Math.abs(offset.y))) + (active?.extensions?.hitTolerancePx ?? 0));
}

function geometryFor(record: FeatureRecord): GeometryKind {
  return record.type === 'Points' ? 'Point' : record.type === 'Polyline' ? 'LineString' : 'Polygon';
}

export function resolveConfigInteractionVisual(config: ConfigPackageV3, record: FeatureRecord, ctx: RenderContext, state: InteractionState, store?: FeatureStore): InteractionVisual {
  const binding = runtimeBinding(config, record, ctx, store);
  if (binding.visuals[state]) return binding.visuals[state]!;
  const visual: InteractionVisual = { enabled: false, strokeColor: '#000000', strokeWidth: 0, strokeOpacity: 0, ...config.engine?.interactionBaselines[binding.geometry][state], ...(binding.active?.extensions ?? resolveRenderExtensions(config, binding.geometry)).interaction?.[state] };
  if (visual.strokeColorBinding) visual.strokeColor = resolveColor(record, visual.strokeColorBinding, visual.strokeColor, store);
  binding.visuals[state] = visual;
  return visual;
}

function pathFor(record: FeatureRecord): RuntimePath {
  const feature = record.featureInfo as Record<string, unknown>;
  const tags = (feature?.tags ?? feature?.Tags) as Record<string, unknown> | undefined;
  // ISL/ISG were historically written with PLine*/PGon* aliases by some
  // loaders.  Treat those aliases as the same explicit V3 classification,
  // rather than letting a V1-only branch decide their visual result.
  const value = (key: string) => String(feature?.[key] ?? tags?.[key] ?? record.meta?.sig?.[key] ?? '').trim();
  const prefix = geometryFor(record) === 'LineString' ? 'PLine' : geometryFor(record) === 'Polygon' ? 'PGon' : '';
  const kind = (prefix ? value(`${prefix}Kind`) : '') || value('Kind');
  const skind = (prefix ? value(`${prefix}SKind`) : '') || value('Skind') || value('SKind');
  const skind2 = (prefix ? value(`${prefix}SKind2`) : '') || value('Skind2') || value('SKind2');
  return {
    class: String(record.meta?.Class ?? value('Class')).trim(),
    ...(kind ? { kind } : {}),
    ...(skind ? { skind } : {}),
    ...(skind2 ? { skind2 } : {}),
  };
}

function featureValue(record: FeatureRecord, source: string): unknown {
  if (source === 'ID') return record.meta?.idValue ?? record.featureInfo?.ID;
  return source.split('.').reduce<unknown>((value, key) => value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined, record.featureInfo as Record<string, unknown>);
}

function matchesTargetPath(record: FeatureRecord, target: RuntimePath): boolean {
  return matchesPath(pathFor(record), target);
}
function matchesPath(path: RuntimePath, target: RuntimePath): boolean {
  return path.class === target.class
    && (!target.kind || path.kind === target.kind)
    && (!target.skind || path.skind === target.skind)
    && (!target.skind2 || path.skind2 === target.skind2);
}

function relationValues(record: FeatureRecord, field: string): string[] {
  const value = featureValue(record, field);
  const values = Array.isArray(value) ? value : [value];
  return values.map((entry) => String(entry ?? '').trim()).filter(Boolean);
}

function relatedByBinding(host: FeatureRecord, member: FeatureRecord, binding: ContextBinding): boolean {
  if (!matchesTargetPath(host, binding.host.classification) || !matchesTargetPath(member, binding.member.classification)) return false;
  const hostValues = new Set(relationValues(host, binding.host.referenceField));
  return relationValues(member, binding.member.referenceField).some((value) => hostValues.has(value));
}

export type ConfigRuntimeContext = {
  binding: ContextBinding;
  host: FeatureRecord;
  members: FeatureRecord[];
  memberUids: Set<string>;
  options: Array<{ value: string; label: string }>;
};

type ContextLookup = {
  order: Map<FeatureRecord, number>;
  paths: Map<FeatureRecord, RuntimePath>;
  firstHostBinding: WeakMap<FeatureRecord, ContextBinding>;
  hosts: Map<ContextBinding, Map<string, FeatureRecord[]>>;
  members: Map<ContextBinding, Map<string, FeatureRecord[]>>;
  contexts: WeakMap<FeatureRecord, ConfigRuntimeContext | undefined>;
};
// FeatureStore is replaced when authoritative world/temp data changes. These
// indexes belong to that data snapshot and immutable config identity; retaining
// neither key keeps old worlds and configurations collectible.
const contextLookups = new WeakMap<FeatureStore, WeakMap<ConfigPackageV3, ContextLookup>>();
function contextLookup(config: ConfigPackageV3, store: FeatureStore): ContextLookup | undefined {
  if (!isCompiledConfigRuntime(config)) return undefined;
  let configs = contextLookups.get(store);
  const cached = configs?.get(config); if (cached) return cached;
  const result: ContextLookup = { order: new Map(), paths: new Map(), firstHostBinding: new WeakMap(), hosts: new Map(), members: new Map(), contexts: new WeakMap() };
  const classes = new Map<string, FeatureRecord[]>();
  for (const [index, record] of store.all.entries()) {
    const path = pathFor(record); result.paths.set(record, path); result.order.set(record, index);
    const records = classes.get(path.class) ?? []; records.push(record); classes.set(path.class, records);
  }
  const references = (records: FeatureRecord[], path: RuntimePath, field: string) => {
    const index = new Map<string, FeatureRecord[]>();
    for (const record of records) if (matchesPath(result.paths.get(record)!, path)) {
      for (const value of new Set(relationValues(record, field))) {
        const matches = index.get(value) ?? []; matches.push(record); index.set(value, matches);
      }
    }
    return index;
  };
  for (const binding of config.contextBindings ?? []) if (binding.enabled) {
    const hosts = classes.get(binding.host.classification.class) ?? [];
    for (const host of hosts) if (!result.firstHostBinding.has(host) && matchesPath(result.paths.get(host)!, binding.host.classification)) result.firstHostBinding.set(host, binding);
    result.hosts.set(binding, references(hosts, binding.host.classification, binding.host.referenceField));
    result.members.set(binding, references(classes.get(binding.member.classification.class) ?? [], binding.member.classification, binding.member.referenceField));
  }
  if (!configs) { configs = new WeakMap(); contextLookups.set(store, configs); }
  configs.set(config, result); return result;
}
function referencedRecords(index: Map<string, FeatureRecord[]> | undefined, values: string[], order: Map<FeatureRecord, number>): FeatureRecord[] {
  const records = new Set<FeatureRecord>();
  for (const value of values) for (const record of index?.get(value) ?? []) records.add(record);
  // Host references may be arrays in a different order from the source. Preserve
  // the original store.filter/find ordering and de-duplicate shared references.
  return [...records].sort((a, b) => order.get(a)! - order.get(b)!);
}

/**
 * Resolve one generic host/member relation.  It deliberately uses category
 * paths plus author-selected reference fields, so BUD/FLR/STF are never baked
 * into the V3 runtime.
 */
export function resolveConfigRuntimeContextForHost(
  config: ConfigPackageV3 | undefined,
  host: FeatureRecord,
  store?: FeatureStore,
): ConfigRuntimeContext | undefined {
  if (!config || !isNativeConfigRevision(config.contractRevision) || !store) return undefined;
  const lookup = contextLookup(config, store);
  if (lookup?.contexts.has(host)) return lookup.contexts.get(host);
  const binding = lookup?.firstHostBinding.get(host) ?? (lookup?.paths.has(host) ? undefined : (config.contextBindings ?? []).find((candidate) => candidate.enabled && matchesTargetPath(host, candidate.host.classification)));
  if (!binding) { lookup?.contexts.set(host, undefined); return undefined; }
  const members = lookup ? referencedRecords(lookup.members.get(binding), relationValues(host, binding.host.referenceField), lookup.order) : store.all.filter((candidate) => relatedByBinding(host, candidate, binding));
  if (!members.length) { lookup?.contexts.set(host, undefined); return undefined; }
  const selector = binding.memberSelectorField || 'ID';
  const byValue = new Map<string, { value: string; label: string }>();
  for (const member of members) {
    const value = relationValues(member, selector)[0] ?? String(featureValue(member, 'ID') ?? member.uid);
    if (!value || byValue.has(value)) continue;
    const label = String(featureValue(member, 'Name') ?? value).trim() || value;
    byValue.set(value, { value, label });
  }
  const options = [...byValue.values()].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
  const context = { binding, host, members, memberUids: new Set(members.map((member) => member.uid)), options };
  lookup?.contexts.set(host, context); return context;
}

/** Resolve a context starting from either side, which lets a member click open its host context. */
export function resolveConfigRuntimeContextForRecord(
  config: ConfigPackageV3 | undefined,
  record: FeatureRecord,
  store?: FeatureStore,
): ConfigRuntimeContext | undefined {
  if (!config || !isNativeConfigRevision(config.contractRevision) || !store) return undefined;
  const direct = resolveConfigRuntimeContextForHost(config, record, store);
  if (direct) return direct;
  const lookup = contextLookup(config, store);
  for (const binding of config.contextBindings ?? []) {
    if (!binding.enabled || !matchesTargetPath(record, binding.member.classification)) continue;
    const host = lookup ? referencedRecords(lookup.hosts.get(binding), relationValues(record, binding.member.referenceField), lookup.order)[0] : store.all.find((candidate) => relatedByBinding(candidate, record, binding));
    if (!host) continue;
    const context = resolveConfigRuntimeContextForHost(config, host, store);
    if (context?.binding.id === binding.id) return context;
  }
  return undefined;
}

/**
 * Visibility is applied only to records participating in the active generic
 * relation.  Unrelated categories retain their own normal-map rendering.
 */
export function isConfigRuntimeRecordVisible(
  config: ConfigPackageV3,
  record: FeatureRecord,
  ctx: RenderContext,
  store?: FeatureStore,
): boolean {
  if (!ctx.inFloorView || !ctx.activeBuildingUid || !ctx.activeContextBindingId || !store) return true;
  const host = store.all.find((candidate) => candidate.uid === ctx.activeBuildingUid);
  const binding = (config.contextBindings ?? []).find((candidate) => candidate.enabled && candidate.id === ctx.activeContextBindingId);
  if (!host || !binding || !matchesTargetPath(host, binding.host.classification)) return true;
  if (record.uid === host.uid) return true;
  if (!matchesTargetPath(record, binding.member.classification)) return true;
  if (!relatedByBinding(host, record, binding)) return false;
  if (binding.profile !== 'show-active-member-only' || !ctx.activeFloorSelector) return true;
  const selector = binding.memberSelectorField || 'ID';
  return relationValues(record, selector).includes(ctx.activeFloorSelector);
}

function normalizeColor(value: unknown, fallback: string): string {
  const color = String(value ?? '').trim();
  if (!color) return fallback;
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color;
}

function firstPlatformLineId(record: FeatureRecord): string | undefined {
  const lines = (record.featureInfo as Record<string, unknown>)?.lines;
  if (!Array.isArray(lines) || !lines.length || !lines[0] || typeof lines[0] !== 'object') return undefined;
  const first = lines[0] as Record<string, unknown>;
  const id = String(first.ID ?? first.LineID ?? first.id ?? '').trim();
  return id || undefined;
}

function relatedLineColorById(id: string | undefined, store?: FeatureStore): string | undefined {
  if (!id || !store) return undefined;
  const direct = store.lineColorIndex[id];
  if (direct) return normalizeColor(direct, '');
  const line = store.all.find((candidate) => String(featureValue(candidate, 'ID') ?? candidate.meta?.idValue ?? '').trim() === id);
  return line ? normalizeColor(featureValue(line, 'color') ?? featureValue(line, 'Color'), '') || undefined : undefined;
}

function resolveRelatedLineColor(record: FeatureRecord, strategy: Extract<RenderColorBinding, { mode: 'relatedLine' }>['strategy'], store?: FeatureStore): string | undefined {
  if (!store) return undefined;
  if (strategy === 'featureRelation') return normalizeColor(store.findRelatedLineColor(record), '') || undefined;
  if (strategy === 'platformFirstLine') return relatedLineColorById(firstPlatformLineId(record), store);
  const platforms = (record.featureInfo as Record<string, unknown>)?.platforms;
  if (!Array.isArray(platforms) || !platforms.length || !platforms[0] || typeof platforms[0] !== 'object') return undefined;
  const first = platforms[0] as Record<string, unknown>;
  const platformId = String(first.ID ?? first.platformID ?? '').trim();
  const platform = platformId ? store.byClassId.PLF?.[platformId]?.[0] ?? store.all.find((candidate) => pathFor(candidate).class === 'PLF' && String(featureValue(candidate, 'ID') ?? candidate.meta?.idValue ?? '').trim() === platformId) : undefined;
  return platform ? relatedLineColorById(firstPlatformLineId(platform), store) : undefined;
}

function resolveColor(record: FeatureRecord, binding: RenderColorBinding | undefined, fallback: string, store?: FeatureStore): string {
  if (!binding) return fallback;
  if(binding.mode==='valueMap')return resolveMappedColor(binding,featureValue(record,binding.field));
  if (binding.mode === 'fixed') return normalizeColor(binding.color, fallback);
  if (binding.mode === 'field') return normalizeColor(featureValue(record, binding.field) ?? binding.fallbackColor, fallback);
  if (binding.mode === 'relatedLine') return normalizeColor(resolveRelatedLineColor(record, binding.strategy, store) ?? binding.fallbackColor, fallback);

  const targets = (record.featureInfo as Record<string, unknown>)?.__configRuntimeTargets;
  const targetId = String(featureValue(record, binding.targetIdField) ?? '');
  if (Array.isArray(targets)) {
    const hit = targets.find((item) => item && typeof item === 'object'
      && String((item as Record<string, unknown>).ID ?? '') === targetId) as Record<string, unknown> | undefined;
    if (hit?.[binding.targetColorField] !== undefined) return normalizeColor(hit[binding.targetColorField] ?? binding.fallbackColor, fallback);
  }
  const indexed = store?.all.find((candidate) => matchesTargetPath(candidate, binding.target)
    && String(featureValue(candidate, 'ID') ?? candidate.meta?.idValue ?? '') === targetId);
  if (indexed) return normalizeColor(featureValue(indexed, binding.targetColorField) ?? binding.fallbackColor, fallback);
  return normalizeColor(binding.fallbackColor, fallback);
}

function conditionMatches(record: FeatureRecord, ctx: RenderContext, condition: Condition): boolean {
  if (condition.kind === 'always') return true;
  if (condition.kind === 'zoomRange') return (condition.min === undefined || ctx.zoomLevel >= condition.min)
    && (condition.max === undefined || ctx.zoomLevel <= condition.max);
  if (condition.kind === 'bboxArea') {
    const area = nativeMetricValue(record, 'area');
    return (condition.min === undefined || area >= condition.min)
      && (condition.max === undefined || area <= condition.max);
  }
  const value = String(featureValue(record, condition.field) ?? '').trim();
  if (condition.kind === 'fieldEquals') return value === condition.value;
  if (condition.kind === 'fieldIn') return condition.values.includes(value);
  return condition.present ? value.length > 0 : value.length === 0;
}

function mergeExtensions(base: RenderRuleExtensions | undefined, override: RenderRuleExtensions | undefined): RenderRuleExtensions | undefined {
  if (!base) return override;
  if (!override) return base;
  return {
    ...base,
    ...override,
    screenGate: override.screenGate ?? base.screenGate,
    labelText: { ...base.labelText, ...override.labelText },
    lineLabel: override.lineLabel ?? base.lineLabel,
    anchor: { ...base.anchor, ...override.anchor },
    polygonCandidates: { ...base.polygonCandidates, ...override.polygonCandidates },
    collision: { ...base.collision, ...override.collision },
    stability: { ...base.stability, ...override.stability },
    density: override.density ?? base.density,
    fallback: { ...base.fallback, ...override.fallback },
    visibility: override.visibility ?? base.visibility,
  };
}

/** Resolve typed field conditions after selecting the one inclusive Zoom rule.
 * This keeps Zoom intervals single and non-overlapping while retaining V1's
 * small number of real field-dependent visual branches. */
function activeRuleFor(profile: NonNullable<ReturnType<typeof resolveGeometryProfile>>, record: FeatureRecord, ctx: RenderContext): ZoomPriorityRule | undefined {
  const selected = resolveZoomRule(profile, ctx.zoomLevel, field => featureValue(record, field));
  const base = selected?.when ? { ...selected, minZoom: selected.when.zoom.min, maxZoom: selected.when.zoom.max } : selected;
  if (!base) return undefined;
  let active: ZoomPriorityRule = base;
  for (const override of base.conditionalOverrides ?? []) {
    if (!override.when.every((condition) => conditionMatches(record, ctx, condition))) continue;
    active = {
      ...active,
      ...(override.representation !== undefined ? { representation: override.representation } : {}),
      ...(override.style ? { style: override.style } : {}),
      ...(override.label ? { label: override.label } : {}),
      ...(override.geometryStack ? { geometryStack: override.geometryStack } : {}),
      ...(override.priority ? { priority: override.priority } : {}),
      extensions: mergeExtensions(active.extensions, override.extensions),
      id: `${base.id}:${override.id}`,
      conditionalOverrides: undefined,
    };
  }
  return active;
}

function pointCoordinateKey(record: FeatureRecord, precision = 1000): string | undefined {
  const point = record.p3;
  if (!point) return undefined;
  const x = Math.round(Number(point.x) * precision) / precision;
  const z = Math.round(Number(point.z) * precision) / precision;
  return Number.isFinite(x) && Number.isFinite(z) ? `${x},${z}` : undefined;
}

function lineCoordinateKeys(record: FeatureRecord, precision: number): string[] {
  const parts = record.multipartGeometry?.type === 'LineString'
    ? record.multipartGeometry.parts
    : record.coords3?.length ? [record.coords3] : [];
  const values = new Set<string>();
  for (const part of parts) for (const point of part) {
    const x = Math.round(Number(point.x) * precision) / precision;
    const z = Math.round(Number(point.z) * precision) / precision;
    if (Number.isFinite(x) && Number.isFinite(z)) values.add(`${x},${z}`);
  }
  return [...values].sort();
}

const lineChoiceCache = new WeakMap<FeatureStore, Map<string, 'primary' | 'overlay'>>();

function lineContainmentChoice(record: FeatureRecord, extension: NonNullable<RenderRuleExtensions['visibility']>['lineContainmentChoice'], store?: FeatureStore): 'primary' | 'overlay' | undefined {
  if (!extension || !store) return undefined;
  const path = pathFor(record);
  const cacheKey = `${path.class}|${extension.field}|${extension.primaryValue}|${extension.overlayValues.join(',')}|${extension.precision ?? 1000}`;
  const cache = lineChoiceCache.get(store) ?? new Map<string, 'primary' | 'overlay'>();
  if (!lineChoiceCache.has(store)) lineChoiceCache.set(store, cache);
  const existing = cache.get(cacheKey);
  if (existing) return existing;
  const precision = extension.precision ?? 1000;
  const primary = store.all.filter((candidate) => pathFor(candidate).class === path.class
    && String(featureValue(candidate, extension.field) ?? '').trim() === extension.primaryValue)
    .map((candidate) => new Set(lineCoordinateKeys(candidate, precision)));
  const overlays = store.all.filter((candidate) => pathFor(candidate).class === path.class
    && extension.overlayValues.includes(String(featureValue(candidate, extension.field) ?? '').trim()))
    .map((candidate) => new Set(lineCoordinateKeys(candidate, precision)));
  const containedByPrimary = (candidate: Set<string>) => primary.some((base) => [...candidate].every((key) => base.has(key)));
  const choice: 'primary' | 'overlay' = overlays.length === 0 || overlays.every(containedByPrimary) ? 'primary' : 'overlay';
  cache.set(cacheKey, choice);
  return choice;
}

function passesVisibilityExtension(config: ConfigPackageV3, record: FeatureRecord, ctx: RenderContext, extensions: RenderRuleExtensions | undefined, store?: FeatureStore): boolean {
  const visibility = extensions?.visibility;
  if (!visibility || visibility.mode === 'inherit' || visibility.mode === 'always') return true;
  if (visibility.mode === 'activeContextMember') {
    const spec = visibility.activeContextMember;
    if (!ctx.inFloorView || !ctx.activeBuildingUid || !ctx.activeContextBindingId || !store) return false;
    if (spec?.bindingId && spec.bindingId !== ctx.activeContextBindingId) return false;
    const binding = (config.contextBindings ?? []).find((candidate) => candidate.enabled && candidate.id === ctx.activeContextBindingId);
    const host = binding ? store.all.find((candidate) => candidate.uid === ctx.activeBuildingUid) : undefined;
    if (!binding || !host || !matchesTargetPath(record, binding.member.classification)) return false;
    if (!relatedByBinding(host, record, binding)) return false;
    if (spec?.requireSelector && !ctx.activeFloorSelector) return false;
    if (binding.profile !== 'show-active-member-only' || !ctx.activeFloorSelector) return true;
    const selector = binding.memberSelectorField || 'ID';
    return relationValues(record, selector).includes(ctx.activeFloorSelector);
  }
  if (visibility.mode === 'sameId') {
    const spec = visibility.sameId;
    if (!spec || !store) return true;
    const source = String(featureValue(record, spec.sourceField ?? 'ID') ?? '').trim();
    const found = Boolean(source) && store.all.some((candidate) => candidate.uid !== record.uid
      && matchesTargetPath(candidate, spec.target)
      && String(featureValue(candidate, spec.targetField ?? 'ID') ?? '').trim() === source);
    return spec.behavior === 'hideIfExists' ? !found : found;
  }
  if (visibility.mode === 'coincidentPoint') {
    const spec = visibility.coincidentPoint;
    if (!spec || !store) return true;
    const key = pointCoordinateKey(record, spec.precision ?? 1000);
    const found = Boolean(key) && store.all.some((candidate) => {
      if (candidate.uid === record.uid || !matchesTargetPath(candidate, spec.target) || pointCoordinateKey(candidate, spec.precision ?? 1000) !== key) return false;
      const candidateValue = String(featureValue(candidate, spec.targetField ?? '') ?? '').trim().toLowerCase();
      if (spec.targetEquals !== undefined && candidateValue !== String(spec.targetEquals).toLowerCase()) return false;
      if (spec.targetNotEquals !== undefined && candidateValue === String(spec.targetNotEquals).toLowerCase()) return false;
      return true;
    });
    return spec.behavior === 'hideIfExists' ? !found : found;
  }
  const spec = visibility.lineContainmentChoice;
  if (!spec) return true;
  const direction = String(featureValue(record, spec.field) ?? '').trim();
  if (ctx.zoomLevel < spec.switchZoom) return direction === spec.primaryValue;
  const choice = lineContainmentChoice(record, spec, store);
  return choice === 'overlay' ? spec.overlayValues.includes(direction) : direction === spec.primaryValue;
}

const dashArray: Record<RenderDashPreset, string | undefined> = {
  solid: undefined,
  dash: '10 6',
  dotDash: '2 5 10 5',
  dotDotDash: '2 4 2 4 10 5',
};

function paneFor(config: ConfigPackageV3, geometry: GeometryKind, pane: ConfigPane | undefined): string {
  const defaults = config.engine!.paneDefaults;
  if (pane && pane !== 'auto') return defaults[pane];
  return geometry === 'Point' ? defaults.point : defaults.overlay;
}

function labelStyleKey(style: RenderLabelVisualStyle, record: FeatureRecord, store?: FeatureStore): unknown {
  const modifiers = style.modifiers?.italic || style.modifiers?.underline
    ? { italic: Boolean(style.modifiers?.italic), underline: Boolean(style.modifiers?.underline) }
    : undefined;
  const keyForFamily: Record<Exclude<LabelStyleFamily, 'rle-line-color' | 'rle-pill-color'>, string> = {
    'gm-bw': `gm-bw-${style.size}`,
    'gm-outline': `gm-outline-${style.modifiers?.bold ? 'bold-' : ''}${style.size}`,
    'gm-wtb': `gm-wtb-${style.size}`,
    'structure-label': `structure-label-${style.size}`,
    'bubble-dark': `bubble-dark-${style.size}`,
  };
  if (style.family === 'rle-line-color') return { key: `rle-line-${style.size}`, color: resolveColor(record, style.color, '#2563eb', store) };
  if (style.family === 'rle-pill-color') return { key: `rle-pill-${style.size}`, color: resolveColor(record, style.color, '#2563eb', store) };
  const key = keyForFamily[style.family];
  return modifiers ? { key, ...modifiers } : key;
}

function renderMode(geometry: GeometryKind, rule: ZoomPriorityRule): 'none' | 'point' | 'polyline' | 'polygonFillOutline' {
  if (rule.representation === 'hidden' || rule.representation === 'labelOnly') return 'none';
  if (rule.representation === 'point') return 'point';
  return geometry === 'LineString' ? 'polyline' : geometry === 'Polygon' ? 'polygonFillOutline' : 'point';
}

function interactionVisualToPathStyle(visual: InteractionVisual) {
  return {
    color: visual.strokeColor,
    weight: visual.strokeWidth,
    opacity: visual.strokeOpacity,
    fillColor: visual.fillColor ?? visual.strokeColor,
    fillOpacity: visual.fillOpacity ?? 0,
  };
}

function ringArea(points: Array<{ x: number; z: number }>): number {
  if (points.length < 3) return 0;
  let value = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    value += points[previous].x * points[index].z - points[index].x * points[previous].z;
  }
  return Math.abs(value) / 2;
}

function nativeMetricValue(record: FeatureRecord, kind: NonNullable<NonNullable<ZoomPriorityRule['priority']>['metric']>['kind'], field?: string): number {
  if (kind === 'field') return Number(featureValue(record, field || '')) || 0;
  if (kind === 'partCount') return record.multipartGeometry?.parts.length ?? 1;
  if (kind === 'length') {
    const parts = record.multipartGeometry?.type === 'LineString' ? record.multipartGeometry.parts : record.coords3?.length ? [record.coords3] : [];
    return parts.reduce((total, part) => total + part.reduce((sum, point, index) => index ? sum + Math.hypot(point.x - part[index - 1].x, point.z - part[index - 1].z) : sum, 0), 0);
  }
  const parts = record.multipartGeometry?.type === 'Polygon' ? record.multipartGeometry.parts : record.coords3?.length ? [[record.coords3]] : [];
  return parts.reduce((total, part) => total + part.reduce((partTotal, ring, index) => partTotal + (index === 0 ? ringArea(ring) : -ringArea(ring)), 0), 0);
}

function dynamicPriority(record: FeatureRecord, rule: ZoomPriorityRule): number {
  const base = Number(rule.priority?.base ?? 0);
  const metric = rule.priority?.metric;
  if (!metric) return base;
  let value = nativeMetricValue(record, metric.kind, metric.field) * Number(metric.multiplier ?? 1);
  if (metric.divisor) value /= metric.divisor;
  if (metric.min !== undefined) value = Math.max(metric.min, value);
  if (metric.max !== undefined) value = Math.min(metric.max, value);
  if (metric.rounding === 'floor') value = Math.floor(value);
  else if (metric.rounding === 'ceil') value = Math.ceil(value);
  else if (metric.rounding === 'round') value = Math.round(value);
  return rule.priority?.mode === 'replace' ? value : base + value;
}

/** Geometry stacking and label/display priority remain intentionally separate. */
export function resolveConfigRuntimeStackOrder(
  config: ConfigPackageV3 | undefined,
  record: FeatureRecord,
  ctx: RenderContext,
  store?: FeatureStore,
): { geometryZ: number; displayPriority: number } {
  if (!config || !isNativeConfigRevision(config.contractRevision)) return { geometryZ: 0, displayPriority: 0 };
  const binding = runtimeBinding(config, record, ctx, store);
  if (binding.stack) return binding.stack;
  const active = binding.active;
  return binding.stack = {
    geometryZ: Number(active?.geometryStack?.zLevel ?? 0),
    displayPriority: active ? dynamicPriority(record, active) : 0,
  };
}

function nativeRule(config: ConfigPackageV3, record: FeatureRecord, ctx: RenderContext, store?: FeatureStore): RenderRule | null {
  if (!isNativeConfigRevision(config.contractRevision) || !config.engine) return null;
  const binding = runtimeBinding(config, record, ctx, store);
  const { geometry, profile } = binding;
  const path = pathFor(record);
  if (!profile?.enabled || profile.renderState==='unconfigured') return null;

  // World is an engine-assigned system field; it scopes loaded data rather than
  // being a per-Zoom condition.
  const activeWorld = normalizeRuleSourceWorldId(String(ctx.worldId));
  const rawFeatureWorld = String(featureValue(record, config.engine.world.field) ?? '').trim();
  // A mounted data source already supplies the world context. Missing World is
  // therefore safely inferred only from that source; an explicit unknown world
  // is never silently rendered in another world's layer.
  const featureWorld = rawFeatureWorld ? normalizeRuleSourceWorldId(rawFeatureWorld) : activeWorld;
  if (featureWorld !== activeWorld) return null;

  let resolved = binding.active;
  if (!resolved && resolveRenderExtensions(config, geometry).fallback?.whenRuleMissing === 'geometryOnly') {
    const base = createDefaultGeometryProfile(geometry).zoomPriority.rules[0];
    resolved = { ...base, extensions: resolveRenderExtensions(config, geometry, base.extensions), label: base.label ? { ...base.label, visible: false } : undefined };
  }
  const active = resolved;
  // A label is an optional part of a render rule.  Earlier r5 code returned
  // null for the *whole feature* when a rule intentionally hid/omitted its
  // label style, which is why a valid V3 polygon or line could disappear.
  // Geometry only needs an active representation, style and stack rule.
  if (!active || active.representation === 'hidden' || !active.style || !active.geometryStack) return null;

  const style = active.style;
  const label = active.label ?? {
    visible: false,
    collision: { role: 'optional' as const, basePriority: 0, hideWhenColliding: true },
  };
  const nativeLabelStyle = label.style ?? { family: 'gm-outline' as const, size: 14 };
  const pane = active.geometryStack.pane || paneFor(config, geometry, active.extensions?.pane);
  const triggers = profile.interaction?.triggers ?? {};
  const pathInteractive = (active.representation === 'point' && Boolean(triggers.point)) || (active.representation === 'point' && style.symbolVisibility === 'withLabel' && Boolean(triggers.label)) || (geometry === 'Polygon'
    ? Boolean(triggers.boundary || triggers.interior)
    : geometry === 'LineString' ? Boolean(triggers.line) : Boolean(triggers.point));
  const stroke = resolveColor(record, style.stroke, '#334155', store);
  const fill = resolveColor(record, style.fill, stroke, store);
  const hitTolerancePx = active.extensions?.hitTolerancePx ?? config.engine.interactionBaselines[geometry].hitTolerancePx;
  const pathStyle = {
    color: stroke,
    weight: style.weight ?? (geometry === 'LineString' ? 3 : 2),
    opacity: style.strokeOpacity,
    fillColor: fill,
    fillOpacity: style.fillOpacity ?? (geometry === 'Polygon' ? 0.25 : 0.88),
    dashArray: dashArray[style.dashPreset ?? 'solid'],
    lineCap: style.lineCap ?? 'round',
    lineJoin: style.lineJoin ?? 'round',
    pane,
    interactive: pathInteractive,
  };
  const labelKey = labelStyleKey(nativeLabelStyle, record, store);
  const screenGate = active.extensions?.screenGate;
  const minScreenAreaPx = geometry === 'Polygon'
    ? (screenGate?.mode === 'override' ? screenGate.minScreenAreaPx : active.representation === 'labelOnly' ? 0 : config.engine.screenGateDefaults.polygonMinScreenAreaPx)
    : undefined;
  const minScreenLengthPx = geometry === 'LineString'
    ? (screenGate?.mode === 'override' ? screenGate.minScreenLengthPx : config.engine.screenGateDefaults.lineMinScreenLengthPx)
    : undefined;
  const lineLabel = active.extensions?.lineLabel;
  const anchor = active.extensions?.anchor;
  const polygonCandidates = active.extensions?.polygonCandidates;
  const collisionExtensions = active.extensions?.collision;
  const stability = active.extensions?.stability;
  const density = active.extensions?.density;
  const fallback = active.extensions?.fallback;
  const labelText = active.extensions?.labelText;
  const ruleDisplayPriority = dynamicPriority(record, active);
  const collisionPriority = config.contractRevision >= 6 && label.collision.compatibility !== 'r5DisplayPriority'
    ? dynamicPriority(record, { ...active, priority: { mode: 'add', base: label.collision.basePriority, metric: label.collision.metric } })
    : label.collision.basePriority + ruleDisplayPriority;
  const iconSource = style.icon ? String(featureValue(record, style.icon.source) ?? '').trim() : '';
  if (style.icon && !iconSource && style.icon.fallback === 'hide') return null;
  const pointPlan = style.icon && iconSource
    ? { kind: 'icon' as const, iconUrlFrom: style.icon.source, iconSize: style.icon.size, iconAnchor: style.icon.anchor, pane, zIndexOffset: active.geometryStack.zLevel + (active.geometryStack.zIndexOffset ?? 0) + ruleDisplayPriority }
    : style.pointShape === 'circle' || !style.pointShape
      ? { kind: 'circle' as const, radius: style.size ?? Math.max(4, Number(style.weight ?? 2) * 3), style: pathStyle, pane, zIndexOffset: active.geometryStack.zLevel + (active.geometryStack.zIndexOffset ?? 0) + ruleDisplayPriority }
      : { kind: 'shape' as const, shape: style.pointShape, radius: style.size ?? Math.max(4, Number(style.weight ?? 2) * 3), style: pathStyle, pane, zIndexOffset: active.geometryStack.zLevel + (active.geometryStack.zIndexOffset ?? 0) + ruleDisplayPriority };
  const selectedVisual = resolveConfigInteractionVisual(config, record, ctx, 'selected', store);
  const nativePointPlan = { ...pointPlan, screenOffsetPx: style.symbolOffsetPx, followLabelAnchor: style.symbolAnchor === 'label', visibility: style.symbolVisibility };

  return {
    name: `config-v32:${path.class}:${geometry}:${active.id}`,
    match: { Class: path.class, Type: record.type },
    visible: (candidate, nativeContext, nativeStore) => isConfigRuntimeRecordVisible(config, candidate, nativeContext, nativeStore)
      && passesVisibilityExtension(config, candidate, nativeContext, active.extensions, nativeStore),
    symbol: {
      pane,
      pathStyle,
      point: nativePointPlan,
      label: {
        enabled: label.visible,
        textFrom: (candidate: FeatureRecord) => {
          if (!label.source) return 'Null';
          const sources = [label.source, ...(label.fallbackSources ?? [])].filter((source): source is string => Boolean(source));
          for (const source of sources) {
            const value = String(featureValue(candidate, source) ?? '').trim();
            if (value) {
              const format = source === label.source
                ? label.valueFormat
                : label.fallbackValueFormats?.[source] ?? label.valueFormat;
              return format === 'floorLabel' ? fmtFloorLabel(value) : value;
            }
          }
          return fallback?.whenNoLabelText === 'showID' ? String(featureValue(candidate, 'ID') ?? '') : fallback?.whenNoLabelText === 'showClassKind' ? [path.class,path.kind,path.skind,path.skind2].filter(Boolean).join('/') : fallback?.whenNoLabelText === 'placeholder' ? '—' : '';
        },
        ...(labelText?.maxChars !== undefined ? { maxChars: labelText.maxChars, abbreviation: { enabled: labelText.abbreviationEnabled !== false, maxChars: labelText.maxChars, suffix: labelText.suffix ?? '…' } } : {}),
        ...(labelText?.minChars !== undefined ? { minChars: labelText.minChars } : {}),
        ...(labelText?.emptyBehavior !== undefined ? { emptyBehavior: labelText.emptyBehavior } : {}),
        ...(labelText?.opacity !== undefined ? { opacity: labelText.opacity } : {}),
        ...(labelText?.multiline !== undefined ? { multiline: labelText.multiline } : {}),
        ...(labelText?.maxLines !== undefined ? { maxLines: labelText.maxLines } : {}),
        placement: label.placement ?? (geometry === 'LineString' ? 'aboveLine' : 'center'),
        ...(label.offsetY !== undefined ? { offsetY: label.offsetY } : {}),
        offsetX: label.offsetX ?? 0,
        screenOffsets: true,
        candidatePlacement: anchor?.candidatePlacement,
        ...(config.contractRevision >= 6 && label.withDot ? { withDot: true, dotAnchorMode: label.dotAnchorMode ?? 'inline' } : {}),
        // A decoration may accompany a genuine Point symbol in r6. Structures
        // represented by points use the native symbol/Label coupling instead.
        styleKey: labelKey as any,
        declutter: {
          enabled: label.collision.hideWhenColliding,
          ...(anchor?.candidates ? { candidates: anchor.candidates } : {}),
          group: label.collision.collisionGroup ?? 'config-runtime',
          priority: collisionPriority,
          role: label.collision.role,
          maxPerScreen: label.collision.densityLimit,
        },
      },
      labelClick: {
        enabled: Boolean(triggers.label || pathInteractive),
        mode: active.representation === 'labelOnly' ? 'labelOnly' : 'normal',
        labelStyleKey: labelKey as any,
        highlightStyleKey: 'dash',
        highlightPathStyle: interactionVisualToPathStyle(selectedVisual),
        highlightPointStyle: interactionVisualToPathStyle(selectedVisual),
        pointPinStyleKey: 'pin-blue',
        nativeVisual: selectedVisual,
        openCard: true,
        geom: { point: (geometry === 'Point' || active.representation === 'point') && pathInteractive, path: geometry !== 'Point' && active.representation !== 'point' && pathInteractive },
      },
    },
    display: {
      name: `V3.2 ${active.id}`,
      displayTier: geometry === 'Point' ? 'poi' : geometry === 'LineString' ? 'network' : 'structure',
      visibility: { minZoom: active.minZoom, maxZoom: active.maxZoom, minScreenAreaPx, minScreenLengthPx },
      geometry: {
        render: renderMode(geometry, active),
        zIndex: active.geometryStack.zLevel,
        stroke,
        strokeWidth: pathStyle.weight,
        strokeOpacity: pathStyle.opacity,
        fill,
        fillOpacity: pathStyle.fillOpacity,
        dashArray: pathStyle.dashArray,
        lineCap: pathStyle.lineCap,
        lineJoin: pathStyle.lineJoin,
        interactive: pathInteractive,
        hitTolerancePx,
      },
      symbol: {
        enabled: true,
        type: 'circle',
        radiusPx: style.size,
        color: fill,
        borderColor: stroke,
        borderWidth: pathStyle.weight,
        zIndex: active.geometryStack.zLevel,
        clickable: pathInteractive,
      },
      label: {
        enabled: label.visible,
        // An unset source is deliberately visible as `Null` in the preview,
        // not silently rewritten to Name by a lower display-plan layer.
        source: (label.source || '__v3_null_label__') as any,
        styleKey: labelKey as any,
        ...(labelText?.maxChars !== undefined ? { maxChars: labelText.maxChars, abbreviation: { enabled: labelText.abbreviationEnabled !== false, maxChars: labelText.maxChars, suffix: labelText.suffix ?? '…' } } : {}),
        ...(labelText?.minChars !== undefined ? { minChars: labelText.minChars } : {}),
        ...(labelText?.emptyBehavior !== undefined ? { emptyBehavior: labelText.emptyBehavior } : {}),
        ...(labelText?.opacity !== undefined ? { opacity: labelText.opacity } : {}),
        ...(labelText?.multiline !== undefined ? { multiline: labelText.multiline } : {}),
        ...(labelText?.maxLines !== undefined ? { maxLines: labelText.maxLines } : {}),
      },
      anchor: {
        strategy: geometry === 'LineString'
          ? (anchor?.strategy === 'lineCandidates' ? 'polylineStableCandidates' : 'polylineCenter')
          : anchor?.strategy === 'visibleInterior' ? 'visibleInteriorLargeOnly'
            : anchor?.strategy === 'interior' ? 'fixedInterior' : 'stableGeoCandidates',
        multipartMode: profile.anchor ?? 'featureBbox',
        ...(anchor?.candidates ? { candidates: anchor.candidates } : {}),
        ...(anchor?.offsetPx ? { offsetPx: anchor.offsetPx } : {}),
        ...(anchor?.candidateOffsetsPx ? { candidateOffsetsPx: anchor.candidateOffsetsPx } : {}),
        ...(anchor?.allowOutsideGeometry !== undefined ? { allowOutsideGeometry: anchor.allowOutsideGeometry } : {}),
        ...(anchor?.requireInsideGeometry !== undefined ? { requireInsideGeometry: anchor.requireInsideGeometry } : {}),
        ...(polygonCandidates ? {
          candidateWeightMode: polygonCandidates.weightMode,
          candidateSwitchThreshold: polygonCandidates.weightedSwitchThreshold,
          candidateReuseBonus: polygonCandidates.reuseBonus,
          candidateViewportPreference: polygonCandidates.viewportPreference,
          candidateEdgePenalty: polygonCandidates.edgePenalty,
          geoCandidateMode: polygonCandidates.mode === 'inherit' ? undefined : polygonCandidates.mode,
          geoCandidateCount: polygonCandidates.count,
          geoGridSize: polygonCandidates.gridSize,
          geoGridMinSize: polygonCandidates.gridMinSize,
          geoCandidateMax: polygonCandidates.maxCandidates,
          geoCandidateScanMax: polygonCandidates.scanMax,
          geoCandidateOverflow: polygonCandidates.overflow,
          preferPreviousGeoCandidate: polygonCandidates.preferPreviousCandidate,
          switchThreshold: polygonCandidates.switchThreshold,
          allowViewportCandidateFallback: polygonCandidates.allowViewportFallback,
          largeFeature: polygonCandidates.minScreenAreaPx !== undefined || polygonCandidates.preferViewportCenter !== undefined || anchor?.preferViewportCenter !== undefined
            ? { minScreenAreaPx: polygonCandidates.minScreenAreaPx ?? 0, preferViewportCenter: polygonCandidates.preferViewportCenter ?? anchor?.preferViewportCenter ?? false }
            : undefined,
        } : anchor?.preferViewportCenter !== undefined ? { largeFeature: { minScreenAreaPx: 0, preferViewportCenter: anchor.preferViewportCenter } } : {}),
        ...(lineLabel ? {
          lineLabelMode: lineLabel.mode ?? (lineLabel.profile === 'strict-on-line' ? 'strictOnLine' : 'free'),
          anchorSamples: lineLabel.anchorSamples,
          lineCandidateSpacing: lineLabel.candidateSpacing,
          lineCandidateMinSpacing: lineLabel.candidateMinSpacing,
          lineCandidateMax: lineLabel.candidateMax,
          lineShortThresholdMultiplier: lineLabel.shortThresholdMultiplier,
          lineLongMode: lineLabel.longMode,
          lineCandidateEndpointPaddingRatio: lineLabel.endpointPaddingRatio,
          lineCandidateEndpointPaddingMin: lineLabel.endpointPaddingMinPx,
          preferPreviousLineCandidate: lineLabel.preferPreviousCandidate,
          lineCandidateHysteresisPx: lineLabel.candidateHysteresisPx,
          maxAngleDeltaDeg: lineLabel.maxTurnAngleDeg,
          minLineLabelLengthPx: lineLabel.minLengthPx,
          lineTextMode: lineLabel.textMode,
          textPathMinLengthPx: lineLabel.textPathMinLengthPx,
          textPathPaddingPx: lineLabel.textPathPaddingPx,
          textPathMaxAngleDeltaDeg: lineLabel.textPathMaxAngleDeltaDeg,
          textPathMaxTotalBendDeg: lineLabel.textPathMaxTotalBendDeg,
          textPathPreferReadableDirection: lineLabel.textPathPreferReadableDirection,
          textPathFallback: lineLabel.textPathFallback,
          textPathCollisionPaddingPx: lineLabel.textPathCollisionPaddingPx,
          textPathLetterSpacingPx: lineLabel.textPathLetterSpacingPx,
          textPathCurvedLetterSpacingPx: lineLabel.textPathCurvedLetterSpacingPx,
          textPathCurvedSpacingMinBendDeg: lineLabel.textPathCurvedSpacingMinBendDeg,
          lineTextOrientationPolicy: lineLabel.orientationPolicy,
          textPathVerticalAngleThresholdDeg: lineLabel.textPathVerticalAngleThresholdDeg,
          textPathVerticalLengthRatio: lineLabel.textPathVerticalLengthRatio,
          candidateWeightMode: lineLabel.candidateWeightMode,
          candidateSwitchThreshold: lineLabel.candidateSwitchThreshold,
          candidateReuseBonus: lineLabel.candidateReuseBonus,
          candidateViewportPreference: lineLabel.candidateViewportPreference,
          candidateEdgePenalty: lineLabel.candidateEdgePenalty,
          lineCandidateOrdering: lineLabel.candidateOrdering,
          lineCenterWeightMode: lineLabel.centerWeightMode,
          lineCandidateSwitchThreshold: lineLabel.centerSwitchThreshold,
          lineCandidateReuseBonus: lineLabel.centerReuseBonus,
          lineCjkVerticalRenderMode: lineLabel.cjkVerticalRenderMode,
          svgVerticalCjkMinLengthPx: lineLabel.svgVerticalCjkMinLengthPx,
          svgVerticalCjkLetterSpacingPx: lineLabel.svgVerticalCjkLetterSpacingPx,
          advancedLineTextEnabled: lineLabel.advancedTextEnabled,
          advancedLineTextBudgetGroup: lineLabel.advancedTextBudgetGroup,
          advancedLineTextMaxLabels: lineLabel.advancedTextMaxLabels,
          advancedLineTextMaxCandidatesPerPass: lineLabel.advancedTextMaxCandidatesPerPass,
          cjkGlyphRotationPolicy: lineLabel.cjkGlyphRotationPolicy,
          cjkGlyphUprightAngleThresholdDeg: lineLabel.cjkGlyphUprightAngleThresholdDeg,
          cjkGlyphPathMode: lineLabel.cjkGlyphPathMode,
          cjkGlyphSpacingPx: lineLabel.cjkGlyphSpacingPx,
          cjkGlyphCollisionPaddingPx: lineLabel.cjkGlyphCollisionPaddingPx,
          cjkGlyphMinPathLengthPx: lineLabel.cjkGlyphMinPathLengthPx,
          cjkGlyphMaxCount: lineLabel.cjkGlyphMaxCount,
          cjkGlyphMaxAngleDeltaDeg: lineLabel.cjkGlyphMaxAngleDeltaDeg,
          cjkGlyphMaxTotalBendDeg: lineLabel.cjkGlyphMaxTotalBendDeg,
          cjkGlyphPreferReadableDirection: lineLabel.cjkGlyphPreferReadableDirection,
          cjkGlyphAllowTextPathFallback: lineLabel.cjkGlyphAllowTextPathFallback,
          lineTextPathHalfLengthMultiplier: lineLabel.textPathHalfLengthMultiplier,
          lineTextPathMinHalfLengthWorld: lineLabel.textPathMinHalfLengthWorld,
          lineTextPathMaxHalfLengthWorld: lineLabel.textPathMaxHalfLengthWorld,
          lineTextPathMaxHalfLengthRatio: lineLabel.textPathMaxHalfLengthRatio,
          lineTextCollisionRectMode: lineLabel.textCollisionRectMode,
          cjkGlyphCompactMode: lineLabel.cjkGlyphCompactMode,
          cjkGlyphMinAdvanceScale: lineLabel.cjkGlyphMinAdvanceScale,
          cjkGlyphFallbackMode: lineLabel.cjkGlyphFallbackMode,
          lineTextSimpleFallbackEnabled: lineLabel.simpleFallbackEnabled,
          lineTextSimpleFallbackRotate: lineLabel.simpleFallbackRotate,
          lineTextRepositionMode: lineLabel.repositionMode,
          lineTextRepositionAttemptsPerDirection: lineLabel.repositionAttemptsPerDirection,
          lineTextRepositionStepMode: lineLabel.repositionStepMode,
          lineTextRepositionFailure: lineLabel.repositionFailure,
          lineTextRepositionStrictSvg: lineLabel.repositionStrictSvg,
          lineTextAvoidLineGeometry: lineLabel.avoidLineGeometry,
          lineTextAvoidPolygonGeometry: lineLabel.avoidPolygonGeometry,
          lineTextAvoidPointSymbols: lineLabel.avoidPointSymbols,
          lineTextRepositionCollisionScope: lineLabel.repositionCollisionScope,
          lineTextViewportRectMode: lineLabel.viewportRectMode,
          lineTextViewportCandidateMode: lineLabel.viewportCandidateMode,
          lineTextViewportCandidateBufferPx: lineLabel.viewportCandidateBufferPx,
          lineTextViewportCandidateMaxTargets: lineLabel.viewportCandidateMaxTargets,
          lineTextViewportCandidateMinIntervalPx: lineLabel.viewportCandidateMinIntervalPx,
        } : {}),
      },
      collision: {
        role: label.collision.role,
        priority: collisionPriority,
        group: label.collision.collisionGroup as any,
        allowHide: label.collision.hideWhenColliding,
        collideWith: collisionExtensions?.collideWith,
        blocks: collisionExtensions?.blocks,
        allowOverlap: collisionExtensions?.allowOverlap,
        boundsAdjustment: collisionExtensions?.boundsAdjustment,
        paddingPx: collisionExtensions?.paddingPx,
        hidePolicy: collisionExtensions?.hidePolicy ?? (fallback?.whenCollisionFailed === 'forceShow' ? 'forceShow' : fallback?.whenCollisionFailed === 'abbreviate' ? 'abbreviateThenHide' : fallback?.whenCollisionFailed === 'showGeometryOnly' ? 'geometryOnly' : undefined),
      },
      density: {
        enabled: density?.mode === 'override' && density.enabled !== false,
        gridSizePx: density?.gridSizePx,
        maxLabelsPerGrid: density?.maxLabelsPerGrid,
        maxSymbolsPerGrid: density?.maxSymbolsPerGrid,
        reduceOrder: density?.reduceOrder,
        importanceField: density?.importanceField,
        preserveSelected: density?.preserveSelected,
        preserveRequired: density?.preserveRequired,
      },
      stability: stability ? {
        enabled: stability.enabled ?? true,
        cacheKey: stability.cacheKey,
        zoomBucketSize: stability.zoomBucketSize,
        freezeDuringPan: stability.freezeDuringPan,
        recomputeOnMoveEnd: stability.recomputeOnMoveEnd,
        recomputeOnZoomEnd: stability.recomputeOnZoomEnd,
        hysteresisPx: stability.hysteresisPx,
        keepPreviousCandidate: stability.keepPreviousCandidate,
        keepPreviousAnchor: stability.keepPreviousAnchor,
        invalidateWhen: stability.invalidateWhen,
      } : undefined,
      fallback: fallback ? {
        whenNoLabelText: fallback.whenNoLabelText,
        whenCollisionFailed: fallback.whenCollisionFailed,
        whenRuleMissing: fallback.whenRuleMissing,
        whenGeometryInvalid: fallback.whenGeometryInvalid,
      } : undefined,
      interaction: {
        hover: {
          raiseZIndex: resolveConfigInteractionVisual(config, record, ctx, 'hover', store).enabled && Number(resolveConfigInteractionVisual(config, record, ctx, 'hover', store).zIndexOffset ?? 0) > 0,
          showLabel: resolveConfigInteractionVisual(config, record, ctx, 'hover', store).enabled && resolveConfigInteractionVisual(config, record, ctx, 'hover', store).forceShowLabel !== false,
          highlightGeometry: resolveConfigInteractionVisual(config, record, ctx, 'hover', store).enabled,
        },
        selected: {
          forceShowGeometry: selectedVisual.enabled,
          forceShowLabel: selectedVisual.enabled && selectedVisual.forceShowLabel !== false,
          priorityOverride: selectedVisual.enabled ? selectedVisual.labelPriority : undefined,
          zIndexOverride: selectedVisual.enabled ? selectedVisual.zIndexOffset : undefined,
        },
        searchResult: {
          forceShowLabel: resolveConfigInteractionVisual(config, record, ctx, 'searchResult', store).enabled && resolveConfigInteractionVisual(config, record, ctx, 'searchResult', store).forceShowLabel !== false,
          pulseSymbol: resolveConfigInteractionVisual(config, record, ctx, 'searchResult', store).enabled,
          priorityOverride: resolveConfigInteractionVisual(config, record, ctx, 'searchResult', store).enabled ? resolveConfigInteractionVisual(config, record, ctx, 'searchResult', store).labelPriority : undefined,
        },
        editing: {
          forceShowVertices: resolveConfigInteractionVisual(config, record, ctx, 'editing', store).enabled,
          forceShowLabel: resolveConfigInteractionVisual(config, record, ctx, 'editing', store).enabled && resolveConfigInteractionVisual(config, record, ctx, 'editing', store).forceShowLabel !== false,
          renderDraftStyle: resolveConfigInteractionVisual(config, record, ctx, 'editing', store).enabled,
          priorityOverride: resolveConfigInteractionVisual(config, record, ctx, 'editing', store).enabled ? resolveConfigInteractionVisual(config, record, ctx, 'editing', store).labelPriority : undefined,
        },
        deletionMarked: {
          renderDeleteStyle: resolveConfigInteractionVisual(config, record, ctx, 'deletionMarked', store).enabled,
          forceShowLabel: resolveConfigInteractionVisual(config, record, ctx, 'deletionMarked', store).enabled && resolveConfigInteractionVisual(config, record, ctx, 'deletionMarked', store).forceShowLabel !== false,
        },
      },
    },
  } as RenderRule;
}

/** Called by the render loop once a map and projection exist for pixel metrics. */
export function resolveConfigRuntimeScreenGate(config: ConfigPackageV3 | undefined, record: FeatureRecord, ctx: RenderContext): ConfigRuntimeScreenGate | undefined {
  if (!config || !isNativeConfigRevision(config.contractRevision) || !config.engine) return undefined;
  const { geometry, profile, active } = runtimeBinding(config, record, ctx, undefined, true);
  if (!profile?.enabled || !active) return undefined;
  const screen = active.extensions?.screenGate;
  return {
    ...(geometry === 'Polygon' ? { minScreenAreaPx: screen?.mode === 'override' ? screen.minScreenAreaPx : active.representation === 'labelOnly' ? 0 : config.engine.screenGateDefaults.polygonMinScreenAreaPx } : {}),
    ...(geometry === 'LineString' ? { minScreenLengthPx: screen?.mode === 'override' ? screen.minScreenLengthPx : config.engine.screenGateDefaults.lineMinScreenLengthPx } : {}),
  };
}

/** Declarative V3 cards share FeatureInteractionCard's established renderer.
 * Only deliberately specialised component cards return undefined here. */
export function resolveConfigRuntimeCardOverride(config: ConfigPackageV3 | undefined, record: FeatureRecord) {
  return buildV3CardSections(config, record);
}

export function resolveConfigRuntimeRule(
  config: ConfigPackageV3 | undefined,
  record: FeatureRecord,
  ctx: RenderContext,
  fallback: RenderRule | null,
  store?: FeatureStore,
): RenderRule | null {
  if (!config) return fallback;
  if (!isCompiledConfigRuntime(config)) return nativeRule(config, record, ctx, store);
  const binding = runtimeBinding(config, record, ctx, store);
  if (!binding.nativeResolved) { binding.native = nativeRule(config, record, ctx, store); binding.nativeResolved = true; }
  return binding.native ?? null;
}
