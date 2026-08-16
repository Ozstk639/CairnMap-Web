import {
  parseReviewPackageBlob,
  validateParsedReviewPackage,
  type ReviewPackageValidationReport,
  CAIRNMAP_DEFAULT_REVIEW_PACKAGE_PROFILE,
} from '@/components/Review/package';
import { createEmptyRelayPackageDraft, type RelayPackageDraft, type RelayPictureBindingItem } from './relayPackageDraft';

export type ParsedRelayPackage = {
  draft: RelayPackageDraft;
  jsonItems: any[];
  isRelayPackageLike: boolean;
  rootPrefix: string;
  parsedFileCount: number;
  parsedFeatureCount: number;
  parsedPictureCount: number;
  parsedDeleteCount: number;
  validation: ReviewPackageValidationReport;
};

/**
 * Legacy import and Review preview share the generic parser. Compat mode is
 * deliberate here: old packages may lack the new Review marker, whereas formal
 * submission requires the strict mode in the package core.
 */
export async function materializeCairnReviewPackageForWorkspace(file: File): Promise<ParsedRelayPackage> {
  const parsed = await parseReviewPackageBlob(file);
  const validation = validateParsedReviewPackage(parsed, CAIRNMAP_DEFAULT_REVIEW_PACKAGE_PROFILE, 'compat-import');
  const draft = createEmptyRelayPackageDraft();
  const manifest = parsed.manifest ?? {};
  draft.meta = {
    ...draft.meta,
    operator: String(manifest.operator ?? ''),
    note: String(manifest.note ?? ''),
    draftStatus: 'imported_package',
    updatedAt: String(manifest.exportedAt ?? manifest.updatedAt ?? new Date().toISOString()),
    packageVersion: typeof manifest.version === 'string' || typeof manifest.version === 'number'
      ? manifest.version
      : (typeof manifest.packageVersion === 'string' || typeof manifest.packageVersion === 'number' ? manifest.packageVersion : undefined),
  };
  draft.deleteMarks = parsed.deletes.map((item) => ({
    ID: item.ID,
    Name: item.Name ?? '',
    ...(item.worldId ? { worldId: item.worldId } : {}),
    ...(item.classCode ? { classCode: item.classCode } : {}),
  }));

  for (const picture of parsed.pictures) {
    const fileName = picture.filename || 'image.bin';
    const source = new File([picture.content], fileName, { type: picture.content.type || 'application/octet-stream' });
    const binding: RelayPictureBindingItem = {
      uid: `${picture.featureId}:${picture.path}`,
      originalName: fileName,
      file: source,
      previewUrl: URL.createObjectURL(source),
      relativePath: picture.path,
      order: (draft.picturesById[picture.featureId]?.length ?? 0) + 1,
      source: 'imported',
    };
    draft.picturesById[picture.featureId] = [...(draft.picturesById[picture.featureId] ?? []), binding];
  }

  return {
    draft,
    jsonItems: parsed.features.map((feature) => feature.record),
    isRelayPackageLike: parsed.isPackageLike,
    rootPrefix: parsed.rootPrefix,
    parsedFileCount: parsed.paths.length,
    parsedFeatureCount: parsed.features.length,
    parsedPictureCount: parsed.pictures.length,
    parsedDeleteCount: parsed.deletes.length,
    validation,
  };
}

/** @deprecated Use materializeCairnReviewPackageForWorkspace for new callers. */
export const parseRelayPackageZip = materializeCairnReviewPackageForWorkspace;
