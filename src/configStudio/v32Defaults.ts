import type {
  ConfigEngineSettings,
  ConfigPackageV3,
  GeometryInteractionBaseline,
  GeometryInteractionTriggers,
  GeometryKind,
  GeometryProfile,
  InteractionState,
  InteractionVisual,
  RenderLabelStyle,
  RenderStyle,
  ZoomPriorityRule,
} from './types';

const stateStyle = (
  color: string,
  width: number,
  extra: Partial<InteractionVisual> = {},
): InteractionVisual => ({
  enabled: true,
  strokeColor: color,
  strokeWidth: width,
  strokeOpacity: 1,
  fillColor: color,
  fillOpacity: 0.16,
  zIndexOffset: 0,
  forceShowLabel: true,
  ...extra,
});

function interactionBaseline(hitTolerancePx: number): GeometryInteractionBaseline {
  const states: Record<InteractionState, InteractionVisual> = {
    hover: stateStyle('#38bdf8', 3, { fillOpacity: 0.1, zIndexOffset: 20, labelPriority: 7000 }),
    selected: stateStyle('#f59e0b', 4, { fillOpacity: 0.14, zIndexOffset: 80, labelPriority: 10000 }),
    searchResult: stateStyle('#a855f7', 4, { fillOpacity: 0.14, zIndexOffset: 70, labelPriority: 9500 }),
    editing: stateStyle('#2563eb', 4, { fillOpacity: 0.1, zIndexOffset: 90, labelPriority: 9000 }),
    deletionMarked: stateStyle('#ef4444', 4, { fillOpacity: 0.1, zIndexOffset: 100, labelPriority: 10000 }),
  };
  return { ...states, hitTolerancePx };
}

/** Package-level values that are deliberately shared by all classifications. */
export function createV32EngineDefaults(): ConfigEngineSettings {
  return {
    world: { field: 'World', assignment: 'activeWorld', required: true },
    // This mirrors the existing map's high-zoom floor-entry threshold without
    // importing its BUD/STB/FLR class assumptions into V3.2.  The binding
    // itself decides which categories are hosts and members.
    contextView: { minZoom: 6, activationRadiusPx: 70, retainRadiusPx: 120 },
    // Zero is an explicit, stable "no minimum" default. A rule may opt into
    // a stricter local threshold in its collapsed extension section.
    screenGateDefaults: { polygonMinScreenAreaPx: 0, lineMinScreenLengthPx: 0 },
    interactionBaselines: {
      Point: interactionBaseline(10),
      LineString: interactionBaseline(9),
      Polygon: interactionBaseline(6),
    },
    paneDefaults: {
      overlay: 'ria-overlay',
      'overlay-top': 'ria-overlay-top',
      point: 'ria-point',
      'point-top': 'ria-point-top',
    },
  };
}

export function defaultGeometryTriggers(geometry: GeometryKind): GeometryInteractionTriggers {
  if (geometry === 'Point') return { point: true, label: true };
  if (geometry === 'LineString') return { line: true, label: true };
  return { boundary: true, interior: true, label: true };
}

export function defaultRenderStyle(geometry: GeometryKind): RenderStyle {
  const color = geometry === 'Point' ? '#e04747' : geometry === 'LineString' ? '#2563eb' : '#334155';
  return {
    ...(geometry === 'Point' ? { pointShape: 'circle' as const, size: 8 } : {}),
    weight: geometry === 'LineString' ? 3 : 2,
    stroke: { mode: 'fixed', color },
    ...(geometry === 'LineString' ? {} : { fill: { mode: 'fixed' as const, color }, fillOpacity: geometry === 'Polygon' ? 0.24 : 0.88 }),
    strokeOpacity: 0.92,
    dashPreset: 'solid',
    lineCap: 'round',
    lineJoin: 'round',
  };
}

export function defaultLabelStyle(geometry: GeometryKind, zLevel: number): RenderLabelStyle {
  return {
    visible: true,
    // Native starting styles follow the production visual families rather
    // than one generic font: POI bubbles, black-text/white-outline network
    // labels, and white-text/black-outline surface labels.  Water and rail
    // variants remain explicit per-rule choices in the editor.
    style: geometry === 'Point'
      ? { family: 'bubble-dark', size: 14 }
      : geometry === 'LineString'
        ? { family: 'gm-outline', size: 17 }
        : { family: 'gm-bw', size: 15 },
    source: 'Name',
    collision: {
      role: geometry === 'Polygon' ? 'important' : 'optional',
      basePriority: zLevel,
      hideWhenColliding: true,
    },
  };
}

export function defaultRenderRule(geometry: GeometryKind, id = 'render-1'): ZoomPriorityRule {
  const zLevel = geometry === 'Point' ? 420 : geometry === 'LineString' ? 320 : 300;
  return {
    id,
    minZoom: 0,
    maxZoom: 8,
    representation: 'geometry',
    style: defaultRenderStyle(geometry),
    label: defaultLabelStyle(geometry, zLevel),
    geometryStack: { zLevel },
    priority: { mode: 'replace', base: zLevel },
    extensions: {
      screenGate: { mode: 'inherit' },
      lineLabel: geometry === 'LineString' ? { profile: 'standard' } : undefined,
      anchor: { strategy: geometry === 'LineString' ? 'lineCenter' : geometry === 'Polygon' ? 'interior' : 'featureCenter' },
    },
  };
}

export function createDefaultGeometryProfile(geometry: GeometryKind, enabled = true): GeometryProfile {
  return {
    enabled,
    allowMultipleParts: true,
    anchor: 'featureBbox',
    interaction: { triggers: defaultGeometryTriggers(geometry) },
    zoomPriority: { rules: [defaultRenderRule(geometry)] },
  };
}

/**
 * This intentionally contains no migrated V1 nodes, cards or workflows.
 * V32 is a native authoring base; semantic migration is a later, separate
 * phase so a user never mistakes a partial V1 adapter for editable V3 data.
 */
export function createBlankV32Package(): ConfigPackageV3 {
  return {
    schemaVersion: 'cairnmap.config-package.v3',
    contractRevision: 6,
    packageId: 'cairnmap-config-v32',
    projectId: 'default',
    revision: 1,
    displayName: { zh: 'V3.2 原生空白配置', en: 'V3.2 native blank configuration' },
    engine: createV32EngineDefaults(),
    registries: {
      cardLayouts: [],
      cardComponents: [],
      displayProfiles: [],
      specialDisplayLogic: [],
      workflowControls: [],
      workflowBlocks: [],
    },
    nodes: [],
    contextBindings: [],
    workflows: [],
    parity: {
      schemaVersion: 'cairnmap.v1-parity-report.v2',
      generatedAt: new Date().toISOString(),
      entries: [{
        kind: 'shared',
        id: 'v1-semantic-migration',
        source: 'runtime-v32',
        status: 'registryReference',
        details: '本阶段只冻结 V1 基线；语义迁移、信息卡和工作流迁移尚未执行。',
      }],
    },
  };
}
