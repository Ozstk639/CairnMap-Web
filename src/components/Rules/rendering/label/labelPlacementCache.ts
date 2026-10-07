/**
 * RB_SLU label placement cache.
 *
 * This module is intentionally independent from Leaflet. The layout engine stores
 * only the previous successful anchor/candidate choice, then revalidates that
 * choice against the current viewport, collision index, and density gate on the
 * next layout pass.
 */

import type { LabelCandidateName } from '@/components/Rules/rendering/labelLayout';
import type { LabelPlacement } from '@/components/Rules/rendering/labelStyles';

export type LabelPlacementCacheKeyMode =
  | 'featureID'
  | 'featureID+zoomBucket'
  | 'featureID+mode'
  | 'custom';

export type LabelPlacementCacheInput = {
  id: string;
  featureUid?: string;
  partIndex?: number;
  text: string;
  placement: LabelPlacement;
  zoom: number;

  collisionGroup?: string;
  groupKey?: string;

  placementCacheEnabled?: boolean;
  placementCacheKey?: LabelPlacementCacheKeyMode | string;
  placementCacheCustomKey?: string;
  placementZoomBucketSize?: number;
  placementKeepPreviousCandidate?: boolean;
  placementKeepPreviousAnchor?: boolean;
};

export type ResolvedLabelPlacementCacheConfig = {
  enabled: boolean;
  key: string;
  keepPreviousCandidate: boolean;
  keepPreviousAnchor: boolean;
};

export type LabelPlacementCacheEntry = {
  key: string;
  anchorIndex: number;
  /** RB_SLU_21: stable line/surface anchor id. Prefer this over index when available. */
  anchorId?: string;
  candidateName: LabelCandidateName;
  updatedAt: number;
};

const DEFAULT_ZOOM_BUCKET_SIZE = 1;
const DEFAULT_MAX_CACHE_ENTRIES = 5000;

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function finitePositive(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function zoomBucket(zoom: number, bucketSize: number): string {
  const bucket = Math.floor(zoom / bucketSize) * bucketSize;
  return Number.isInteger(bucket) ? String(bucket) : bucket.toFixed(2);
}

function safeSegment(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const cleaned = raw.trim();
  return encodeURIComponent(cleaned || fallback);
}

export function resolveLabelPlacementCacheConfig(
  input: LabelPlacementCacheInput | undefined,
): ResolvedLabelPlacementCacheConfig | undefined {
  if (!input?.placementCacheEnabled) return undefined;

  const keepPreviousCandidate = input.placementKeepPreviousCandidate !== false;
  const keepPreviousAnchor = input.placementKeepPreviousAnchor !== false;
  if (!keepPreviousCandidate && !keepPreviousAnchor) return undefined;

  const featureKey = safeSegment(`${input.featureUid ?? input.id}${input.partIndex === undefined ? '' : `#part-${input.partIndex}`}`, input.id || 'label');
  const textKey = safeSegment(cleanText(input.text), 'empty');
  const placementKey = safeSegment(input.placement, 'placement');
  const groupKey = safeSegment(input.collisionGroup ?? input.groupKey, 'label');
  const mode = input.placementCacheKey ?? 'featureID+zoomBucket';
  const bucketSize = finitePositive(input.placementZoomBucketSize, DEFAULT_ZOOM_BUCKET_SIZE);
  const zoomKey = zoomBucket(Number(input.zoom) || 0, bucketSize);

  let key: string;
  switch (mode) {
    case 'featureID':
      key = `feature:${featureKey}|text:${textKey}|placement:${placementKey}|group:${groupKey}`;
      break;
    case 'featureID+mode':
      // Display mode is not available inside labelLayout yet. Keep this stable
      // but distinct from featureID so future mode-specific keys can be added.
      key = `feature-mode:${featureKey}|mode:default|text:${textKey}|placement:${placementKey}|group:${groupKey}`;
      break;
    case 'custom':
      key = `custom:${safeSegment(input.placementCacheCustomKey, featureKey)}|text:${textKey}|placement:${placementKey}|group:${groupKey}|z:${zoomKey}`;
      break;
    case 'featureID+zoomBucket':
    default:
      key = `feature-zoom:${featureKey}|z:${zoomKey}|text:${textKey}|placement:${placementKey}|group:${groupKey}`;
      break;
  }

  return {
    enabled: true,
    key,
    keepPreviousCandidate,
    keepPreviousAnchor,
  };
}

export class LabelPlacementCache {
  private entries = new Map<string, LabelPlacementCacheEntry>();

  get(config: ResolvedLabelPlacementCacheConfig | undefined): LabelPlacementCacheEntry | undefined {
    if (!config?.enabled) return undefined;
    return this.entries.get(config.key);
  }

  commit(
    config: ResolvedLabelPlacementCacheConfig | undefined,
    value: Pick<LabelPlacementCacheEntry, 'anchorIndex' | 'candidateName'> & { anchorId?: string },
  ): void {
    if (!config?.enabled) return;

    this.entries.set(config.key, {
      key: config.key,
      anchorIndex: Math.max(0, Math.floor(value.anchorIndex)),
      anchorId: value.anchorId,
      candidateName: value.candidateName,
      updatedAt: Date.now(),
    });

    if (this.entries.size > DEFAULT_MAX_CACHE_ENTRIES) {
      const first = this.entries.keys().next();
      if (!first.done) this.entries.delete(first.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

const defaultLabelPlacementCache = new LabelPlacementCache();

export function getDefaultLabelPlacementCache(): LabelPlacementCache {
  return defaultLabelPlacementCache;
}

export function clearDefaultLabelPlacementCache(): void {
  defaultLabelPlacementCache.clear();
}
