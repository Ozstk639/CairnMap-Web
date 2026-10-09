/**
 * RB_SLU label density limiter.
 *
 * This module is intentionally small and independent from Leaflet so it can be
 * consumed by labelLayout.ts without dragging rendering concerns into the
 * display rule registry.
 */

export type LabelDensityCollisionRole = 'required' | 'important' | 'optional' | 'soft' | 'ignore';

export type LabelDensityReduceStep =
  | 'hideSoftLabels'
  | 'abbreviateOptionalLabels'
  | 'hideOptionalLabels'
  | 'hideSymbols'
  | 'geometryOnly';
export const DEFAULT_LABEL_DENSITY_REDUCE_ORDER: LabelDensityReduceStep[] = ['abbreviateOptionalLabels', 'hideOptionalLabels'];

export type LabelDensityInput = {
  densityEnabled?: boolean;
  densityGridSizePx?: number;
  densityMaxLabelsPerGrid?: number;
  densityPreserveRequired?: boolean;
  densityPreserveSelected?: boolean;
  selected?: boolean;
  densityGroupKey?: string;
  densityReduceOrder?: LabelDensityReduceStep[];

  collisionRole?: LabelDensityCollisionRole;
  collisionGroup?: string;
  groupKey?: string;
};

export type LabelDensityRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ResolvedLabelDensityConfig = {
  enabled: boolean;
  gridSizePx: number;
  maxLabelsPerGrid: number;
  preserveRequired: boolean;
  preserveSelected: boolean;
  selected: boolean;
  groupKey: string;
  collisionRole?: LabelDensityCollisionRole;
  reduceOrder?: LabelDensityReduceStep[];
};

const DEFAULT_DENSITY_GRID_SIZE_PX = 96;
const DEFAULT_MAX_LABELS_PER_GRID = 2;

function finitePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function cleanGroupKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function resolveLabelDensityConfig(input: LabelDensityInput | undefined): ResolvedLabelDensityConfig | undefined {
  if (!input?.densityEnabled) return undefined;

  const groupKey =
    cleanGroupKey(input.densityGroupKey) ??
    cleanGroupKey(input.collisionGroup) ??
    cleanGroupKey(input.groupKey) ??
    'label';

  return {
    enabled: true,
    gridSizePx: finitePositiveInt(input.densityGridSizePx, DEFAULT_DENSITY_GRID_SIZE_PX),
    maxLabelsPerGrid: finitePositiveInt(input.densityMaxLabelsPerGrid, DEFAULT_MAX_LABELS_PER_GRID),
    preserveRequired: input.densityPreserveRequired !== false,
    preserveSelected: input.densityPreserveSelected !== false,
    selected: Boolean(input.selected),
    groupKey,
    collisionRole: input.collisionRole,
    reduceOrder: Array.isArray(input.densityReduceOrder) ? input.densityReduceOrder : undefined,
  };
}

function shouldBypassDensityLimit(config: ResolvedLabelDensityConfig): boolean {
  return config.preserveSelected && config.selected || config.preserveRequired && config.collisionRole === 'required';
}

function densityCellKey(rect: LabelDensityRect, config: ResolvedLabelDensityConfig): string {
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const ix = Math.floor(centerX / config.gridSizePx);
  const iy = Math.floor(centerY / config.gridSizePx);
  return `${config.groupKey}:${ix},${iy}`;
}

export type LabelDensityInspectResult = {
  enabled: boolean;
  key?: string;
  current?: number;
  max?: number;
};

export class LabelDensityLimiter {
  private counts = new Map<string, number>();

  inspect(rect: LabelDensityRect, config: ResolvedLabelDensityConfig | undefined): LabelDensityInspectResult {
    if (!config?.enabled) return { enabled: false };
    if (shouldBypassDensityLimit(config)) {
      return { enabled: true, key: densityCellKey(rect, config), current: 0, max: Infinity };
    }
    const key = densityCellKey(rect, config);
    const current = this.counts.get(key) ?? 0;
    return { enabled: true, key, current, max: config.maxLabelsPerGrid };
  }

  canPlace(rect: LabelDensityRect, config: ResolvedLabelDensityConfig | undefined): boolean {
    if (!config?.enabled) return true;
    if (shouldBypassDensityLimit(config)) return true;

    const key = densityCellKey(rect, config);
    const current = this.counts.get(key) ?? 0;
    return current < config.maxLabelsPerGrid;
  }

  commit(rect: LabelDensityRect, config: ResolvedLabelDensityConfig | undefined): void {
    if (!config?.enabled) return;
    if (shouldBypassDensityLimit(config)) return;

    const key = densityCellKey(rect, config);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
}
