import { normalizeImportedText } from './localization';
import { listClassConfigs } from '@/core/project/classMetadata';
import { getOpenRIAMapWorkflowConfigs } from '@/core/project/openriamapRiaWorkflows';
import {
  getOpenRIAMapDisplayProfilesConfig,
  getOpenRIAMapFieldControlsConfig,
  getOpenRIAMapSpecialDisplayLogicConfig,
} from '@/core/project/openriamapRiaShared';
import type { CairnMapClassConfig, CairnMapClassFieldConfig } from '@/core/project/classTypes';
import type { CairnMapWorkflowBlock, CairnMapWorkflowConfig } from '@/core/project/workflowTypes';
import { FEATURE_CARD_REGISTRY } from '@/components/Rules/cardrules/featureCardRegistry';
import { FEATURE_RENDER_RULES } from '@/components/Rules/rendering/featureRenderRules';
import { resolveFeatureDisplayPlan } from '@/components/Rules/rendering/display/displayRuleResolver';
import { FeatureStore } from '@/components/Rules/data/featureStore';
import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import type { FeatureDisplayRuleDraft } from '@/components/Rules/rendering/display/displayTypes';
import { WORKFLOW_EDITOR_SCHEMAS, projectRegistryScene, resolveClassificationDisplayName } from '@/components/Common/workflowEditorRegistry';
import { resolveCardRegistryLayout } from '@/components/Rules/cardrules/cardRegistry';
import { getFormatDef, type FeatureKey } from '@/components/Common/featureFormats';
import cardLayoutsJson from '../../project-config/presets/core-structures/shared/card/cardLayouts.json';
import workflowBlocksJson from '../../project-config/presets/core-structures/shared/workflow/workflowBlocks.json';
import type {
  CardConfiguration,
  CardItem,
  CategoryNode,
  ClassificationPath,
  ConfigPackageV3,
  ConfigRegistries,
  ControlledRegistryItem,
  FieldDefinition,
  GeometryKind,
  GeometryProfile,
  LocalizedText,
  ParityEntry,
  RenderLabelVisualStyle,
  RenderLabelStyle,
  RenderRuleExtensions,
  RenderStyle,
  WorkflowControl,
  WorkflowGroupField,
  WorkflowDefinition,
  WorkflowStep,
  ZoomPriorityRule,
} from './types';
import { createV32EngineDefaults } from './v32Defaults';

const RESERVED = new Set(['ID', 'World', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Creator', 'CreatedAt', 'Editor', 'EditedAt', 'CoordP', 'CoordL', 'CoordG']);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? clone(value as Record<string, unknown>) : {};
const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];

function localized(value: unknown, fallback: string): LocalizedText {
  // Migration must not fabricate English by copying Chinese. An empty `en`
  // means V1 did not author an English value and leaves a real editable gap.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    const zh = source['zh-CN'] ?? source.zh ?? source.cn ?? source.label ?? source.name;
    const en = source['en-US'] ?? source.en ?? source.english;
    return normalizeImportedText(zh ?? fallback, en);
  }
  if (typeof value === 'string' && value.trim()) return { zh: value, en: '' };
  return { zh: fallback, en: '' };
}

function textRegistry(items: unknown, fallbackPrefix: string): ControlledRegistryItem[] {
  return array(items).map((item, index) => {
    const id = String(item.id ?? item.key ?? `${fallbackPrefix}-${index}`);
    return {
      id,
      label: localized(item.label ?? item.name, id),
      ...(Array.isArray(item.allowedClasses) ? { allowedClasses: item.allowedClasses.map(String) } : {}),
      ...(Array.isArray(item.optionSchema) ? { optionSchema: clone(item.optionSchema) as ControlledRegistryItem['optionSchema'] } : {}),
    };
  });
}

function buildRegistries(workflows: CairnMapWorkflowConfig[]): ConfigRegistries {
  const layouts = record(cardLayoutsJson).items;
  const displayProfiles = getOpenRIAMapDisplayProfilesConfig().items;
  const specialDisplayLogic = getOpenRIAMapSpecialDisplayLogicConfig().items;
  const fieldControls = getOpenRIAMapFieldControlsConfig().items;
  const workflowBlocks = record(workflowBlocksJson).items;
  const workflowComponentKeys = new Set<string>();
  for (const workflow of workflows) {
    if (workflow.componentKey) workflowComponentKeys.add(String(workflow.componentKey));
    for (const page of workflow.pages ?? []) for (const block of page.blocks ?? []) {
      const raw = record(block);
      if (raw.componentKey) workflowComponentKeys.add(String(raw.componentKey));
    }
  }
  const registeredWorkflowBlocks = textRegistry(workflowBlocks, 'workflow-block');
  for (const key of workflowComponentKeys) if (key && !registeredWorkflowBlocks.some((item) => item.id === key)) registeredWorkflowBlocks.push({ id: key, label: { zh: `${key} 工作流组件`, en: `${key} workflow component` } });
  const optionSets = new Map<string, { id: string; label: LocalizedText; options: import('./types').SelectOption[] }>();
  for (const config of listClassConfigs()) {
    const definition = getFormatDef(config.sourceFeatureKey as FeatureKey);
    for (const field of config.fields.filter(field => field.type === 'select')) {
      const runtime = definition.fields.find(candidate => candidate.key === (field.sourceRuntimeField ?? field.key));
      const options = field.options?.length ? field.options.map(option => ({ value: String(option.value), label: localized(option.label, String(option.value)) })) : runtime?.options?.map(option => ({ value: String(option.value), label: { zh: option.label, en: '' } })) ?? [];
      optionSets.set(`v1-field-options:${config.classCode}:${field.key}`, { id: `v1-field-options:${config.classCode}:${field.key}`, label: localized(field.label, field.key), options });
    }
  }
  for (const schema of WORKFLOW_EDITOR_SCHEMAS) for (const field of projectRegistryScene(schema, 'workflow').fields) if (field.selectSource) {
    const configured = listClassConfigs().find(config => config.classCode === schema.match.classCode)?.fields.find(candidate => candidate.key === field.key || candidate.key === field.path);
    const options = configured?.options?.map(option => ({ value: String(option.value), label: localized(option.label, String(option.value)) })) ?? optionSets.get(`v1-field-options:${schema.match.classCode}:${field.key}`)?.options ?? [];
    if (!optionSets.has(field.selectSource)) optionSets.set(field.selectSource, { id: field.selectSource, label: { zh: field.label, en: '' }, options });
  }
  return {
    optionSets: [...optionSets.values()],
    cardLayouts: textRegistry(layouts, 'layout'),
    cardComponents: Object.keys(FEATURE_CARD_REGISTRY).map((key) => ({
      id: key,
      label: { zh: `${key} 专用信息卡`, en: `${key} special feature card` },
      allowedClasses: [key],
    })),
    displayProfiles: textRegistry(displayProfiles, 'display-profile'),
    specialDisplayLogic: textRegistry(specialDisplayLogic, 'display-logic'),
    workflowControls: textRegistry(fieldControls, 'field-control'),
    workflowBlocks: registeredWorkflowBlocks,
  };
}

function fieldType(value: CairnMapClassFieldConfig['type']): FieldDefinition['type'] {
  if (value === 'number') return 'number';
  if (value === 'bool') return 'boolean';
  if (value === 'select') return 'enum';
  if (value === 'featureRef') return 'reference';
  return 'string';
}

function inputType(field: CairnMapClassFieldConfig): FieldDefinition['input'] {
  if (field.type === 'select') return 'select';
  if (field.type === 'bool') return 'toggle';
  if (field.type === 'featureRef') return 'featureSearch';
  return 'text';
}

function baseZLevel(classCode: string): number {
  if (classCode === 'STA' || classCode === 'PLF') return 420;
  if (classCode === 'RLE' || classCode === 'ROD') return 320;
  if (classCode === 'BUD' || classCode === 'FLR' || classCode === 'STB' || classCode === 'STF') return 360;
  return 300;
}

function defaultColor(classCode: string, geometry: GeometryKind): string {
  if (classCode === 'RLE' || classCode === 'PLF' || classCode === 'STA') return '#2563eb';
  if (classCode === 'BUD' || classCode === 'STB') return '#111827';
  if (classCode === 'FLR') return '#334155';
  if (geometry === 'Point') return '#e04747';
  if (geometry === 'LineString') return '#2563eb';
  return '#334155';
}

function triggersFor(geometry: GeometryKind): NonNullable<GeometryProfile['interaction']>['triggers'] {
  if (geometry === 'Point') return { point: true, label: true };
  if (geometry === 'LineString') return { line: true, label: true };
  return { boundary: true, interior: true, label: true };
}

function legacyRenderRuleFor(config: CairnMapClassConfig) {
  const type = config.geometry.type === 'Point' ? 'Points' : config.geometry.type === 'LineString' ? 'Polyline' : 'Polygon';
  return FEATURE_RENDER_RULES.find((rule) => rule.match.Class === config.classCode && (!rule.match.Type || rule.match.Type === type));
}

function visualStyleFromV1(key: unknown, geometry: GeometryKind): RenderLabelVisualStyle {
  const raw = String(key ?? '').trim();
  const size = Number(raw.match(/(\d+)$/)?.[1] ?? (geometry === 'Polygon' ? 12 : geometry === 'LineString' ? 12 : 14));
  if (raw.startsWith('rle-line')) return { family: 'rle-line-color', size, color: { mode: 'field', field: 'color', fallbackColor: '#2563eb' } };
  if (raw.startsWith('rle-pill')) return { family: 'rle-pill-color', size, color: { mode: 'field', field: 'color', fallbackColor: '#2563eb' } };
  if (raw.startsWith('gm-wtb')) return { family: 'gm-wtb', size };
  if (raw.startsWith('structure-label')) return { family: 'structure-label', size };
  if (raw.startsWith('bubble-dark')) return { family: 'bubble-dark', size };
  if (raw.startsWith('gm-bw')) return { family: 'gm-bw', size };
  // The un-suffixed V1 outline key is a real 17px production family, not an
  // unspecified 12px polygon fallback.  Preserve that distinction in V3.
  if (raw === 'gm-outline' || raw === 'gm-outline-bold') return { family: 'gm-outline', size: 17, ...(raw.endsWith('bold') ? { modifiers: { bold: true } } : {}) };
  return { family: 'gm-outline', size };
}

function extensionsFromV1(display: FeatureDisplayRuleDraft | undefined): RenderRuleExtensions {
  const anchor = display?.anchor ?? {};
  const label = display?.label ?? {};
  const collision = display?.collision ?? {};
  const density = display?.density;
  const stability = display?.stability;
  const fallback = display?.fallback;
  const strategy = anchor.strategy === 'polylineStableCandidates' ? 'lineCandidates'
    : anchor.strategy === 'polylineCenter' ? 'lineCenter'
      : anchor.strategy === 'fixedInterior' ? 'interior'
        : anchor.strategy === 'visibleInteriorLargeOnly' ? 'visibleInterior'
          : anchor.strategy === 'pointVariable' ? 'featureCenter' : 'featureCenter';
  return {
    screenGate: { mode: 'inherit' },
    anchor: {
      strategy,
      ...(anchor.candidates ? { candidates: anchor.candidates.filter((item): item is 'C' | 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' => ['C', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(item)) } : {}),
      ...(anchor.offsetPx ? { offsetPx: anchor.offsetPx } : {}),
      ...(anchor.candidateOffsetsPx ? { candidateOffsetsPx: anchor.candidateOffsetsPx } : {}),
      ...(anchor.allowOutsideGeometry !== undefined ? { allowOutsideGeometry: anchor.allowOutsideGeometry } : {}),
      ...(anchor.requireInsideGeometry !== undefined ? { requireInsideGeometry: anchor.requireInsideGeometry } : {}),
    },
    polygonCandidates: {
      weightMode: anchor.candidateWeightMode,
      weightedSwitchThreshold: anchor.candidateSwitchThreshold,
      reuseBonus: anchor.candidateReuseBonus,
      viewportPreference: anchor.candidateViewportPreference,
      edgePenalty: anchor.candidateEdgePenalty,
      ...(anchor.geoCandidateMode ? { mode: anchor.geoCandidateMode } : {}),
      ...(anchor.geoCandidateCount !== undefined ? { count: anchor.geoCandidateCount } : {}),
      ...(anchor.geoGridSize !== undefined ? { gridSize: anchor.geoGridSize } : {}),
      ...(anchor.geoGridMinSize !== undefined ? { gridMinSize: anchor.geoGridMinSize } : {}),
      ...(anchor.geoCandidateMax !== undefined ? { maxCandidates: anchor.geoCandidateMax } : {}),
      ...(anchor.geoCandidateScanMax !== undefined ? { scanMax: anchor.geoCandidateScanMax } : {}),
      ...(anchor.geoCandidateOverflow ? { overflow: anchor.geoCandidateOverflow } : {}),
      ...(anchor.preferPreviousGeoCandidate !== undefined ? { preferPreviousCandidate: anchor.preferPreviousGeoCandidate } : {}),
      ...(anchor.switchThreshold !== undefined ? { switchThreshold: anchor.switchThreshold } : {}),
      ...(anchor.allowViewportCandidateFallback !== undefined ? { allowViewportFallback: anchor.allowViewportCandidateFallback } : {}),
      ...(anchor.largeFeature ? { minScreenAreaPx: anchor.largeFeature.minScreenAreaPx, preferViewportCenter: anchor.largeFeature.preferViewportCenter } : {}),
    },
    lineLabel: {
      // A blank line-label extension is deliberately marked inherit for points
      // and polygons.  The fully populated typed fields below are retained
      // only when V1 actually selected a line algorithm.
      profile: anchor.lineLabelMode === 'strictOnLine' ? 'strict-on-line' : anchor.strategy === 'polylineStableCandidates' ? 'network' : anchor.strategy === 'polylineCenter' ? 'standard' : 'inherit',
      mode: anchor.lineLabelMode,
      anchorSamples: anchor.anchorSamples,
      candidateSpacing: anchor.lineCandidateSpacing,
      candidateMinSpacing: anchor.lineCandidateMinSpacing,
      candidateMax: anchor.lineCandidateMax,
      shortThresholdMultiplier: anchor.lineShortThresholdMultiplier,
      longMode: anchor.lineLongMode,
      endpointPaddingRatio: anchor.lineCandidateEndpointPaddingRatio,
      endpointPaddingMinPx: anchor.lineCandidateEndpointPaddingMin,
      preferPreviousCandidate: anchor.preferPreviousLineCandidate,
      candidateHysteresisPx: anchor.lineCandidateHysteresisPx,
      minLengthPx: anchor.minLineLabelLengthPx,
      maxTurnAngleDeg: anchor.maxAngleDeltaDeg,
      textMode: anchor.lineTextMode,
      textPathMinLengthPx: anchor.textPathMinLengthPx,
      textPathPaddingPx: anchor.textPathPaddingPx,
      textPathMaxAngleDeltaDeg: anchor.textPathMaxAngleDeltaDeg,
      textPathMaxTotalBendDeg: anchor.textPathMaxTotalBendDeg,
      textPathPreferReadableDirection: anchor.textPathPreferReadableDirection,
      textPathFallback: anchor.textPathFallback,
      textPathCollisionPaddingPx: anchor.textPathCollisionPaddingPx,
      textPathLetterSpacingPx: anchor.textPathLetterSpacingPx,
      textPathCurvedLetterSpacingPx: anchor.textPathCurvedLetterSpacingPx,
      textPathCurvedSpacingMinBendDeg: anchor.textPathCurvedSpacingMinBendDeg,
      orientationPolicy: anchor.lineTextOrientationPolicy,
      textPathVerticalAngleThresholdDeg: anchor.textPathVerticalAngleThresholdDeg,
      textPathVerticalLengthRatio: anchor.textPathVerticalLengthRatio,
      candidateOrdering: anchor.lineCandidateOrdering,
      candidateWeightMode: anchor.candidateWeightMode,
      candidateSwitchThreshold: anchor.candidateSwitchThreshold,
      candidateReuseBonus: anchor.candidateReuseBonus,
      candidateViewportPreference: anchor.candidateViewportPreference,
      candidateEdgePenalty: anchor.candidateEdgePenalty,
      centerWeightMode: anchor.lineCenterWeightMode,
      centerSwitchThreshold: anchor.lineCandidateSwitchThreshold,
      centerReuseBonus: anchor.lineCandidateReuseBonus,
      cjkVerticalRenderMode: anchor.lineCjkVerticalRenderMode,
      svgVerticalCjkMinLengthPx: anchor.svgVerticalCjkMinLengthPx,
      svgVerticalCjkLetterSpacingPx: anchor.svgVerticalCjkLetterSpacingPx,
      advancedTextEnabled: anchor.advancedLineTextEnabled,
      advancedTextBudgetGroup: anchor.advancedLineTextBudgetGroup,
      advancedTextMaxLabels: anchor.advancedLineTextMaxLabels,
      advancedTextMaxCandidatesPerPass: anchor.advancedLineTextMaxCandidatesPerPass,
      cjkGlyphRotationPolicy: anchor.cjkGlyphRotationPolicy,
      cjkGlyphUprightAngleThresholdDeg: anchor.cjkGlyphUprightAngleThresholdDeg,
      cjkGlyphPathMode: anchor.cjkGlyphPathMode,
      cjkGlyphSpacingPx: anchor.cjkGlyphSpacingPx,
      cjkGlyphCollisionPaddingPx: anchor.cjkGlyphCollisionPaddingPx,
      cjkGlyphMinPathLengthPx: anchor.cjkGlyphMinPathLengthPx,
      cjkGlyphMaxCount: anchor.cjkGlyphMaxCount,
      cjkGlyphMaxAngleDeltaDeg: anchor.cjkGlyphMaxAngleDeltaDeg,
      cjkGlyphMaxTotalBendDeg: anchor.cjkGlyphMaxTotalBendDeg,
      cjkGlyphPreferReadableDirection: anchor.cjkGlyphPreferReadableDirection,
      cjkGlyphAllowTextPathFallback: anchor.cjkGlyphAllowTextPathFallback,
      textPathHalfLengthMultiplier: anchor.lineTextPathHalfLengthMultiplier,
      textPathMinHalfLengthWorld: anchor.lineTextPathMinHalfLengthWorld,
      textPathMaxHalfLengthWorld: anchor.lineTextPathMaxHalfLengthWorld,
      textPathMaxHalfLengthRatio: anchor.lineTextPathMaxHalfLengthRatio,
      textCollisionRectMode: anchor.lineTextCollisionRectMode,
      cjkGlyphCompactMode: anchor.cjkGlyphCompactMode,
      cjkGlyphMinAdvanceScale: anchor.cjkGlyphMinAdvanceScale,
      cjkGlyphFallbackMode: anchor.cjkGlyphFallbackMode,
      simpleFallbackEnabled: anchor.lineTextSimpleFallbackEnabled,
      simpleFallbackRotate: anchor.lineTextSimpleFallbackRotate,
      repositionMode: anchor.lineTextRepositionMode,
      repositionAttemptsPerDirection: anchor.lineTextRepositionAttemptsPerDirection,
      repositionStepMode: anchor.lineTextRepositionStepMode,
      repositionFailure: anchor.lineTextRepositionFailure,
      repositionStrictSvg: anchor.lineTextRepositionStrictSvg,
      avoidLineGeometry: anchor.lineTextAvoidLineGeometry,
      avoidPolygonGeometry: anchor.lineTextAvoidPolygonGeometry,
      avoidPointSymbols: anchor.lineTextAvoidPointSymbols,
      repositionCollisionScope: anchor.lineTextRepositionCollisionScope,
      viewportRectMode: anchor.lineTextViewportRectMode,
      viewportCandidateMode: anchor.lineTextViewportCandidateMode,
      viewportCandidateBufferPx: anchor.lineTextViewportCandidateBufferPx,
      viewportCandidateMaxTargets: anchor.lineTextViewportCandidateMaxTargets,
      viewportCandidateMinIntervalPx: anchor.lineTextViewportCandidateMinIntervalPx,
    },
    labelText: {
      maxChars: label.maxChars ?? label.abbreviation?.maxChars,
      minChars: label.minChars,
      multiline: label.multiline,
      maxLines: label.maxLines,
      suffix: label.abbreviation?.suffix,
      abbreviationEnabled: label.abbreviation?.enabled,
      emptyBehavior: label.emptyBehavior,
      opacity: label.opacity,
    },
    collision: {
      collideWith: collision.collideWith,
      blocks: collision.blocks,
      allowOverlap: collision.allowOverlap,
      paddingPx: collision.paddingPx,
      hidePolicy: collision.hidePolicy,
    },
    ...(density ? { density: {
      mode: 'override' as const,
      enabled: density.enabled,
      gridSizePx: density.gridSizePx,
      maxLabelsPerGrid: density.maxLabelsPerGrid,
      maxSymbolsPerGrid: density.maxSymbolsPerGrid,
      reduceOrder: density.reduceOrder,
      importanceField: density.importanceField,
      preserveSelected: density.preserveSelected,
      preserveRequired: density.preserveRequired,
    } } : {}),
    ...(stability ? { stability: clone(stability) } : {}),
    ...(fallback ? { fallback: clone(fallback) } : {}),
  };
}

/**
 * Turn the actual V1 branches into one or more inclusive V3 Zoom rules.
 *
 * The important invariant is that a Zoom range stays the one rendering-rule
 * object.  Field or store dependent V1 behaviour is expressed as typed
 * conditional overrides / visibility extensions inside that range, never as a
 * hidden V1 callback carried in `advanced`.
 */
function geometryProfile(config: CairnMapClassConfig, path: ClassificationPath = { class: config.classCode }): GeometryProfile {
  const geometry = config.geometry.type as GeometryKind;
  const v1Rule = legacyRenderRuleFor(config);
  const sample = { uid: 'v1-migration-probe', type: geometry === 'Point' ? 'Points' : geometry === 'LineString' ? 'Polyline' : 'Polygon', meta: { Class: path.class, Type: geometry === 'Point' ? 'Points' : geometry === 'LineString' ? 'Polyline' : 'Polygon', World: 'zth', idValue: 'v1-migration-probe', sig: {} }, featureInfo: { Class: path.class, Kind: path.kind, SKind: path.skind, SKind2: path.skind2, World: 'zth', Name: 'Migration' }, p3: { x: 0, y: -64, z: 0 }, coords3: [{ x: 0, y: -64, z: 0 }, { x: 20, y: -64, z: 0 }, { x: 20, y: -64, z: 20 }] } as unknown as FeatureRecord;
  // Config overlays can make display a function. Read its effective plan,
  // rather than losing its collision/candidate settings in an object cast.
  const display = v1Rule ? resolveFeatureDisplayPlan(sample, v1Rule, { worldId: 'zth', leafletZoom: 3, zoomLevel: 6, inFloorView: false, activeBuildingUid: null, activeFloorSelector: null, activeBuildingFloorRefSet: null }, new FeatureStore([sample])) as FeatureDisplayRuleDraft : undefined;
  const geometryConfig = display?.geometry ?? {};
  const rawLabel = v1Rule?.symbol?.label;
  const sourceLabel = typeof rawLabel === 'function' ? rawLabel(sample, { worldId: 'zth', leafletZoom: 3, zoomLevel: 6, inFloorView: false, activeBuildingUid: null, activeFloorSelector: null, activeBuildingFloorRefSet: null }, new FeatureStore([sample])) : rawLabel;
  const symbolConfig = display?.symbol ?? {};
  const labelConfig = display?.label ?? {};
  const collision = display?.collision ?? {};
  const zLevel = Number(geometryConfig.zIndex ?? symbolConfig.zIndex ?? baseZLevel(config.classCode));
  const color = defaultColor(config.classCode, geometry);
  const staticPath = v1Rule?.symbol && typeof v1Rule.symbol === 'object' && !Array.isArray(v1Rule.symbol)
    ? (v1Rule.symbol as Record<string, unknown>).pathStyle : undefined;
  const pathStyle = staticPath && typeof staticPath === 'object' && !Array.isArray(staticPath) ? staticPath as Record<string, unknown> : {};
  const style: RenderStyle = {
    ...(geometry === 'Point' ? { pointShape: 'circle' as const, size: Number(symbolConfig.radiusPx ?? 5) } : {}),
    weight: Number(pathStyle.weight ?? geometryConfig.strokeWidth ?? (geometry === 'LineString' ? 3 : 2)),
    stroke: { mode: 'fixed' as const, color: String(pathStyle.color ?? geometryConfig.stroke ?? color) },
    ...(geometry === 'LineString' ? {} : { fill: { mode: 'fixed' as const, color: String(pathStyle.fillColor ?? geometryConfig.fill ?? color) }, fillOpacity: Number(pathStyle.fillOpacity ?? geometryConfig.fillOpacity ?? (geometry === 'Polygon' ? 0.08 : 0.88)) }),
    strokeOpacity: Number(pathStyle.opacity ?? geometryConfig.strokeOpacity ?? 0.9),
    dashPreset: String(geometryConfig.dashArray ?? '').trim() ? 'dash' as const : 'solid' as const,
    lineCap: geometryConfig.lineCap ?? 'round' as const,
    lineJoin: geometryConfig.lineJoin ?? 'round' as const,
  };
  const label: RenderLabelStyle = {
    ...(sourceLabel?.withDot ? { withDot: true, dotAnchorMode: sourceLabel.dotAnchorMode ?? 'inline' } : {}),
    ...(geometry === 'Point' ? { placement: 'near' as const, offsetY: -Number(sourceLabel?.offsetY ?? 0) } : {}),
    visible: labelConfig.enabled !== false,
    style: visualStyleFromV1(labelConfig.styleKey, geometry),
    source: labelConfig.source === 'custom' ? 'Name' : String(labelConfig.source ?? 'Name'),
    collision: {
      role: collision.role ?? 'optional',
      basePriority: Number(collision.priority ?? zLevel),
      collisionGroup: collision.group,
      hideWhenColliding: collision.allowHide !== false,
    },
  };
  const extensions = extensionsFromV1(display);
  const sourceCandidates = sourceLabel?.declutter?.candidates;
  if (sourceCandidates?.length) {
    const candidates = sourceCandidates.map(candidate => typeof candidate === 'string' ? candidate : candidate.name).filter((name): name is 'C' | 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' => ['C', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(name));
    extensions.anchor = { ...extensions.anchor, candidates, candidatePlacement: 'aroundAnchor' };
  }
  if (geometry !== 'LineString') delete extensions.lineLabel;
  const rawClick = v1Rule?.symbol?.labelClick;
  const click = typeof rawClick === 'function' ? rawClick(sample, { worldId: 'zth', leafletZoom: 3, zoomLevel: 6, inFloorView: false, activeBuildingUid: null, activeFloorSelector: null, activeBuildingFloorRefSet: null }, new FeatureStore([sample])) : rawClick;
  const representation = geometry === 'Point' || geometryConfig.render === 'none' ? 'point' as const : 'geometry' as const;
  const fullPriority = { mode: 'replace' as const, base: Number(collision.priority ?? zLevel) };
  const makeRule = (id: string, minZoom: number, maxZoom: number, patch: Partial<ZoomPriorityRule> = {}): ZoomPriorityRule => ({
    id,
    minZoom,
    maxZoom,
    representation,
    style: clone(style),
    label: clone(label),
    geometryStack: { zLevel },
    priority: fullPriority,
    extensions: clone(extensions),
    ...patch,
  });
  const hidden = (id: string, minZoom: number, maxZoom: number): ZoomPriorityRule => makeRule(id, minZoom, maxZoom, {
    representation: 'hidden', label: { ...clone(label), visible: false }, priority: { mode: 'replace', base: 0 },
  });
  const styled = (patch: Partial<RenderStyle>): RenderStyle => ({ ...clone(style), ...patch });
  const labeled = (patch: Partial<RenderLabelStyle> = {}): RenderLabelStyle => ({ ...clone(label), ...patch, ...(patch.collision ? { collision: { ...label.collision, ...patch.collision } } : {}) });
  const withVisibleRange = (id: string, minZoom: number, maxZoom: number, patch: Partial<ZoomPriorityRule>): ZoomPriorityRule[] => [
    ...(minZoom > 0 ? [hidden(`${id}-hidden-before`, 0, minZoom - 1)] : []),
    makeRule(id, minZoom, maxZoom, patch),
    ...(maxZoom < 8 ? [hidden(`${id}-hidden-after`, maxZoom + 1, 8)] : []),
  ];
  const profile = (rules: ZoomPriorityRule[]): GeometryProfile => ({
    enabled: true,
    allowMultipleParts: true,
    anchor: 'featureBbox',
    interaction: { triggers: click ? { label: click.enabled, point: geometry === 'Point' && click.geom?.point === true, line: geometry === 'LineString' && click.geom?.path === true, boundary: geometry === 'Polygon' && click.geom?.path === true, interior: geometry === 'Polygon' && click.geom?.path === true } : triggersFor(geometry) },
    zoomPriority: { rules: rules.map(rule => {
      if (!rule.label) return rule;
      const structure = config.classCode === 'BUD' || config.classCode === 'STB';
      return { ...rule, label: { ...rule.label, collision: { ...rule.label.collision,
        ...(structure ? { basePriority: Number(rule.priority?.base ?? rule.label.collision.basePriority), metric: rule.priority?.metric }
          : { role: collision.role ?? rule.label.collision.role, basePriority: Number(collision.priority ?? rule.label.collision.basePriority), collisionGroup: collision.group ?? rule.label.collision.collisionGroup, hideWhenColliding: collision.allowHide !== false }),
      } } };
    }) },
  });

  // V1 static visual constants promoted into V3 styles.  The editor can now
  // modify these per range instead of silently falling back to a generic
  // colour or marker.
  const railwayLineStyle = styled({
    weight: 3,
    stroke: { mode: 'field', field: 'color', fallbackColor: '#111827' },
    strokeOpacity: 0.9,
  });
  const roadLineStyle = styled({
    weight: 3,
    stroke: { mode: 'field', field: 'color', fallbackColor: '#111827' },
    strokeOpacity: 0.35,
  });
  const transportPointStyle = (color: RenderStyle['fill']): RenderStyle => styled({
    pointShape: 'circle', size: 4, weight: 2,
    stroke: { mode: 'fixed', color: '#111827' }, strokeOpacity: 0.9,
    fill: color, fillOpacity: 0.85,
  });
  const poiPointStyle = (color: string): RenderStyle => styled({
    pointShape: 'circle', size: 4, weight: 2,
    stroke: { mode: 'fixed', color: '#111827' }, strokeOpacity: 0.9,
    fill: { mode: 'fixed', color }, fillOpacity: 0.85,
  });
  const pointCandidates = ['N', 'NE', 'NW', 'E', 'W', 'SE', 'SW', 'S'] as const;

  if (config.classCode === 'RLE' && geometry === 'LineString') {
    const lineVisibility = {
      mode: 'lineContainmentChoice' as const,
      lineContainmentChoice: { field: 'direction', primaryValue: '3', overlayValues: ['0', '1', '2', '4'], switchZoom: 8, precision: 1000 },
    };
    const rleBaseExtensions: RenderRuleExtensions = { ...clone(extensions), visibility: lineVisibility };
    const rleLineExtensions: RenderRuleExtensions = {
      ...rleBaseExtensions,
      lineLabel: {
        ...(extensions.lineLabel ?? { profile: 'strict-on-line' as const }),
        profile: 'strict-on-line', mode: 'strictOnLine', advancedTextEnabled: true,
        advancedTextBudgetGroup: 'network', cjkGlyphPathMode: 'auto', cjkGlyphCompactMode: 'auto',
        cjkGlyphFallbackMode: 'hide', cjkGlyphRotationPolicy: 'uprightWhenSteep', cjkGlyphUprightAngleThresholdDeg: 45,
        cjkGlyphAllowTextPathFallback: false, repositionMode: 'chainageSearch', repositionAttemptsPerDirection: 3,
        repositionStepMode: 'labelSpan', repositionFailure: 'hide', repositionStrictSvg: true,
        avoidLineGeometry: false, avoidPolygonGeometry: false, avoidPointSymbols: true,
        viewportRectMode: 'anchorNormalized', viewportCandidateMode: 'stableFirstViewportFallback',
        viewportCandidateBufferPx: 72, viewportCandidateMaxTargets: 1, viewportCandidateMinIntervalPx: 48,
        textPathFallback: 'rotatedLabel',
      },
    };
    const source = { source: 'Name', fallbackSources: ['ID', 'LineName', 'LineID'], placement: 'center' as const, withDot: false, offsetY: 0 };
    const pill = labeled({ ...source, visible: true, style: { family: 'rle-pill-color', size: 13, color: { mode: 'field', field: 'color', fallbackColor: '#2563eb' } }, collision: { role: 'important', basePriority: 8, collisionGroup: 'networkLabel', hideWhenColliding: true } });
    const text = labeled({ ...source, visible: true, style: { family: 'rle-line-color', size: 13, color: { mode: 'field', field: 'color', fallbackColor: '#2563eb' } }, collision: { role: 'important', basePriority: 12, collisionGroup: 'networkLabel', hideWhenColliding: true } });
    const noLabel = labeled({ visible: false });
    return profile([
      makeRule('v1-rle-dir3-geometry', 0, 4, { style: railwayLineStyle, label: noLabel, extensions: rleBaseExtensions, priority: { mode: 'replace', base: 4000 } }),
      makeRule('v1-rle-dir3-pill', 5, 7, { style: railwayLineStyle, label: noLabel, extensions: rleBaseExtensions, priority: { mode: 'replace', base: 4000 }, conditionalOverrides: [
        { id: 'direction-3-pill', when: [{ kind: 'fieldEquals', field: 'direction', value: '3' }], label: pill },
      ] }),
      makeRule('v1-rle-exclusive-high', 8, 8, { style: railwayLineStyle, label: noLabel, extensions: rleBaseExtensions, priority: { mode: 'replace', base: 4000 }, conditionalOverrides: [
        { id: 'direction-0-1-line', when: [{ kind: 'fieldIn', field: 'direction', values: ['0', '1'] }], label: text, extensions: rleLineExtensions },
        { id: 'direction-3-pill', when: [{ kind: 'fieldEquals', field: 'direction', value: '3' }], label: pill },
      ] }),
    ]);
  }

  if (config.classCode === 'ROD' && geometry === 'LineString') {
    const roadLabel = labeled({ visible: true, style: { family: 'gm-bw', size: 12 }, source: 'Name', placement: 'center', withDot: false, offsetY: 0, collision: { role: 'important', basePriority: 3600, collisionGroup: 'networkLabel', hideWhenColliding: true } });
    return profile([
      hidden('v1-road-hidden', 0, 5),
      makeRule('v1-road-low', 6, 6, { style: { ...roadLineStyle, strokeOpacity: 0.35 }, label: roadLabel, priority: { mode: 'replace', base: 3600 } }),
      makeRule('v1-road-high', 7, 8, { style: roadLineStyle, label: roadLabel, priority: { mode: 'replace', base: 3600 } }),
    ]);
  }

  if (config.classCode === 'PFB' && geometry === 'Polygon') {
    const platformStyle = styled({ weight: 0, stroke: { mode: 'relatedLine', strategy: 'featureRelation', fallbackColor: '#2563eb' }, strokeOpacity: 0.95, fill: { mode: 'relatedLine', strategy: 'featureRelation', fallbackColor: '#2563eb' }, fillOpacity: 0.22 });
    return profile(withVisibleRange('v1-platform-footprint', 5, 8, { representation: 'geometry', style: platformStyle, label: labeled({ visible: false }), priority: { mode: 'replace', base: 360 } }));
  }

  if ((config.classCode === 'BUD' || config.classCode === 'STB') && geometry === 'Polygon') {
    // V3 renders the low-Zoom structure marker as an ordinary authored point.
    // It no longer relies on a nearly invisible geometry plus a label-only dot.
    const lowPointStyle = styled({ pointShape: 'circle', size: 4.5, weight: 3, stroke: { mode: 'fixed', color: '#000000' }, strokeOpacity: 0.85, fill: { mode: 'fixed', color: '#ffffff' }, fillOpacity: 1, symbolOffsetPx: { x: 0, y: 3.7 }, symbolAnchor: 'label', symbolVisibility: 'withLabel' });
    const structureStyle = styled({ weight: 1, stroke: { mode: 'fixed', color: '#111827' }, strokeOpacity: 0.28, fill: { mode: 'fixed', color: '#9ca3af' }, fillOpacity: 0.08 });
    const lowLabel = labeled({ visible: true, style: { family: 'structure-label', size: 12 }, source: 'Name', placement: 'E', offsetX: 11, offsetY: 3.7, collision: { role: 'optional', basePriority: 2400, collisionGroup: 'structureLabel', hideWhenColliding: true } });
    const highLabel = labeled({ visible: true, style: { family: 'structure-label', size: 12 }, source: 'Name', placement: 'center', offsetY: 3, collision: { role: 'important', basePriority: 3600, collisionGroup: 'structureLabel', hideWhenColliding: true } });
    const lowExtensions: RenderRuleExtensions = { ...clone(extensions), anchor: { ...(extensions.anchor ?? {}), strategy: 'interior', candidates: ['C'] }, labelText: { ...(extensions.labelText ?? {}), maxChars: 10, abbreviationEnabled: true, suffix: '…' }, collision: { ...(extensions.collision ?? {}), paddingPx: 3, boundsAdjustment: { y: -3.7, width: 3 }, hidePolicy: 'abbreviateThenHide' }, density: { mode: 'override', gridSizePx: 104, maxLabelsPerGrid: 2, reduceOrder: ['abbreviateOptionalLabels', 'hideOptionalLabels'], preserveSelected: true, preserveRequired: true } };
    const highExtensions: RenderRuleExtensions = { ...clone(lowExtensions), anchor: { ...(lowExtensions.anchor ?? {}), candidates: ['C', 'N', 'S', 'E', 'W'] }, collision: { ...(lowExtensions.collision ?? {}), paddingPx: 4, boundsAdjustment: { y: -3 } }, density: { mode: 'override', gridSizePx: 104, maxLabelsPerGrid: 3, reduceOrder: ['abbreviateOptionalLabels', 'hideOptionalLabels'], preserveSelected: true, preserveRequired: true } };
    const areaMetric = { kind: 'area' as const, multiplier: 1, divisor: 10, rounding: 'floor' as const, min: 0, max: 999 };
    return profile([
      hidden('v1-structure-hidden', 0, 2),
      makeRule('v1-structure-low-point', 3, 5, { representation: 'point', style: lowPointStyle, label: lowLabel, extensions: lowExtensions, geometryStack: { zLevel: 360 }, priority: { mode: 'add', base: 2400, metric: areaMetric } }),
      makeRule('v1-structure-high-geometry', 6, 8, { representation: 'geometry', style: structureStyle, label: highLabel, extensions: highExtensions, geometryStack: { zLevel: 360 }, priority: { mode: 'add', base: 3600, metric: areaMetric } }),
    ]);
  }

  if (config.classCode === 'STA' && geometry === 'Point') {
    const stationStyle = transportPointStyle({ mode: 'relatedLine', strategy: 'stationFirstPlatform', fallbackColor: '#0ea5e9' });
    const stationLabel = labeled({ visible: true, style: { family: 'bubble-dark', size: 14 }, source: 'Name', placement: 'near', withDot: false, offsetY: 0, collision: { role: 'important', basePriority: 6000, collisionGroup: 'transportLabel', hideWhenColliding: true } });
    const stationExtensions: RenderRuleExtensions = { ...clone(extensions), pane: 'point-top', anchor: { ...(extensions.anchor ?? {}), strategy: 'featureCenter', candidates: [...pointCandidates] }, labelText: { ...(extensions.labelText ?? {}), maxChars: 6, abbreviationEnabled: true, suffix: '…' }, collision: { ...(extensions.collision ?? {}), paddingPx: 6, hidePolicy: 'abbreviateThenHide' } };
    return profile([
      hidden('v1-station-hidden', 0, 3),
      makeRule('v1-station-normal', 4, 7, { style: stationStyle, label: stationLabel, extensions: stationExtensions, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 6000 } }),
      makeRule('v1-station-platform-coincident', 8, 8, { style: stationStyle, label: stationLabel, extensions: { ...stationExtensions, visibility: { mode: 'coincidentPoint', coincidentPoint: { target: { class: 'PLF' }, behavior: 'showIfExists', targetField: 'Connect', targetNotEquals: 'false', precision: 1000 } } }, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 6000 } }),
    ]);
  }

  if (config.classCode === 'PLF' && geometry === 'Point') {
    const platformStyle = transportPointStyle({ mode: 'relatedLine', strategy: 'platformFirstLine', fallbackColor: '#0ea5e9' });
    const platformLabel = labeled({ visible: true, style: { family: 'bubble-dark', size: 14 }, source: 'Name', placement: 'near', withDot: true, dotAnchorMode: 'inline', offsetY: 10, collision: { role: 'important', basePriority: 6000, collisionGroup: 'transportLabel', hideWhenColliding: true } });
    const platformExtensions: RenderRuleExtensions = { ...clone(extensions), pane: 'point-top', anchor: { ...(extensions.anchor ?? {}), strategy: 'featureCenter', candidates: [...pointCandidates] }, labelText: { ...(extensions.labelText ?? {}), maxChars: 6, abbreviationEnabled: true, suffix: '…' }, collision: { ...(extensions.collision ?? {}), paddingPx: 6, hidePolicy: 'abbreviateThenHide' }, visibility: { mode: 'coincidentPoint', coincidentPoint: { target: { class: 'STA' }, behavior: 'hideIfExists', precision: 1000 } } };
    return profile([
      hidden('v1-platform-hidden', 0, 7),
      makeRule('v1-platform-high', 8, 8, { style: platformStyle, label: platformLabel, extensions: platformExtensions, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 6000 }, conditionalOverrides: [
        { id: 'connect-false-hidden', when: [{ kind: 'fieldEquals', field: 'Connect', value: 'false' }], representation: 'hidden', label: labeled({ visible: false }), priority: { mode: 'replace', base: 0 } },
      ] }),
    ]);
  }

  if ((config.classCode === 'FLR' || config.classCode === 'STF') && geometry === 'Polygon') {
    const bindingId = config.classCode === 'FLR' ? 'bud-floor-context' : 'station-building-floor-context';
    const floorStyle = styled({ weight: 2, stroke: { mode: 'relatedLine', strategy: 'featureRelation', fallbackColor: '#4b5563' }, strokeOpacity: 0.85, fill: { mode: 'relatedLine', strategy: 'featureRelation', fallbackColor: '#4b5563' }, fillOpacity: 0.28 });
    const floorLabel = labeled({ visible: true, style: { family: 'bubble-dark', size: 13 }, source: 'Name', fallbackSources: ['NofFloor'], fallbackValueFormats: { NofFloor: 'floorLabel' }, placement: 'center', withDot: true, dotAnchorMode: 'anchorRight', collision: { role: 'required', basePriority: 8000, collisionGroup: 'indoorLabel', hideWhenColliding: false } });
    const floorExtensions: RenderRuleExtensions = { ...clone(extensions), pane: 'overlay-top', anchor: { ...(extensions.anchor ?? {}), strategy: 'featureCenter', candidates: ['E'] }, labelText: { ...(extensions.labelText ?? {}), maxChars: 10, abbreviationEnabled: true, suffix: '…' }, collision: { ...(extensions.collision ?? {}), paddingPx: 0, hidePolicy: 'forceShow' }, density: { mode: 'override', gridSizePx: 1, maxLabelsPerGrid: 999, maxSymbolsPerGrid: 999, preserveSelected: true, preserveRequired: true }, visibility: { mode: 'activeContextMember', activeContextMember: { bindingId, requireSelector: true } } };
    return profile(withVisibleRange('v1-floor-member', 6, 8, { representation: 'geometry', style: floorStyle, label: floorLabel, extensions: floorExtensions, geometryStack: { zLevel: 360 }, priority: { mode: 'replace', base: 8000 } }));
  }

  if (config.classCode === 'SBP' && geometry === 'Point') {
    const iconStyle = styled({ icon: { source: 'iconUrl', size: [24, 24], anchor: [12, 24], fallback: 'circle' }, pointShape: 'circle', size: 5, weight: 2, stroke: { mode: 'fixed', color: '#3388ff' }, strokeOpacity: 0.9, fill: { mode: 'fixed', color: '#3388ff' }, fillOpacity: 0.6 });
    const iconExtensions: RenderRuleExtensions = { ...clone(extensions), pane: 'point-top', visibility: { mode: 'sameId', sameId: { target: { class: 'STB' }, sourceField: 'ID', targetField: 'ID', behavior: 'hideIfExists' } } };
    const iconLabel = labeled({ visible: true, style: { family: 'bubble-dark', size: 14 }, source: 'Name', placement: 'near', collision: { role: 'optional', basePriority: 2500, collisionGroup: 'poiLabel', hideWhenColliding: true } });
    return profile([
      makeRule('v1-station-building-icon', 0, 5, { style: iconStyle, label: labeled({ visible: false }), extensions: iconExtensions, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 2500 } }),
      makeRule('v1-station-building-icon-label', 6, 8, { style: iconStyle, label: iconLabel, extensions: iconExtensions, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 2500 } }),
    ]);
  }

  if (config.classCode === 'ISP' && geometry === 'Point') {
    const ispStyle = poiPointStyle('#f97316');
    const ispLabel = labeled({ visible: true, style: { family: 'bubble-dark', size: 14 }, source: 'Name', placement: 'near', withDot: false, collision: { role: 'optional', basePriority: 2500, collisionGroup: 'poiLabel', hideWhenColliding: true } });
    const ispExtensions: RenderRuleExtensions = { ...clone(extensions), pane: 'point-top', anchor: { ...(extensions.anchor ?? {}), strategy: 'featureCenter', candidates: [...pointCandidates] }, labelText: { ...(extensions.labelText ?? {}), maxChars: 10, abbreviationEnabled: true, suffix: '…' }, collision: { ...(extensions.collision ?? {}), paddingPx: 6, hidePolicy: 'abbreviateThenHide' } };
    return profile([
      makeRule('v1-generic-point-symbol', 0, 3, { representation: 'hidden', style: ispStyle, label: labeled({ visible: false }), extensions: ispExtensions, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 2500 } }),
      makeRule('v1-generic-point-label', 4, 8, { representation: 'labelOnly', style: ispStyle, label: ispLabel, extensions: ispExtensions, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 2500 } }),
    ]);
  }

  if (config.classCode === 'ISL' && geometry === 'LineString') {
    const isWaterway = path.kind === 'NGF' && path.skind === 'WTR' && (path.skind2 === 'RVR' || path.skind2 === 'CAN');
    const lineLabel = labeled({ visible: true, style: isWaterway ? { family: 'gm-wtb', size: 16 } : { family: 'gm-outline', size: 17 }, source: 'Name', placement: 'center', collision: { role: 'important', basePriority: 3800, collisionGroup: 'networkLabel', hideWhenColliding: true } });
    const lineStyle = styled({ weight: 1, stroke: { mode: 'fixed', color: '#111827' }, strokeOpacity: 0.85 });
    return profile([makeRule('v1-generic-line', 0, 8, { representation: 'labelOnly', style: lineStyle, label: lineLabel, geometryStack: { zLevel: 320 }, priority: { mode: 'replace', base: 3800 } })]);
  }

  if (config.classCode === 'ISG' && geometry === 'Polygon') {
    const key = `${path.kind ?? ''}/${path.skind ?? ''}/${path.skind2 ?? ''}`;
    const surfaceStyle = styled({ weight: 1, stroke: { mode: 'fixed', color: '#111827' }, strokeOpacity: 0.65, fill: { mode: 'fixed', color: '#60a5fa' }, fillOpacity: 0.1 });
    const labelStyle = (() => {
      if (key === 'NGF/LAD/CON') return { family: 'gm-bw' as const, size: 21 };
      if (key === 'NGF/LAD/ISD' || key === 'NGF/LAD/SBC') return { family: 'gm-bw' as const, size: 18 };
      if (key.startsWith('NGF/LAD/')) return { family: 'gm-bw' as const, size: 15 };
      if (key === 'NGF/WTB/SEA') return { family: 'gm-wtb' as const, size: 21 };
      if (key === 'NGF/WTB/LKE') return { family: 'gm-wtb' as const, size: 18 };
      if (key.startsWith('NGF/WTB/')) return { family: 'gm-wtb' as const, size: 15 };
      if (key.startsWith('NGF/LIS/')) return { family: 'gm-bw' as const, size: 15 };
      if (key.endsWith('/L1')) return { family: 'gm-bw' as const, size: 19 };
      if (key.endsWith('/L2')) return { family: 'gm-bw' as const, size: 17 };
      if (key.endsWith('/L3')) return { family: 'gm-bw' as const, size: 15 };
      if (key === 'ADM/PLZ/UP' || key === 'ADM/PLZ/UC') return { family: 'gm-bw' as const, size: 16 };
      return { family: 'gm-outline' as const, size: 17 };
    })();
    const surfaceLabel = labeled({ visible: true, style: labelStyle, source: 'Name', placement: 'center', collision: { role: 'important', basePriority: 5000, collisionGroup: 'surfaceLabel', hideWhenColliding: false } });
    const surfaceExtensions: RenderRuleExtensions = { ...clone(extensions), labelText: { ...(extensions.labelText ?? {}), maxChars: 10, abbreviationEnabled: true, suffix: '…' }, collision: { ...(extensions.collision ?? {}), paddingPx: 8, hidePolicy: 'forceShow' } };
    const shown = (id: string, min: number, max: number, extra: Partial<ZoomPriorityRule> = {}) => profile(withVisibleRange(id, min, max, { representation: 'labelOnly', style: surfaceStyle, label: surfaceLabel, extensions: surfaceExtensions, geometryStack: { zLevel: 300 }, priority: { mode: 'replace', base: 5000 }, ...extra }));
    if (key === 'NGF/LAD/CON') return shown('v1-isg-land-continent', 0, 4);
    if (key === 'NGF/LAD/PEN' || key === 'NGF/LAD/ISD' || key === 'NGF/LAD/IST') return shown('v1-isg-land-medium', 3, 8);
    if (key.startsWith('NGF/LAD/')) return shown('v1-isg-land-detail', 5, 8);
    if (key === 'NGF/WTB/SEA') return shown('v1-isg-water-sea', 0, 3);
    if (key.startsWith('NGF/WTB/')) return shown('v1-isg-water-detail', 5, 8);
    if (key.startsWith('NGF/LIS/')) return shown('v1-isg-landform', 5, 8, { style: { ...surfaceStyle, weight: 0, strokeOpacity: 0, fillOpacity: 0 } });
    if (key === 'ADM/DBZ/L1' || key === 'ADM/PLZ/L1') return shown('v1-isg-admin-l1', 4, 4);
    if (key === 'ADM/DBZ/L2' || key === 'ADM/PLZ/L2') return shown('v1-isg-admin-l2', 6, 6);
    if (key === 'ADM/DBZ/L3' || key === 'ADM/PLZ/L3') return shown('v1-isg-admin-l3', 8, 8);
    if (key === 'ADM/PLZ/UP' || key === 'ADM/PLZ/UC') return profile([hidden('v1-isg-admin-hidden', 0, 8)]);
    if (key.startsWith('ADM/DBZ/') || key.startsWith('ADM/PLZ/')) return profile([hidden('v1-isg-admin-unclassified', 0, 8)]);
    return shown('v1-generic-surface', 2, 8);
  }

  if ((config.classCode === 'TRP' || config.classCode === 'TPP' || config.classCode === 'WRP') && geometry === 'Point') {
    const pointColor = config.classCode === 'TRP' ? '#22c55e' : '#f97316';
    const pointLabel = labeled({ visible: true, style: { family: 'bubble-dark', size: 14 }, source: 'Name', placement: 'near', collision: { role: 'optional', basePriority: 2500, collisionGroup: 'poiLabel', hideWhenColliding: true } });
    const pointExtensions: RenderRuleExtensions = { ...clone(extensions), pane: 'point-top', anchor: { ...(extensions.anchor ?? {}), strategy: 'featureCenter', candidates: [...pointCandidates] }, labelText: { ...(extensions.labelText ?? {}), maxChars: 6, abbreviationEnabled: true, suffix: '…' }, collision: { ...(extensions.collision ?? {}), paddingPx: 6, hidePolicy: 'abbreviateThenHide' } };
    return profile(withVisibleRange(`v1-${config.classCode.toLowerCase()}-point`, 5, 8, { style: poiPointStyle(pointColor), label: pointLabel, extensions: pointExtensions, geometryStack: { zLevel: 420 }, priority: { mode: 'replace', base: 2500 } }));
  }

  return profile([makeRule('v1-render-1', 0, 8, { representation, label })]);
}

function fieldsFor(config: CairnMapClassConfig): FieldDefinition[] {
  const declared: FieldDefinition[] = config.fields.filter((field) => !RESERVED.has(field.key)).map((field): FieldDefinition => ({
    fieldId: `${config.classCode}-${field.key}`,
    key: field.key,
    type: fieldType(field.type),
    cardinality: 'single',
    input: inputType(field),
    required: field.required,
    ...(field.key === 'hub' && ['TPP','WRP'].includes(config.classCode) ? { emptyValue: 'preserve' as const } : {}),
    // V1 required flags constrain new workflow output but do not retroactively
    // declare the already mounted formal data invalid.
    validateExistingData: false,
    labels: localized(field.label, field.key),
    description: { zh: field.notes ?? '', en: '' },
    ...(field.options?.length ? { options: field.options.map((option) => ({ value: String(option.value), label: localized((option as unknown as Record<string, unknown>).label ?? (option as unknown as Record<string, unknown>).name ?? String(option.value), String(option.value)) })) } : field.type === 'select' ? { optionSource: { registryKey: `v1-field-options:${config.classCode}:${field.key}`, runtimeField: field.sourceRuntimeField } } : {}),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.defaultValue !== undefined ? { defaultValue: clone(field.defaultValue) } : {}),
    ...(field.sourceRuntimeField ? { sourceRuntimeField: field.sourceRuntimeField } : {}),
    ...(field.scenes ? { scenes: clone(field.scenes) } : {}),
    ...(field.ref ? { reference: clone(field.ref) } : {}),
  }));
  // The V1 registry contains a few card-only / grouped values which are read
  // directly from records but are not repeated in the class field manifest.
  // Promote those values to real V3 fields instead of letting a card silently
  // reference an invisible, non-editable path.
  const known = new Set(declared.map((field) => field.key));
  const supplemental: FieldDefinition[] = [];
  // Runtime aliases are real V1 inputs even when an older class manifest did
  // not repeat them.  Expose them as selectable V3 fields so migrated label,
  // colour and icon rules can be inspected and edited without a hidden name.
  const runtimeAliases: Record<string, string[]> = {
    RLE: ['LineName', 'LineID'],
    ROD: ['color'],
    SBP: ['iconUrl'],
    STA: ['platforms'],
    PLF: ['lines'],
    FLR: ['FloorID'],
    TPP: ['TGTcoordinate.x', 'TGTcoordinate.y', 'TGTcoordinate.z'],
  };
  for (const key of runtimeAliases[config.classCode] ?? []) {
    if (known.has(key)) continue;
    known.add(key);
    supplemental.push({
      fieldId: `${config.classCode}-runtime-${key}`,
      key,
      ...(key === 'TGTcoordinate.x' || key === 'TGTcoordinate.z' ? { requiredWhen: [{ kind: 'fieldPresent' as const, field: 'TGTWarp', present: false }] } : {}),
      type: key.startsWith('TGTcoordinate.') ? 'number' : key === 'platforms' || key === 'lines' ? 'json' : 'string',
      cardinality: 'single',
      input: key === 'platforms' || key === 'lines' ? 'json' : 'text',
      validateExistingData: false,
      labels: { zh: key, en: '' },
      description: { zh: '由 V1 运行时显示逻辑迁移的可编辑字段。', en: '' },
    });
  }
  for (const schema of WORKFLOW_EDITOR_SCHEMAS.filter((item) => item.match.classCode === config.classCode)) {
    const projected = projectRegistryScene(schema, 'infocard');
    const entries = [projected.idField, ...projected.fields, ...projected.groups] as Array<{ key?: string; path?: string; label?: string; formatter?: string }>;
    for (const entry of entries) {
      const rawKey = String(entry.path ?? entry.key ?? '').trim();
      // Preserve the whole path. In particular `tags.foo` and
      // `extensions.foo` are members of optional groups, not fake top-level
      // string fields. Structured root paths stay independently addressable.
      const key = rawKey;
      const scope = rawKey.startsWith('tags.') ? 'tags' as const : rawKey.startsWith('extensions.') ? 'extensions' as const : 'root' as const;
      if (!key || key === 'tags' || key === 'extensions' || RESERVED.has(key) || known.has(key)) continue;
      known.add(key);
      supplemental.push({
        fieldId: `${config.classCode}-registry-${key}`,
        key,
        ...(scope !== 'root' ? { scope } : {}),
        type: entry.formatter === 'json' ? 'json' : 'string',
        cardinality: 'single',
        input: entry.formatter === 'json' ? 'json' : 'text',
        validateExistingData: false,
        labels: { zh: entry.label ?? key, en: '' },
        description: { zh: '由 V1 信息卡注册表迁移的可编辑字段。', en: '' },
      });
    }
  }
  return [...declared, ...supplemental];
}

function schemaForPath(path: ClassificationPath) {
  return WORKFLOW_EDITOR_SCHEMAS
    .filter((schema) => schema.match.classCode === path.class
      && (!schema.match.kind || schema.match.kind === path.kind)
      && (!schema.match.skind || schema.match.skind === path.skind)
      && (!schema.match.skind2 || schema.match.skind2 === path.skind2))
    .sort((left, right) => Number(Boolean(right.match.skind2)) - Number(Boolean(left.match.skind2))
      || Number(Boolean(right.match.skind)) - Number(Boolean(left.match.skind))
      || Number(Boolean(right.match.kind)) - Number(Boolean(left.match.kind)))[0];
}

type LegacyCardField = {
  key: string;
  path: string;
  label: string;
  control?: string;
  searchConfigKey?: string;
  section?: 'main' | 'other';
  formatter?: 'plain' | 'externalLink' | 'boolText' | 'json';
  hideWhenEmpty?: boolean;
};

function cardItemFromLegacyField(config: CairnMapClassConfig, schemaKey: string, field: LegacyCardField, index: number): CardItem {
  // A reference/search input does not make a V1 plain card value clickable.
  const relation = undefined;
  const isRailColor = config.classCode === 'RLE' && /^(?:color|Color)$/.test(field.path);
  const options = field.formatter === 'externalLink' ? { format: 'externalLink' as const, linkText: 'href' as const }
    : field.formatter === 'boolText' ? { format: 'boolean' as const }
      : field.formatter === 'json' ? { format: 'json' as const }
        : undefined;
  return {
    id: `${schemaKey}-card-${field.key}-${index}`,
    source: field.path,
    visible: true,
    section: field.section ?? 'main',
    hideWhenEmpty: field.hideWhenEmpty !== false,
    renderer: isRailColor ? 'colorCapsule' : relation ? 'relationLink' : 'text',
    label: { zh: field.label, en: '' },
    ...(isRailColor ? { options: { ...options, colorSource: field.path, fallbackColor: '#999999' } } : options ? { options } : {}),
    ...(relation ? { relation } : {}),
  };
}

function supplementalLegacyCardItems(config: CairnMapClassConfig): CardItem[] {
  const lineChipSource = config.classCode === 'PLF' ? 'platform'
    : config.classCode === 'STA' ? 'station'
      : config.classCode === 'STB' || config.classCode === 'SBP' ? 'stationBuilding'
        : undefined;
  if (!lineChipSource) return [];
  return [{
    id: `${config.classCode.toLowerCase()}-card-line-chips`,
    source: 'ID',
    visible: true,
    section: 'main',
    hideWhenEmpty: false,
    renderer: 'lineChips',
    label: { zh: '包含线路', en: 'Lines' },
    options: { lineChipSource },
  }];
}

function cardFor(config: CairnMapClassConfig, path: ClassificationPath = { class: config.classCode }): CardConfiguration {
  // TRP is intentionally the sole retained specialised information card.
  if (config.classCode === 'TRP') return { mode: 'component', componentKey: 'TRP' };
  const schema = schemaForPath(path);
  const projected = schema ? projectRegistryScene(schema, 'infocard') : undefined;
  const schemaItems: CardItem[] = projected
    ? [projected.idField, ...projected.fields]
      .filter((field) => field.path && field.key !== 'ID')
      .map((field, index) => cardItemFromLegacyField(config, schema.schemaKey, field, index))
    : [];
  const groupItems: CardItem[] = projected?.groups.map((group, index) => cardItemFromLegacyField(config, schema?.schemaKey ?? config.classCode, group, index)) ?? [];
  const supplemental = supplementalLegacyCardItems(config);
  const defaults = [...schemaItems, ...groupItems];
  const items: CardItem[] = [];
  const used = new Set<string>();
  const append = (item: CardItem) => { if (!used.has(item.source)) { items.push(item); used.add(item.source); } };
  const layout = resolveCardRegistryLayout({ schemaKey: schema?.schemaKey, classCode: path.class, kind: path.kind, skind: path.skind, skind2: path.skind2 });
  for (const item of layout?.items ?? [{ kind: 'classification' }, { kind: 'registryDefaultGroup' }]) {
    if (item.kind === 'classification' && schema && !item.hidden) append({ id: `${config.classCode}-classification-card`, source: 'Class', visible: true, renderer: 'text', section: 'main', label: { zh: item.label ?? projected?.classification?.label ?? '类型', en: '' }, options: { format: 'classification' } });
    if (item.kind === 'registryDefaultGroup') defaults.forEach(append);
    if ((item.kind === 'rawField' || item.kind === 'registryField') && !item.hidden) {
      const source = item.path ?? (item.kind === 'registryField' ? defaults.find(field => field.id.includes(`-${item.key}-`))?.source : undefined);
      if (!source) continue;
      const field = defaults.find(field => field.source === source) ?? { id: `${config.classCode}-${source}-raw`, source, visible: true, renderer: 'text' as const, section: 'main' as const, label: { zh: item.kind === 'rawField' ? item.label : item.label ?? source, en: '' } };
      const target = item.linkTarget;
      if (item.transform === 'featureLink' || item.transform === 'featureLinkList') append({ ...field, section: 'main', renderer: 'relationLink', relation: { targetClassification: { class: target?.classCode ?? '', ...(target?.kind ? { kind: target.kind } : {}), ...(target?.skind ? { skind: target.skind } : {}), ...(target?.skind2 ? { skind2: target.skind2 } : {}) }, targetMatchField: target?.matchField ?? 'ID', targetDisplayField: target?.displayField ?? 'Name', multiple: item.transform === 'featureLinkList', sourceValuePath: target?.sourceValuePath, fallbackDisplay: target?.fallbackDisplay, clickable: true } });
      else append({ ...field, section: 'main', options: item.transform === 'externalLink' ? { format: 'externalLink', linkText: 'href' } : field.options });
    }
    if (item.kind === 'enhancement') {
      if (item.key === 'railColorChip') {
        const color = defaults.find(field => field.source === 'color'); if (color) append({ ...color, label: { zh: '色号', en: '' } });
      } else {
        if (item.key === 'stationBuildingLineChips') append({ id: `${config.classCode}-height-enhancement`, source: 'height', fallbackSources: ['Height'], visible: true, renderer: 'text', section: 'main', label: { zh: '高度', en: '' }, options: { format: 'plain' } });
        supplemental.forEach(append);
      }
    }
  }
  // Registry other rows precede unlisted values, followed by editable audit rows.
  defaults.filter(item => item.section === 'other').forEach(append);
  const audit = [
    { source: 'CreateTime', fallbackSources: ['createTime'], label: '创建时间' },
    { source: 'CreateBy', fallbackSources: ['createBy'], label: '创建者' },
    { source: 'ModifityTime', fallbackSources: ['ModifyTime','ModifiedTime','modifityTime','modifyTime','modifiedTime'], label: '最后编辑时间' },
    { source: 'ModifityBy', fallbackSources: ['ModifyBy','ModifiedBy','modifityBy','modifyBy','modifiedBy'], label: '编辑者' },
  ].map(field => ({ ...field, id: `${config.classCode}-${field.source}-meta`, label: { zh: field.label, en: '' }, visible: true, hideWhenEmpty: true, afterRemaining: true, renderer: 'text' as const, section: 'other' as const }));
  return { mode: 'fields', items: [...items, ...audit], remaining: { enabled: true, section: 'other', includeSystem: true, order: 'record', hideWhenEmpty: false, maxDepth: 3, maxArrayLength: 50, exclude: ['CoordP','CoordL','CoordG','Conpoints','Flrpoints','PLpoints','Linepoints','coordinate','UpdateTime','updateTime','UpdateBy','updateBy', ...(schema ? ['Class','Kind','Skind','Skind2','SKind','SKind2'] : []), ...defaults.map(item => item.source)] } };
}

function categoryId(path: ClassificationPath): string {
  return [path.class, path.kind, path.skind, path.skind2].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function parentPath(path: ClassificationPath): ClassificationPath | null {
  if (path.skind2) return { class: path.class, kind: path.kind, skind: path.skind };
  if (path.skind) return { class: path.class, kind: path.kind };
  if (path.kind) return { class: path.class };
  return null;
}

function nodesFor(config: CairnMapClassConfig): CategoryNode[] {
  const rawCard = record(config.card);
  const displayRules = config.display?.rules ?? [];
  const paths = new Map<string, ClassificationPath>();
  const addPath = (path: ClassificationPath) => {
    const key = JSON.stringify(path);
    if (paths.has(key)) return;
    paths.set(key, path);
    const parent = parentPath(path);
    if (parent) addPath(parent);
  };
  addPath({ class: config.classCode });
  for (const option of config.classification?.options ?? []) addPath({ class: config.classCode, ...(option.kind ? { kind: option.kind } : {}), ...(option.skind ? { skind: option.skind } : {}), ...(option.skind2 ? { skind2: option.skind2 } : {}) });
  const rootKey = JSON.stringify({ class: config.classCode });
  const labelsForPath = (path: ClassificationPath): NonNullable<CategoryNode['classificationLabels']> => {
    const labels: NonNullable<CategoryNode['classificationLabels']> = { class: localized(config.label, config.classCode) };
    const levels: Array<keyof ClassificationPath> = ['kind', 'skind', 'skind2'];
    for (const level of levels) {
      const code = path[level];
      if (!code) continue;
      const levelIndex = levels.indexOf(level);
      const option = (config.classification?.options ?? []).find((candidate) => {
        const candidatePath: ClassificationPath = { class: config.classCode, ...(candidate.kind ? { kind: candidate.kind } : {}), ...(candidate.skind ? { skind: candidate.skind } : {}), ...(candidate.skind2 ? { skind2: candidate.skind2 } : {}) };
        return levels.slice(0, levelIndex + 1).every((part) => candidatePath[part] === path[part])
          && levels.slice(levelIndex + 1).every((part) => !candidatePath[part]);
      }) ?? (config.classification?.options ?? []).find((candidate) => {
        const candidateValue = level === 'kind' ? candidate.kind : level === 'skind' ? candidate.skind : candidate.skind2;
        return candidateValue === code && candidate.kind === path.kind;
      });
      labels[level] = option ? localized(option.label, String(code)) : { zh: String(code), en: '' };
    }
    const schema = schemaForPath(path);
    const view = schema ? projectRegistryScene(schema, 'infocard') : undefined;
    if (schema) {
      const level = path.skind2 ? 'skind2' : path.skind ? 'skind' : path.kind ? 'kind' : 'class';
      const display = view?.classification ? resolveClassificationDisplayName(view.classification.ref, { Kind: path.kind, SKind: path.skind, SKind2: path.skind2 }) : schema.displayName;
      if (display) labels[level] = { zh: display, en: labels[level]?.en ?? '' };
    }
    return labels;
  };
  const sorted = [...paths.entries()].sort((a, b) => JSON.stringify(a[1]).split(',').length - JSON.stringify(b[1]).split(',').length);
  return sorted.map(([key, path]) => {
    const isRoot = key === rootKey;
    const id = `class-${categoryId(path)}`;
    const childIds = sorted.filter(([, candidate]) => JSON.stringify(parentPath(candidate) ?? {}) === key).map(([, candidate]) => `class-${categoryId(candidate)}`);
    return {
      nodeId: id,
      path,
      classificationLabels: labelsForPath(path),
      children: childIds,
      inheritDown: { fields: true, display: true, card: true },
      policies: { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' },
      fields: isRoot ? fieldsFor(config) : [],
      ...(isRoot ? { geometryType: config.geometry.type as GeometryKind } : {}),
      // Every classification prefix receives an explicit profile generated
      // from its real V1 branch.  Leaf profiles therefore override the root
      // for ISG/ISL instead of falling back to a hidden class callback.
      geometryProfiles: { [config.geometry.type]: geometryProfile(config, path) },
      // Root supplies generic inherited fields; an exact V1 schema on a child
      // becomes a local, editable V3 card instead of a hidden layout ID.
      ...((isRoot || schemaForPath(path)) ? { card: cardFor(config, path), legacy: {
        classCode: config.classCode,
        displayRuleIds: displayRules.map((rule) => rule.id),
        ...(typeof rawCard.layoutId === 'string' ? { cardLayoutId: rawCard.layoutId } : {}),
        ...(typeof rawCard.specialCardKey === 'string' ? { specialCardKey: rawCard.specialCardKey } : {}),
        source: clone(config) as unknown as Record<string, unknown>,
      } } : {}),
    } as CategoryNode;
  });
}

function blockControl(block: CairnMapWorkflowBlock, index: number): WorkflowControl {
  const raw = record(block);
  const first = (value: unknown): string | undefined => Array.isArray(value) && value[0] !== undefined ? String(value[0]) : undefined;
  const type = String(raw.type ?? 'text');
  // Generic V1 workflow blocks become editable standard form controls.  Their
  // original executor payload stays under legacyBlock for exact audit/parity.
  const kind: WorkflowControl['kind'] = type === 'featureSearch' || type === 'relationSearch' || /coarse|rough/i.test(type) ? 'featureSearch' : type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : type === 'number' ? 'number' : 'text';
  const target: ClassificationPath = {
    class: String(raw.classCode ?? (Array.isArray(raw.targetClassScope) ? raw.targetClassScope[0] : '') ?? ''),
    ...(first(raw.kindScope) ? { kind: first(raw.kindScope) } : {}),
    ...(first(raw.skindScope) ? { skind: first(raw.skindScope) } : {}),
    ...(first(raw.skind2Scope) ? { skind2: first(raw.skind2Scope) } : {}),
  };
  const search = kind === 'featureSearch' ? {
    target,
    queryFields: Array.isArray(raw.searchFields) ? raw.searchFields.map(String) : ['ID', 'Name'],
    displayTemplate: raw.displayField ? `{{${String(raw.displayField)}}}` : '{{ID}} ({{Name}})',
    returnField: raw.returnField ? String(raw.returnField) : 'ID',
    matcher: 'contains' as const,
    minQueryLength: 1,
    maxResults: 30,
    cacheScope: 'world' as const,
    debounceMs: 180,
  } : undefined;
  return {
    id: String(raw.id ?? `legacy-block-${index}`),
    slot: String.fromCharCode(65 + (index % 26)),
    kind,
    columns: 1,
    label: { zh: String(raw.title ?? raw.id ?? '输入项'), en: '' },
    ...(search ? { search } : {}),
    legacyBlock: raw,
  };
}

function externalReason(workflow: CairnMapWorkflowConfig): NonNullable<WorkflowDefinition['external']>['reason'] | null {
  const key = String(workflow.componentKey ?? '');
  if (key === 'railwayWorkflow') return 'railway-integrated';
  if (key === 'stationWorkflow') return 'station-integrated';
  if (key === 'tradePointWorkflow' || workflow.targetClass === 'TRP') return 'trp-integrated';
  return null;
}

function workflowFor(workflow: CairnMapWorkflowConfig, targetHasChildren: boolean): WorkflowDefinition {
  const geometry = workflow.targetGeometry === 'LineString' || workflow.targetGeometry === 'Polygon' ? workflow.targetGeometry : 'Point';
  const pages = workflow.pages ?? [];
  const forms: WorkflowStep[] = pages.filter((page) => !page.drawing).map((page, pageIndex) => ({
    id: page.id || `form-${pageIndex}`,
    kind: 'form' as const,
    label: { zh: page.title ?? `信息填写 ${pageIndex + 1}`, en: '' },
    controls: page.blocks.map(blockControl),
    legacyPage: clone(page) as unknown as Record<string, unknown>,
  }));
  const target: ClassificationPath = { class: workflow.targetClass };
  const outputId = `${workflow.id}-output-1`;
  if (!forms[0]) forms.push({ id: 'legacy-empty-form', kind: 'form', label: { zh: '基本信息', en: '' }, controls: [], legacyPage: record(workflow) });
  const firstForm = forms[0];
  if (firstForm && targetHasChildren) firstForm.controls?.unshift({ id: 'system-classification', kind: 'classificationPicker', columns: 1, label: { zh: '分类 1', en: '' }, classificationScope: target, outputId, required: true, systemManaged: true });
  const outputEntries = [...(workflow.output?.fieldMappings ?? []), ...(workflow.output?.computedFields ?? []), ...(workflow.output?.tagMappings ?? []), ...(workflow.output?.extensionMappings ?? []), ...(workflow.output?.idAssembly ?? [])];
  const assignments = outputEntries.map((item, index) => {
    const entry = record(item);
    return { id: `legacy-assignment-${index}`, target: String(entry.to ?? entry.outputPath ?? entry.target ?? 'ID'), expression: String(entry.expression ?? entry.from ?? entry.value ?? '') };
  }).filter((item) => item.expression);
  return {
    id: workflow.id,
    label: { zh: workflow.label ?? workflow.id, en: '' },
    mode: 'composed',
    target,
    steps: [
      { id: 'actor', kind: 'actor', label: { zh: '填写人', en: 'Author' } },
      ...forms,
      { id: 'tail', kind: 'tagsExtensions', label: { zh: '标签与扩展', en: 'Tags and extensions' }, tagsExtensions: { tagsEnabled: true, extensionsEnabled: true } },
      { id: 'geometry', kind: 'geometry', outputId, geometry: [geometry], label: { zh: '绘制', en: 'Geometry' } },
    ],
    outputs: [{ id: outputId, classification: target, assignments, geometry: { selected: geometry } }],
    legacy: { runtimeMode: workflow.runtimeMode, componentKey: workflow.componentKey, output: record(workflow.output), source: clone(workflow) as unknown as Record<string, unknown> },
  };
}

function schemaControlKind(control: string | undefined): WorkflowControl['kind'] {
  if (control === 'textarea') return 'textarea';
  if (control === 'number') return 'number';
  if (control === 'bool') return 'toggle';
  if (control === 'select') return 'select';
  if (control === 'json') return 'json';
  if (control === 'featureSearch') return 'featureSearch';
  return 'text';
}

function schemaGroupFieldKind(control: string | undefined): WorkflowGroupField['kind'] {
  const kind = schemaControlKind(control);
  return kind === 'textarea' || kind === 'number' || kind === 'toggle' || kind === 'select'
    || kind === 'json' || kind === 'featureSearch' || kind === 'coarseSearch'
    ? kind
    : 'text';
}

function schemaSearch(target: ClassificationPath, _coarse = false, searchConfigKey?: string): NonNullable<WorkflowControl['search']> {
  // The registry key is V1's actual search intent.  Keeping it as a typed
  // scope prevents a BUD form's "所属地理单元" search from accidentally
  // searching BUD records just because BUD is the output classification.
  const scopedTarget: ClassificationPath = searchConfigKey === 'landUnit'
    ? { class: 'ISG', kind: 'NGF' }
    : searchConfigKey === 'admAny'
      ? { class: 'ISG', kind: 'ADM' }
      : searchConfigKey === 'building'
        ? { class: 'BUD' }
        : /road|connectl|connect/i.test(String(searchConfigKey ?? ''))
          ? { class: 'ROD' }
        : searchConfigKey === 'warpPoint'
          ? { class: 'WRP' }
          : target;
  return {
    target: scopedTarget,
    queryFields: ['ID', 'Name'],
    displayTemplate: '{{ID}} ({{Name}})',
    returnField: 'ID',
    matcher: 'contains',
    minQueryLength: 1,
    maxResults: 30,
    debounceMs: 180,
    cacheScope: 'world',
  };
}

/** V1 uses a world letter in generated IDs while persisted World keeps its
 * normal world identifier.  The native V3 evaluator exposes WorldPrefix as a
 * system token and uses this small, declarative join form to omit blank
 * optional segments without bringing arbitrary JS into packages. */
function v1DefaultIdExpression(schemaKey: string, classCode: string, slots: ReadonlyMap<string, string>): string | undefined {
  const abbr = slots.get('abbr');
  if (!abbr) return undefined;
  const catAbbr = slots.get('catAbbr');
  if (classCode === 'BUD' || classCode === 'FLR' || classCode === 'ROD') return catAbbr ? `join("_",WorldPrefix+Class,${catAbbr},${abbr})` : `join("_",WorldPrefix+Class,${abbr})`;
  if (classCode === 'ISG' || classCode === 'ISL' || classCode === 'ISP') return `join("_",WorldPrefix+Kind+Skind+Skind2,${abbr})`;
  if (classCode === 'TPP' || classCode === 'WRP') return `join("_",WorldPrefix+Class+Kind+Skind,${abbr})`;
  // Retain an explicit fallback for future standard registry entries.  The
  // schema key is deliberately accepted so a future audit can require a
  // specific formula instead of silently falling back to raw V1 code.
  void schemaKey;
  return undefined;
}

/** Standard V1 registry schemas become complete, editable V3 form flows.
 * Railway/station and TRP are excluded intentionally: each remains exactly
 * one external completed workflow, rather than a long list of aliases. */
function workflowsFromSchemas(classes: CairnMapClassConfig[]): WorkflowDefinition[] {
  const externalClasses = new Set(['RLE', 'STA', 'PLF', 'PFB', 'STB', 'SBP', 'STF', 'TRP']);
  return WORKFLOW_EDITOR_SCHEMAS.flatMap((schema) => {
    const classCode = String(schema.match.classCode ?? '').trim();
    if (!classCode || externalClasses.has(classCode)) return [];
    const target: ClassificationPath = {
      class: classCode,
      ...(schema.match.kind ? { kind: schema.match.kind } : {}),
      ...(schema.match.skind ? { skind: schema.match.skind } : {}),
      ...(schema.match.skind2 ? { skind2: schema.match.skind2 } : {}),
    };
    const projected = projectRegistryScene(schema, 'workflow');
    const classConfig = classes.find((candidate) => candidate.classCode === classCode);
    const controls: WorkflowControl[] = [];
    const slotsByFieldKey = new Map<string, string>();
    let slotIndex = 0;
    const nextSlot = () => String.fromCharCode(65 + slotIndex++);
    if (projected.classification) controls.push({
      id: `${schema.schemaKey}-classification`,
      kind: 'classificationPicker',
      columns: 1,
      label: { zh: projected.classification.label, en: '' },
      classificationScope: target,
      outputId: `${schema.schemaKey}-output-1`,
      required: true,
      systemManaged: true,
    });
    const classFieldFor = (field: { key: string; path: string }) => classConfig?.fields.find((candidate) => candidate.key === field.key || candidate.key === field.path);
    const isRequired = (field: { key: string; path: string; label: string }) => {
      const configured = classFieldFor(field);
      // Some V1 component-only fields (notably `abbr`) are not present in a
      // class manifest.  Their visible V1 label is still explicit about the
      // requirement, so retain that requirement rather than losing it.
      return Boolean(configured?.required) || /必选|必须/.test(field.label);
    };
    const projectField = (field: { key: string; path: string; label: string; control?: string; placeholder?: string; selectSource?: string; searchConfigKey?: string; rows?: number }, options: { persist?: boolean; required?: boolean; defaultValue?: unknown; staticOptions?: string[] } = {}) => {
      const kind = schemaControlKind(field.control);
      const slot = nextSlot();
      slotsByFieldKey.set(field.key, slot);
      const configured = classFieldFor(field);
      controls.push({
        id: `${schema.schemaKey}-${field.key}-${slot}`,
        slot,
        kind,
        valueNormalization: options.persist === false ? 'abbr' : kind === 'number' ? 'number' : kind === 'text' || kind === 'textarea' || kind === 'featureSearch' ? 'trim' : 'none',
        columns: 1,
        label: { zh: field.label, en: '' },
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        ...(field.rows ? { rows: field.rows } : {}),
        ...(options.staticOptions?.length ? { options: options.staticOptions.map((value) => ({ value, label: { zh: value, en: '' } })) } : configured?.options?.length ? { options: configured.options.map((item) => ({ value: String(item.value), label: localized(item.label, String(item.value)) })) } : {}),
        ...(field.selectSource ? { optionSource: { registryKey: field.selectSource } } : {}),
        ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : configured?.defaultValue !== undefined ? { defaultValue: clone(configured.defaultValue) } : {}),
        ...(options.required ?? isRequired(field) ? { required: true } : {}),
        ...(kind === 'featureSearch' ? { search: schemaSearch(target, Boolean(field.searchConfigKey?.toLowerCase().includes('coarse')), field.searchConfigKey) } : {}),
      });
      return options.persist === false ? undefined : { id: `${schema.schemaKey}-assignment-${field.key}-${slot}`, target: field.path, expression: slot };
    };
    const assignments: import('./types').WorkflowAssignment[] = [
      ...(schema.idField.workflow?.visible ? [projectField(projected.idField)] : []),
      ...projected.fields.map((field) => projectField(field)),
      // ID-only inputs must remain available to expressions but must never
      // leak into persisted extensions as a migration artefact.
      ...projected.auxInputs.map((input) => projectField({ key: input.key, path: `extensions.workflow.${input.key}`, label: input.label, control: input.control, placeholder: input.placeholder }, { persist: !input.idAssemblyOnly, required: input.key === 'abbr' })),
      ...projected.groups.map((group) => {
        const slot = nextSlot();
        controls.push({
          id: `${schema.schemaKey}-${group.key}-${slot}`,
          slot,
          kind: 'group',
          columns: 1,
          label: { zh: group.label, en: '' },
          group: {
            optional: group.optional,
            minItems: group.minItems,
            addLabel: { zh: `添加${group.label}`, en: '' },
            itemFields: group.fields.map((item) => ({
              key: item.key,
              label: { zh: item.labels.workflow ?? item.labels.default, en: '' },
              kind: item.searchConfigKey || (classCode === 'ROD' && item.key === 'tgt') ? 'featureSearch' : schemaGroupFieldKind(item.control),
              ...(item.optional ? {} : { required: true }),
              ...(item.options?.length ? { options: item.options.map((option) => ({ value: String(option.value), label: localized(option.label, String(option.value)) })) } : {}),
              ...(item.placeholder ? { placeholder: item.placeholder } : {}),
              ...(item.defaultValue !== undefined ? { defaultValue: clone(item.defaultValue) } : {}),
              ...(item.rows ? { rows: item.rows } : {}),
              ...(item.searchConfigKey || (classCode === 'ROD' && item.key === 'tgt') ? { search: schemaSearch(target, false, item.searchConfigKey ?? 'road') } : {}),
            })),
          },
        });
        return { id: `${schema.schemaKey}-assignment-${group.key}-${slot}`, target: group.path, expression: slot };
      }),
      ...(v1DefaultIdExpression(schema.schemaKey, classCode, slotsByFieldKey) ? [{ id: `${schema.schemaKey}-assignment-id`, target: 'ID', expression: v1DefaultIdExpression(schema.schemaKey, classCode, slotsByFieldKey)! }] : []),
    ].filter((assignment): assignment is { id: string; target: string; expression: string } => Boolean(assignment));
    const geometry = schema.classification?.ref?.geom === '线' ? 'LineString' as const
      : schema.classification?.ref?.geom === '面' ? 'Polygon' as const : 'Point' as const;
    const outputId = `${schema.schemaKey}-output-1`;
    const drawing: NonNullable<WorkflowStep['drawing']> = { enabledFromThisPage: true, keepDrawingWhenBack: true };
    const drawingControls: WorkflowControl[] = [];
    if (classCode === 'TPP' || classCode === 'WRP') {
      drawing.pointSlot = 'SOURCE_POINT';
      const hubSlot = assignments.find(assignment => assignment.target === 'hub')?.expression;
      const hubControl = controls.find(control => control.slot === hubSlot);
      if (hubControl) hubControl.defaultValue = '';
      drawingControls.push({ id: `${schema.schemaKey}-elevation`, kind: 'number', slot: 'SOURCE_ELEVATION', columns: 1, label: { zh: '起点高度(y)', en: '' } });
      assignments.push({ id: `${schema.schemaKey}-source-elevation-input`, target: 'elevation', expression: 'SOURCE_ELEVATION' }, { id: `${schema.schemaKey}-source-elevation-capture`, target: 'elevation', expression: 'SOURCE_POINT_Y', when: { token: 'SOURCE_POINT_Y', operator: 'present' } });
      if (classCode === 'TPP') {
        const warpSlot = assignments.find(assignment => assignment.target === 'TGTWarp')?.expression ?? '';
        const when = { token: warpSlot, operator: 'empty' as const };
        drawing.auxiliaryPoints = [{ id: `${schema.schemaKey}-target-point`, slot: 'TARGET_POINT', label: { zh: '目标点坐标', en: '' }, required: true, when }];
        drawingControls.push({ id: `${schema.schemaKey}-target-elevation`, kind: 'number', slot: 'TARGET_ELEVATION', columns: 1, label: { zh: '目标点高度(y)', en: '' }, when });
        assignments.push({ id: `${schema.schemaKey}-target-y-default`, target: 'TGTcoordinate.y', expression: '-64', when }, { id: `${schema.schemaKey}-target-x`, target: 'TGTcoordinate.x', expression: 'TARGET_POINT_X', when }, { id: `${schema.schemaKey}-target-z`, target: 'TGTcoordinate.z', expression: 'TARGET_POINT_Z', when }, { id: `${schema.schemaKey}-target-y-input`, target: 'TGTcoordinate.y', expression: 'TARGET_ELEVATION', when }, { id: `${schema.schemaKey}-target-elevation-input`, target: 'TGTelevation', expression: 'TARGET_ELEVATION', when }, { id: `${schema.schemaKey}-target-y-capture`, target: 'TGTcoordinate.y', expression: 'TARGET_POINT_Y', when: { token: 'TARGET_POINT_Y', operator: 'present' } }, { id: `${schema.schemaKey}-target-elevation-capture`, target: 'TGTelevation', expression: 'TARGET_POINT_Y', when: { token: 'TARGET_POINT_Y', operator: 'present' } });
      }
    }
    return [{
      id: `v3-${schema.schemaKey}`,
      label: { zh: schema.displayName, en: '' },
      mode: 'composed' as const,
      target,
      steps: [
        { id: `${schema.schemaKey}-actor`, kind: 'actor' as const, label: { zh: '填写人', en: 'Author' } },
        { id: `${schema.schemaKey}-form`, kind: 'form' as const, label: { zh: '基本信息', en: 'Basic information' }, controls },
        { id: `${schema.schemaKey}-tail`, kind: 'tagsExtensions' as const, label: { zh: '标签与扩展', en: 'Tags and extensions' }, tagsExtensions: { tagsEnabled: true, extensionsEnabled: true } },
        { id: `${schema.schemaKey}-geometry`, kind: 'geometry' as const, outputId, geometry: [geometry], label: { zh: '绘制', en: 'Geometry' }, drawing, controls: drawingControls },
      ],
      outputs: [{ id: outputId, classification: target, assignments, geometry: { selected: geometry } }],
      legacy: { runtimeMode: 'registry-schema', source: { schemaKey: schema.schemaKey } },
    }];
  });
}

function externalWorkflows(workflows: CairnMapWorkflowConfig[]): WorkflowDefinition[] {
  const groups: Array<{ reason: NonNullable<WorkflowDefinition['external']>['reason']; componentKey: string; label: string }> = [
    { reason: 'railway-integrated', componentKey: 'railwayWorkflow', label: '铁路一体工作流' },
    { reason: 'station-integrated', componentKey: 'stationWorkflow', label: '车站一体工作流' },
    { reason: 'trp-integrated', componentKey: 'tradePointWorkflow', label: '交易点一体工作流' },
  ];
  return groups.flatMap((group) => {
    const covered = workflows.filter((workflow) => externalReason(workflow) === group.reason).map((workflow) => ({ class: workflow.targetClass }));
    const fallbackCovered = group.reason === 'railway-integrated' ? [{ class: 'RLE' }]
      : group.reason === 'station-integrated' ? [{ class: 'STA' }, { class: 'PLF' }, { class: 'PFB' }, { class: 'STB' }, { class: 'SBP' }, { class: 'STF' }]
        : [{ class: 'TRP' }];
    return [{
      id: `external-${group.reason}`,
      label: { zh: group.label, en: group.reason },
      mode: 'external' as const,
      steps: [],
      outputs: [],
      external: { componentKey: group.componentKey, reason: group.reason, coveredClassifications: covered.length ? covered : fallbackCovered },
      legacy: { componentKey: group.componentKey, source: { coveredWorkflowIds: workflows.filter((workflow) => externalReason(workflow) === group.reason).map((workflow) => workflow.id) } },
    }];
  });
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function parityEntries(classes: CairnMapClassConfig[], workflows: CairnMapWorkflowConfig[]): ParityEntry[] {
  return [
    ...classes.map((item) => ({ kind: 'class' as const, id: item.classCode, source: `project-config class ${item.classCode}`, status: 'resolved' as const, fingerprint: fingerprint(item), details: '字段、分类、坐标、显示规则、信息卡及原始 V1 契约均已建立可审计映射。' })),
    ...workflows.map((item) => ({ kind: 'workflow' as const, id: item.id, source: `project-config workflow ${item.id}`, status: 'resolved' as const, fingerprint: fingerprint(item), details: '页面、块、绘制尾页、输出组装与原始 V1 契约均已建立可审计映射。' })),
    { kind: 'shared', id: 'display-profiles', source: 'project-config shared displayProfiles', status: 'registryReference', details: `已受控注册 ${getOpenRIAMapDisplayProfilesConfig().items.length} 个显示 profile。` },
    { kind: 'shared', id: 'special-display-logic', source: 'project-config shared specialDisplayLogic', status: 'registryReference', details: `已受控注册 ${getOpenRIAMapSpecialDisplayLogicConfig().items.length} 个专用显示逻辑。` },
    { kind: 'shared', id: 'card-runtime', source: 'project-config shared card layouts and component registry', status: 'registryReference', details: '声明式布局和代码型专用卡片已经拆分为两个受控注册表。' },
    { kind: 'shared', id: 'workflow-registry', source: 'project-config shared workflow controls and blocks', status: 'registryReference', details: '表单控件、粗搜索、关系搜索和组件块均使用受控注册表。' },
  ];
}

/**
 * Semantic V1 -> V3.2 migration.  The result is a native contract-r5 package:
 * V1 display, card and standard workflow values are promoted into editable
 * fields rather than retained as a runnable legacy fallback.  The only code
 * workflows retained are the explicitly approved railway/station/TRP units.
 */
export function createConfigPackageFromCurrentProject(): ConfigPackageV3 {
  const classes = listClassConfigs();
  const workflows = getOpenRIAMapWorkflowConfigs();
  const nodes = classes.flatMap(nodesFor);
  const engine = createV32EngineDefaults();
  // Frozen V1 uses Leaflet's natural symbol/path hit area. Extra tolerance
  // stays editable, but must not silently widen the migrated project.
  for (const baseline of Object.values(engine.interactionBaselines)) baseline.hitTolerancePx = 0;
  for (const [geometry, baseline] of Object.entries(engine.interactionBaselines)) {
    baseline.hover.enabled = false;
    baseline.editing.enabled = false;
    baseline.deletionMarked.enabled = false;
    baseline.selected = geometry === 'Point'
      ? { enabled: true, strokeColor: '#111827', strokeWidth: 1, strokeOpacity: 1, fillColor: '#3b82f6', fillOpacity: 1, symbol: { kind: 'pin', size: [26, 26] }, forceShowLabel: true, labelPriority: 10000, zIndexOffset: 10000 }
      : { enabled: true, strokeColor: '#60a5fa', strokeWidth: 3, strokeOpacity: 1, fillOpacity: 0, dashArray: '8 6', forceShowLabel: true, labelPriority: 10000, zIndexOffset: 10000 };
    baseline.searchResult = { ...clone(baseline.selected), labelPriority: 9500 };
  }
  for (const node of nodes.filter(item => item.path.class === 'ROD')) for (const profile of Object.values(node.geometryProfiles)) for (const rule of profile?.zoomPriority.rules ?? []) {
    const road = { strokeColor: '#2196F3', strokeColorBinding: { mode: 'field' as const, field: 'color', fallbackColor: '#2196F3' }, strokeWidth: 6, dashArray: '', outline: { color: '#ffffff', width: 9, opacity: 0.85 } };
    rule.extensions = { ...rule.extensions, interaction: { selected: road, searchResult: clone(road) } };
  }
  return {
    schemaVersion: 'cairnmap.config-package.v3',
    contractRevision: 6,
    packageId: 'cairnmap-config-v32-semantic',
    projectId: 'openriamap-ria',
    revision: 2,
    displayName: { zh: 'V3.2：V1 显示与工作流再现', en: 'V3.2 V1 semantic migration' },
    engine,
    registries: buildRegistries(workflows),
    nodes,
    contextBindings: [
      {
        id: 'bud-floor-context',
        label: { zh: '建筑与楼层/单元', en: 'Building and floor/unit' },
        host: { classification: { class: 'BUD' }, referenceField: 'ID' },
        member: { classification: { class: 'FLR' }, referenceField: 'BuildingID' },
        memberSelectorField: 'NofFloor',
        enabled: true,
        profile: 'show-active-member-only',
      },
      {
        id: 'station-building-floor-context',
        label: { zh: '站房与站房楼层', en: 'Station building and floor' },
        host: { classification: { class: 'STB' }, referenceField: 'ID' },
        member: { classification: { class: 'STF' }, referenceField: 'staBuildingID' },
        memberSelectorField: 'NofFloor',
        enabled: true,
        profile: 'show-active-member-only',
      },
    ],
    workflows: [
      ...externalWorkflows(workflows),
      ...workflowsFromSchemas(classes),
      // Keep any project workflow without a registry schema editable instead
      // of silently dropping it.  Existing dedicated workflows are filtered
      // above into their single external unit.
      ...workflows.filter((workflow) => !externalReason(workflow) && !WORKFLOW_EDITOR_SCHEMAS.some((schema) => schema.match.classCode === workflow.targetClass)).map((workflow) => workflowFor(workflow, nodes.some((node) => node.path.class === workflow.targetClass && Boolean(node.path.kind)))),
    ],
    parity: { schemaVersion: 'cairnmap.v1-parity-report.v2', generatedAt: new Date().toISOString(), entries: parityEntries(classes, workflows) },
  };
}
