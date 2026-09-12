import { buildZipStore } from '../../../lib/zipStore';
import {
  REVIEW_PACKAGE_CONTRACT_VERSION,
  REVIEW_PACKAGE_LAYOUT,
  REVIEW_PACKAGE_PICTURE_BINDINGS_SCHEMA_VERSION,
  REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION,
  type ReviewPackageArtifact,
  type ReviewPackageDraft,
  type ReviewPackageFile,
  type ReviewPackageManifest,
  type ReviewPackagePictureBinding,
  type ReviewPackageProfile,
  type ReviewPackageReviewMarker,
} from './contracts';
import { isReviewPackageSafeSegment, normalizeReviewPackageKindPath, validateReviewPackageDraft } from './validator';

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function normalizedTime(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('review-package-exported-at-invalid');
  return date.toISOString();
}

function pathForFeature(profile: ReviewPackageProfile, feature: ReviewPackageDraft['features'][number]): string {
  const parts = [REVIEW_PACKAGE_LAYOUT.featureRoot, feature.worldId, feature.classCode];
  parts.push(...normalizeReviewPackageKindPath(profile, feature.classCode, feature.kindPath));
  return `${parts.join('/')}/${feature.featureId}.json`;
}

function pathForPicture(profile: ReviewPackageProfile, picture: ReviewPackageDraft['pictures'][number]): string {
  const parts = [REVIEW_PACKAGE_LAYOUT.pictureRoot, picture.worldId, picture.classCode];
  parts.push(...normalizeReviewPackageKindPath(profile, picture.classCode, picture.kindPath));
  parts.push(picture.featureId, picture.filename);
  return parts.join('/');
}

function assertFilePath(path: string): void {
  if (!path.split('/').every(isReviewPackageSafeSegment)) throw new Error(`review-package-path-invalid:${path}`);
}

export function createReviewPackageManifest(draft: ReviewPackageDraft, exportedAt = normalizedTime(draft.exportedAt)): ReviewPackageManifest {
  const version = draft.packageVersion ?? `draft-${exportedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  return {
    schemaVersion: '1.0.0',
    relayPackageContractVersion: REVIEW_PACKAGE_CONTRACT_VERSION,
    operator: draft.operator,
    note: draft.note,
    version,
    packageVersion: version,
    exportedAt,
    featureCount: draft.features.length,
    pictureCount: draft.pictures.length,
    deleteCount: draft.deletes.length,
    ...(draft.sourceSnapshot ? { sourceSnapshot: draft.sourceSnapshot } : {}),
  };
}

export function createReviewPackageReviewMarker(exportedAt: string): ReviewPackageReviewMarker {
  return {
    schemaVersion: REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION,
    status: 'pending',
    submissionMode: 'review-submission-v2',
    exportedAt,
  };
}

export function buildReviewPackageFiles(profile: ReviewPackageProfile, draft: ReviewPackageDraft): { files: ReviewPackageFile[]; manifest: ReviewPackageManifest; reviewMarker: ReviewPackageReviewMarker } {
  const validation = validateReviewPackageDraft(draft, profile, 'strict-submission');
  if (!validation.valid) throw new Error(`review-package-invalid:${validation.errors.map((entry) => entry.code).join(',')}`);
  const exportedAt = normalizedTime(draft.exportedAt);
  const manifest = createReviewPackageManifest(draft, exportedAt);
  const reviewMarker = createReviewPackageReviewMarker(exportedAt);
  const files: ReviewPackageFile[] = [
    { path: REVIEW_PACKAGE_LAYOUT.indexPath, content: json(manifest) },
    { path: REVIEW_PACKAGE_LAYOUT.reviewPath, content: json(reviewMarker) },
    { path: REVIEW_PACKAGE_LAYOUT.deletePath, content: json({ deleteTime: exportedAt, items: draft.deletes }) },
  ];
  const pictureBindings = new Map<string, ReviewPackagePictureBinding>();
  for (const feature of draft.features) {
    const path = pathForFeature(profile, feature);
    assertFilePath(path);
    files.push({ path, content: json(feature.record) });
    const kindPath = normalizeReviewPackageKindPath(profile, feature.classCode, feature.kindPath);
    pictureBindings.set(`${feature.worldId}\u0000${feature.classCode}\u0000${feature.featureId}`, {
      worldId: feature.worldId,
      classCode: feature.classCode,
      featureId: feature.featureId,
      kindPath,
      files: [],
    });
  }
  const nextOrderByFeature = new Map<string, number>();
  for (const picture of draft.pictures) {
    const path = pathForPicture(profile, picture);
    assertFilePath(path);
    const key = `${picture.worldId}\u0000${picture.classCode}\u0000${picture.featureId}`;
    const binding = pictureBindings.get(key);
    if (!binding) throw new Error(`review-package-picture-feature-missing:${path}`);
    const nextOrder = nextOrderByFeature.get(key) ?? 1;
    const order = Number.isSafeInteger(picture.order) && Number(picture.order) > 0 ? Number(picture.order) : nextOrder;
    nextOrderByFeature.set(key, Math.max(nextOrder, order + 1));
    if (binding.files.some((file) => file.order === order)) throw new Error(`review-package-picture-order-duplicate:${path}`);
    binding.files.push({ path, order, role: 'display' });
    files.push({ path, content: picture.content });
  }
  for (const binding of pictureBindings.values()) binding.files.sort((left, right) => left.order - right.order || left.path.localeCompare(right.path));
  files.push({
    path: REVIEW_PACKAGE_LAYOUT.pictureIndexPath,
    content: json({
      schemaVersion: REVIEW_PACKAGE_PICTURE_BINDINGS_SCHEMA_VERSION,
      bindings: [...pictureBindings.values()].sort((left, right) => `${left.worldId}\u0000${left.classCode}\u0000${left.featureId}`.localeCompare(`${right.worldId}\u0000${right.classCode}\u0000${right.featureId}`)),
    }),
  });
  for (const extra of draft.extraFiles ?? []) {
    assertFilePath(extra.path);
    files.push({ path: extra.path, content: extra.text });
  }
  const unique = new Set<string>();
  for (const file of files) {
    if (unique.has(file.path)) throw new Error(`review-package-duplicate-path:${file.path}`);
    unique.add(file.path);
  }
  return { files, manifest, reviewMarker };
}

export async function buildReviewPackageArtifact(profile: ReviewPackageProfile, draft: ReviewPackageDraft): Promise<ReviewPackageArtifact> {
  const { files, manifest, reviewMarker } = buildReviewPackageFiles(profile, draft);
  const hasBinary = files.some((file) => file.content instanceof Blob);
  let blob: Blob;
  if (!hasBinary) {
    blob = buildZipStore(files.map((file) => ({ name: file.path, text: String(file.content) })));
  } else {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const file of files) zip.file(file.path, file.content);
    blob = await zip.generateAsync({ type: 'blob' });
  }
  return {
    contractVersion: REVIEW_PACKAGE_CONTRACT_VERSION,
    packageName: draft.packageName,
    blob,
    manifest,
    reviewMarker,
    files: files.map((file) => ({ path: file.path })),
  };
}
