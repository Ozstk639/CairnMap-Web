import { buildZipStore } from '../../../lib/zipStore';
import {
  REVIEW_PACKAGE_CONTRACT_VERSION,
  REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION,
  type ReviewPackageArtifact,
  type ReviewPackageDraft,
  type ReviewPackageFile,
  type ReviewPackageManifest,
  type ReviewPackageProfile,
  type ReviewPackageReviewMarker,
} from './contracts';
import { isReviewPackageSafeSegment, validateReviewPackageDraft } from './validator';

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function normalizedTime(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('review-package-exported-at-invalid');
  return date.toISOString();
}

function pathForFeature(profile: ReviewPackageProfile, feature: ReviewPackageDraft['features'][number]): string {
  const nested = new Set(profile.nestedKindClasses ?? []);
  const parts = [profile.featureRoot, feature.worldId, feature.classCode];
  if (nested.has(feature.classCode)) parts.push(...(feature.kindPath ?? []));
  return `${parts.join('/')}/${feature.featureId}.json`;
}

function pathForPicture(profile: ReviewPackageProfile, picture: ReviewPackageDraft['pictures'][number]): string {
  const nested = new Set(profile.nestedKindClasses ?? []);
  const parts = [profile.pictureRoot, picture.worldId, picture.classCode];
  if (nested.has(picture.classCode)) parts.push(...(picture.kindPath ?? []));
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
    { path: profile.indexPath, content: json(manifest) },
    { path: profile.reviewPath, content: json(reviewMarker) },
    { path: profile.deletePath, content: json({ deleteTime: exportedAt, items: draft.deletes }) },
  ];
  for (const feature of draft.features) {
    const path = pathForFeature(profile, feature);
    assertFilePath(path);
    files.push({ path, content: json(feature.record) });
  }
  for (const picture of draft.pictures) {
    const path = pathForPicture(profile, picture);
    assertFilePath(path);
    files.push({ path, content: picture.content });
  }
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
