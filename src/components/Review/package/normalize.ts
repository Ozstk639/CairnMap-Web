import type {
  ReviewPackageDeleteLocation,
  ReviewPackageDeleteMark,
  ReviewPackageNormalizationResult,
  ReviewPackageValidationIssue,
} from './contracts';

/**
 * Adds a unique application-supplied world/class location to legacy delete
 * marks. A non-unique identity is deliberately left incomplete so strict
 * submission validation can block it rather than guessing a destructive target.
 */
export function normalizeReviewPackageDeleteMarks(
  deletes: readonly ReviewPackageDeleteMark[],
  locations: readonly ReviewPackageDeleteLocation[],
): ReviewPackageNormalizationResult {
  const warnings: ReviewPackageValidationIssue[] = [];
  const result: ReviewPackageDeleteMark[] = [];
  for (const deletion of deletes) {
    const ID = String(deletion.ID ?? '').trim();
    if (!ID) {
      warnings.push({ code: 'PACKAGE_DELETE_INVALID', severity: 'warning', message: 'A legacy delete marker without an ID was omitted during normalization.' });
      continue;
    }
    const explicitWorld = String(deletion.worldId ?? '').trim();
    const explicitClass = String(deletion.classCode ?? '').trim();
    if (explicitWorld && explicitClass) {
      result.push({ ID, ...(deletion.Name ? { Name: deletion.Name } : {}), worldId: explicitWorld, classCode: explicitClass });
      continue;
    }
    const candidates = locations.filter((location) => location.ID === ID
      && (!explicitWorld || location.worldId === explicitWorld)
      && (!explicitClass || location.classCode === explicitClass));
    if (candidates.length === 1) {
      const candidate = candidates[0];
      result.push({ ID, Name: deletion.Name || candidate.Name, worldId: candidate.worldId, classCode: candidate.classCode });
      warnings.push({ code: 'PACKAGE_LEGACY_COMPATIBILITY', severity: 'warning', message: 'A legacy delete marker was normalized using a unique local feature identity.' });
    } else {
      result.push({ ID, ...(deletion.Name ? { Name: deletion.Name } : {}), ...(explicitWorld ? { worldId: explicitWorld } : {}), ...(explicitClass ? { classCode: explicitClass } : {}) });
      warnings.push({ code: 'PACKAGE_DELETE_AMBIGUOUS', severity: 'warning', message: candidates.length ? 'A legacy delete marker matched multiple local features and was not guessed.' : 'A legacy delete marker could not be resolved locally.' });
    }
  }
  return { deletes: result, warnings };
}
