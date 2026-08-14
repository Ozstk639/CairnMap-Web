import {
  REVIEW_PACKAGE_CONTRACT_VERSION,
  REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION,
  type ParsedReviewPackage,
  type ReviewPackageDraft,
  type ReviewPackageProfile,
  type ReviewPackageValidationIssue,
  type ReviewPackageValidationMode,
  type ReviewPackageValidationReport,
} from './contracts';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FORBIDDEN_REVIEW_FIELDS = new Set(['approved', 'decision', 'reviewer', 'reviewedAt', 'history', 'precheck', 'accept', 'publishedAt', 'releaseId']);

function issue(code: ReviewPackageValidationIssue['code'], severity: ReviewPackageValidationIssue['severity'], message: string, path?: string): ReviewPackageValidationIssue {
  return { code, severity, message, ...(path ? { path } : {}) };
}

function isSafeSegment(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SEGMENT.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')) return false;
  return value.split('/').every((part) => isSafeSegment(part));
}

function expectedProfilePaths(profile: ReviewPackageProfile): string[] {
  return [profile.featureRoot, profile.pictureRoot, profile.indexPath, profile.reviewPath, profile.deletePath, profile.toolRefreshRoot ?? ''];
}

export function validateReviewPackageProfile(profile: ReviewPackageProfile): ReviewPackageValidationIssue[] {
  const errors: ReviewPackageValidationIssue[] = [];
  if (!isSafeSegment(profile.profileId)) errors.push(issue('PROFILE_INVALID', 'error', 'Package profile id is invalid.'));
  for (const path of expectedProfilePaths(profile)) {
    if (!path) continue;
    if (!isSafeRelativePath(path)) errors.push(issue('PROFILE_INVALID', 'error', `Package profile path is invalid: ${path}`));
  }
  const distinct = new Set([profile.indexPath, profile.reviewPath, profile.deletePath]);
  if (distinct.size !== 3) errors.push(issue('PROFILE_INVALID', 'error', 'Index, review and delete paths must be distinct.'));
  return errors;
}

function report(mode: ReviewPackageValidationMode, issues: ReviewPackageValidationIssue[]): ReviewPackageValidationReport {
  const errors = issues.filter((entry) => entry.severity === 'error');
  const warnings = issues.filter((entry) => entry.severity === 'warning');
  return { contractVersion: REVIEW_PACKAGE_CONTRACT_VERSION, mode, valid: errors.length === 0, errors, warnings };
}

export function validateReviewPackageDraft(draft: ReviewPackageDraft, profile: ReviewPackageProfile, mode: Extract<ReviewPackageValidationMode, 'normalize-on-export' | 'strict-submission'> = 'strict-submission'): ReviewPackageValidationReport {
  const issues = validateReviewPackageProfile(profile);
  if (!String(draft.packageName ?? '').trim()) issues.push(issue('PACKAGE_NAME_INVALID', 'error', 'Package name is required.'));
  const featureKeys = new Set<string>();
  for (const feature of draft.features) {
    const fields = [feature.worldId, feature.classCode, feature.featureId, ...(feature.kindPath ?? [])];
    if (!fields.every(isSafeSegment) || !feature.record || typeof feature.record !== 'object' || Array.isArray(feature.record)) {
      issues.push(issue('PACKAGE_FEATURE_INVALID', 'error', 'A feature has an invalid identity or record.'));
      continue;
    }
    const key = `${feature.worldId}\u0000${feature.classCode}\u0000${feature.featureId}`;
    if (featureKeys.has(key)) issues.push(issue('PACKAGE_FEATURE_DUPLICATE', 'error', 'The package has duplicate feature identities.'));
    featureKeys.add(key);
  }
  if (draft.features.length === 0 && draft.deletes.length === 0) issues.push(issue('PACKAGE_CONTENT_INVALID', 'error', 'A package must contain at least one upsert or delete.'));
  const deleteKeys = new Set<string>();
  for (const deletion of draft.deletes) {
    if (!isSafeSegment(deletion.ID)) {
      issues.push(issue('PACKAGE_DELETE_INVALID', 'error', 'A delete marker has no valid feature identity.'));
      continue;
    }
    const hasWorld = deletion.worldId !== undefined && deletion.worldId !== '';
    const hasClass = deletion.classCode !== undefined && deletion.classCode !== '';
    if ((hasWorld && !isSafeSegment(deletion.worldId)) || (hasClass && !isSafeSegment(deletion.classCode))) {
      issues.push(issue('PACKAGE_DELETE_INVALID', 'error', 'A delete marker has an invalid world or class identity.'));
      continue;
    }
    if (mode === 'strict-submission' && (!hasWorld || !hasClass)) issues.push(issue('PACKAGE_DELETE_AMBIGUOUS', 'error', 'A submitted delete marker must specify worldId and classCode.'));
    else if (!hasWorld || !hasClass) issues.push(issue('PACKAGE_LEGACY_COMPATIBILITY', 'warning', 'A legacy delete marker lacks worldId or classCode and will be normalized when possible.'));
    const key = `${deletion.worldId ?? ''}\u0000${deletion.classCode ?? ''}\u0000${deletion.ID}`;
    if (deleteKeys.has(key)) issues.push(issue('PACKAGE_DELETE_AMBIGUOUS', 'error', 'The package has duplicate delete markers.'));
    deleteKeys.add(key);
  }
  return report(mode, issues);
}

function pathStartsWith(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function validateParsedReviewPackage(parsed: ParsedReviewPackage, profile: ReviewPackageProfile, mode: ReviewPackageValidationMode): ReviewPackageValidationReport {
  const issues = [...validateReviewPackageProfile(profile), ...parsed.parseWarnings];
  const compat = mode === 'compat-import' || mode === 'normalize-on-export';
  const required = [profile.indexPath, profile.reviewPath, profile.deletePath];
  const found = new Set<string>();
  if (parsed.paths.includes(profile.indexPath)) found.add(profile.indexPath);
  if (parsed.paths.includes(profile.reviewPath)) found.add(profile.reviewPath);
  if (parsed.paths.includes(profile.deletePath)) found.add(profile.deletePath);
  for (const path of required) {
    if (!found.has(path)) issues.push(issue('PACKAGE_REQUIRED_FILE_MISSING', compat ? 'warning' : 'error', `Required package file is missing: ${path}`, path));
  }
  const marker = parsed.reviewMarker;
  if (marker) {
    if (marker.schemaVersion !== REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION || marker.status !== 'pending' || marker.submissionMode !== 'review-submission-v2' || typeof marker.exportedAt !== 'string') {
      issues.push(issue('PACKAGE_REVIEW_MARKER_INVALID', compat ? 'warning' : 'error', 'Review marker is not a valid pending submission marker.', profile.reviewPath));
    }
    for (const key of Object.keys(marker)) {
      if (FORBIDDEN_REVIEW_FIELDS.has(key)) issues.push(issue('PACKAGE_REVIEW_MARKER_FORBIDDEN_FIELD', compat ? 'warning' : 'error', `Review marker contains a server-owned field: ${key}`, profile.reviewPath));
    }
  }
  const manifest = parsed.manifest;
  if (manifest) {
    if (manifest.relayPackageContractVersion !== REVIEW_PACKAGE_CONTRACT_VERSION) issues.push(issue('PACKAGE_LEGACY_COMPATIBILITY', compat ? 'warning' : 'error', 'Package does not declare the current relay package contract version.', profile.indexPath));
    const counts: Array<[string, number]> = [['featureCount', parsed.features.length], ['pictureCount', parsed.pictures.length], ['deleteCount', parsed.deletes.length]];
    for (const [field, actual] of counts) {
      if (Number.isSafeInteger(manifest[field]) && manifest[field] !== actual) issues.push(issue('PACKAGE_COUNT_MISMATCH', compat ? 'warning' : 'error', `Manifest ${field} does not match package content.`, profile.indexPath));
    }
  }
  for (const deletion of parsed.deletes) {
    const fullyLocated = isSafeSegment(deletion.ID) && isSafeSegment(deletion.worldId) && isSafeSegment(deletion.classCode);
    if (!fullyLocated) issues.push(issue('PACKAGE_DELETE_AMBIGUOUS', compat ? 'warning' : 'error', 'A delete marker is missing a complete feature location.', profile.deletePath));
  }
  for (const path of parsed.extraPaths) {
    if (profile.toolRefreshRoot && pathStartsWith(path, profile.toolRefreshRoot)) continue;
    issues.push(issue('PACKAGE_PATH_UNRECOGNIZED', compat ? 'warning' : 'error', 'Package contains an unrecognized path.', path));
  }
  return report(mode, issues);
}

export function isReviewPackageSafeSegment(value: unknown): value is string {
  return isSafeSegment(value);
}
