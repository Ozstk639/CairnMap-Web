import { WORLD_CODE_BY_WORLD_ID } from '@/components/Common/featureFormats';
import {
  buildReviewPackageArtifact,
  type ReviewPackageFeatureInput,
  type ReviewPackagePictureInput,
  type ReviewPackageSourceSnapshot,
  type ReviewPackageProfile,
  CAIRNMAP_DEFAULT_REVIEW_PACKAGE_PROFILE,
  buildReviewPackageToolRefreshFiles,
} from '@/components/Review/package';
import { readRuleWorldCache } from '@/components/Rules/data/worldRuleCache';
import type { RelayPackageDraft } from './relayPackageDraft';

export type RelayExportLayer = {
  id: number;
  mode: 'point' | 'polyline' | 'polygon';
  color: string;
  coords: { x: number; z: number; y?: number }[];
  visible: boolean;
  jsonInfo?: {
    subType: string;
    featureInfo: any;
  };
};

const REVERSE_WORLD = Object.fromEntries(Object.entries(WORLD_CODE_BY_WORLD_ID).map(([worldId, code]) => [String(code), worldId]));

/** Normalize a legacy world code to the stable directory world id. */
export function resolveRelayPackageWorldId(world: unknown, fallbackWorldId: string): string {
  const value = String(world ?? '').trim();
  if (value && REVERSE_WORLD[value]) return String(REVERSE_WORLD[value]);
  return value || fallbackWorldId;
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const parts = String(url || '').split('?')[0].split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : undefined;
  } catch {
    return undefined;
  }
}

async function resolvePictureBlob(pic: { file?: File; previewUrl?: string; originalName: string }): Promise<{ blob: Blob; name: string } | null> {
  if (pic.file) return { blob: pic.file, name: pic.originalName };
  const url = String(pic.previewUrl ?? '').trim();
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return { blob: await response.blob(), name: pic.originalName || fileNameFromUrl(url) || 'image.png' };
  } catch {
    return null;
  }
}

function safeFilename(name: string): string {
  const leaf = String(name || '').split(/[\\/]/).pop() || 'image.png';
  return leaf.replace(/[^A-Za-z0-9._-]/g, '_') || 'image.png';
}

function packageNameFor(operator: string, worldId: string, timestamp = new Date()): string {
  const compact = timestamp.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const safe = (value: string, fallback: string) => String(value || fallback).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || fallback;
  return `RelayPackage_${safe(operator, 'operator')}_${safe(worldId, 'world')}_${compact}.zip`;
}

function resolveSourceSnapshot(worldId: string): ReviewPackageSourceSnapshot | undefined {
  try {
    const dataset = readRuleWorldCache(worldId);
    if (!dataset) return undefined;
    const source = dataset as unknown as Record<string, unknown>;
    const formalVersion = source.formalVersion === undefined || source.formalVersion === null
      ? null
      : (/^\d+$/.test(String(source.formalVersion)) ? Number(source.formalVersion) : null);
    const releaseId = String(source.releaseId ?? source.mergeVersion ?? '').trim();
    return {
      releaseId: releaseId || null,
      formalVersion,
      technicalId: releaseId || null,
      resolvedAt: Number.isFinite(dataset.loadedAt) ? new Date(dataset.loadedAt).toISOString() : null,
    };
  } catch {
    // A source snapshot is helpful for review warnings but is never required
    // to create a draft.  The eventual precheck remains authoritative.
    return undefined;
  }
}

/**
 * Map existing Mapping layers and draft state to the generic package input.
 * ZIP layout, marker serialization and strict validation are owned by
 * CairnMap's Review package core.
 */
export async function buildRelayPackageZip(args: {
  layers: RelayExportLayer[];
  currentWorldId: string;
  draft: RelayPackageDraft;
  operator: string;
  note: string;
  /** Optional application classification profile; fixed ZIP paths remain upstream-owned. */
  packageProfile?: ReviewPackageProfile;
}): Promise<Blob> {
  const profile = args.packageProfile ?? CAIRNMAP_DEFAULT_REVIEW_PACKAGE_PROFILE;
  const nestedKinds = new Set(profile.nestedKindClasses ?? []);
  const exportLayers = args.layers.filter((layer) => Boolean(layer.jsonInfo?.featureInfo));
  const features: ReviewPackageFeatureInput[] = [];
  const locationsById = new Map<string, { worldId: string; classCode: string; name: string; kindPath: string[] }>();

  for (const layer of exportLayers) {
    const record = layer.jsonInfo?.featureInfo;
    if (!record || typeof record !== 'object') continue;
    const classCode = String(record.Class ?? '').trim();
    const featureId = String(record.ID ?? '').trim();
    if (!classCode || !featureId) continue;
    const worldId = resolveRelayPackageWorldId(record.World, args.currentWorldId);
    const kind = String(record.Kind ?? '').trim();
    const kindPath = kind && nestedKinds.has(classCode) ? [kind] : [];
    features.push({ worldId, classCode, featureId, kindPath, record });
    locationsById.set(featureId, {
      worldId,
      classCode,
      name: String(record.Name ?? record.Label ?? '').trim(),
      kindPath,
    });
  }

  const pictures: ReviewPackagePictureInput[] = [];
  for (const [featureId, bindings] of Object.entries(args.draft.picturesById)) {
    const location = locationsById.get(featureId);
    if (!location) continue;
    const active = [...bindings].filter((picture) => !picture.deleted).sort((left, right) => left.order - right.order);
    for (const picture of active) {
      const resolved = await resolvePictureBlob(picture);
      if (!resolved) continue;
      pictures.push({
        worldId: location.worldId,
        classCode: location.classCode,
        featureId,
        kindPath: location.kindPath,
        filename: safeFilename(resolved.name),
        content: resolved.blob,
      });
    }
  }

  const deletes = args.draft.deleteMarks
    .map((item) => {
      const location = locationsById.get(String(item.ID ?? '').trim());
      const worldId = String(item.worldId ?? location?.worldId ?? args.currentWorldId).trim();
      const classCode = String(item.classCode ?? location?.classCode ?? '').trim();
      return {
        ID: String(item.ID ?? '').trim(),
        ...(String(item.Name ?? location?.name ?? '').trim() ? { Name: String(item.Name ?? location?.name ?? '').trim() } : {}),
        ...(worldId ? { worldId: resolveRelayPackageWorldId(worldId, args.currentWorldId) } : {}),
        ...(classCode ? { classCode } : {}),
      };
    })
    .filter((item) => item.ID);

  const artifact = await buildReviewPackageArtifact(profile, {
    packageName: packageNameFor(args.operator, args.currentWorldId),
    operator: args.operator,
    note: args.note,
    packageVersion: args.draft.meta.packageVersion,
    sourceSnapshot: resolveSourceSnapshot(args.currentWorldId),
    features,
    pictures,
    deletes,
    extraFiles: buildReviewPackageToolRefreshFiles(),
  });
  return artifact.blob;
}
