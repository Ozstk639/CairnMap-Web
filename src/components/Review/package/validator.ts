import {
  REVIEW_PACKAGE_CONTRACT_VERSION,
  REVIEW_PACKAGE_LAYOUT,
  REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION,
  REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION,
  type ParsedReviewPackage,
  type ReviewPackageDraft,
  type ReviewPackageProfile,
  type ReviewPackageValidationIssue,
  type ReviewPackageValidationMode,
  type ReviewPackageValidationReport,
  REVIEW_PACKAGE_PICTURE_BINDINGS_SCHEMA_VERSION,
} from './contracts';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FORBIDDEN_REVIEW_FIELDS = new Set(['approved', 'decision', 'reviewer', 'reviewedAt', 'history', 'precheck', 'accept', 'publishedAt', 'releaseId']);

function issue(code: ReviewPackageValidationIssue['code'], severity: ReviewPackageValidationIssue['severity'], message: string, path?: string): ReviewPackageValidationIssue {
  return { code, severity, message, ...(path ? { path } : {}) };
}

function isSafeSegment(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SEGMENT.test(value);
}

export function validateReviewPackageProfile(profile: ReviewPackageProfile): ReviewPackageValidationIssue[] {
  const errors: ReviewPackageValidationIssue[] = [];
  if (profile.schemaVersion !== REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION) errors.push(issue('PROFILE_INVALID', 'error', 'Package profile schema version is invalid.'));
  if (!isSafeSegment(profile.profileId)) errors.push(issue('PROFILE_INVALID', 'error', 'Package profile id is invalid.'));
  const classes = profile.nestedKindClasses ?? [];
  if (!Array.isArray(classes) || !classes.every(isSafeSegment) || new Set(classes).size !== classes.length) errors.push(issue('PROFILE_INVALID', 'error', 'Nested-kind classes must be unique safe class codes.'));
  return errors;
}

function validateKindPath(classCode: string, kindPath: readonly string[], profile: ReviewPackageProfile, compat: boolean, path?: string): ReviewPackageValidationIssue | null {
  if (!kindPath.length || (profile.nestedKindClasses ?? []).includes(classCode)) return null;
  return issue('PACKAGE_PATH_UNRECOGNIZED', compat ? 'warning' : 'error', `Class ${classCode} is not configured to use a nested kind path.`, path);
}

/**
 * Converts application-provided classification metadata into the one Relay
 * directory shape permitted by the active package Profile.  A raw `Kind`
 * value remains part of the feature record, but only classes explicitly
 * configured by the Profile may expose it as a directory segment.
 */
export function normalizeReviewPackageKindPath(profile: ReviewPackageProfile, classCode: string, kindPath: readonly string[] | undefined): string[] {
  return (profile.nestedKindClasses ?? []).includes(classCode) ? [...(kindPath ?? [])] : [];
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
    const effectiveKindPath = normalizeReviewPackageKindPath(profile, feature.classCode, feature.kindPath);
    const fields = [feature.worldId, feature.classCode, feature.featureId, ...effectiveKindPath];
    if (!fields.every(isSafeSegment) || !feature.record || typeof feature.record !== 'object' || Array.isArray(feature.record)) {
      issues.push(issue('PACKAGE_FEATURE_INVALID', 'error', 'A feature has an invalid identity or record.'));
      continue;
    }
    const key = `${feature.worldId}\u0000${feature.classCode}\u0000${feature.featureId}`;
    if (featureKeys.has(key)) issues.push(issue('PACKAGE_FEATURE_DUPLICATE', 'error', 'The package has duplicate feature identities.'));
    featureKeys.add(key);
  }
  const pictureOrders = new Map<string, Set<number>>();
  for (const picture of draft.pictures) {
    const effectiveKindPath = normalizeReviewPackageKindPath(profile, picture.classCode, picture.kindPath);
    const fields = [picture.worldId, picture.classCode, picture.featureId, picture.filename, ...effectiveKindPath];
    const key = `${picture.worldId}\u0000${picture.classCode}\u0000${picture.featureId}`;
    if (!fields.every(isSafeSegment) || !(picture.content instanceof Blob) || !featureKeys.has(key)) {
      issues.push(issue('PACKAGE_PICTURE_BINDING_INVALID', 'error', 'A picture has an invalid identity, content, or target feature.'));
      continue;
    }
    if (picture.order !== undefined) {
      if (!Number.isSafeInteger(picture.order) || picture.order < 1) {
        issues.push(issue('PACKAGE_PICTURE_BINDING_INVALID', 'error', 'A picture order must be a positive integer.'));
        continue;
      }
      const orders = pictureOrders.get(key) ?? new Set<number>();
      if (orders.has(picture.order)) issues.push(issue('PACKAGE_PICTURE_BINDING_INVALID', 'error', 'A feature has duplicate picture orders.'));
      orders.add(picture.order);
      pictureOrders.set(key, orders);
    }
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
  const required = [REVIEW_PACKAGE_LAYOUT.indexPath, REVIEW_PACKAGE_LAYOUT.reviewPath, REVIEW_PACKAGE_LAYOUT.deletePath];
  const found = new Set<string>();
  if (parsed.paths.includes(REVIEW_PACKAGE_LAYOUT.indexPath)) found.add(REVIEW_PACKAGE_LAYOUT.indexPath);
  if (parsed.paths.includes(REVIEW_PACKAGE_LAYOUT.reviewPath)) found.add(REVIEW_PACKAGE_LAYOUT.reviewPath);
  if (parsed.paths.includes(REVIEW_PACKAGE_LAYOUT.deletePath)) found.add(REVIEW_PACKAGE_LAYOUT.deletePath);
  for (const path of required) {
    if (!found.has(path)) issues.push(issue('PACKAGE_REQUIRED_FILE_MISSING', compat ? 'warning' : 'error', `Required package file is missing: ${path}`, path));
  }
  const marker = parsed.reviewMarker;
  if (marker) {
    if (marker.schemaVersion !== REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION || marker.status !== 'pending' || marker.submissionMode !== 'review-submission-v2' || typeof marker.exportedAt !== 'string') {
      issues.push(issue('PACKAGE_REVIEW_MARKER_INVALID', compat ? 'warning' : 'error', 'Review marker is not a valid pending submission marker.', REVIEW_PACKAGE_LAYOUT.reviewPath));
    }
    for (const key of Object.keys(marker)) {
      if (FORBIDDEN_REVIEW_FIELDS.has(key)) issues.push(issue('PACKAGE_REVIEW_MARKER_FORBIDDEN_FIELD', compat ? 'warning' : 'error', `Review marker contains a server-owned field: ${key}`, REVIEW_PACKAGE_LAYOUT.reviewPath));
    }
  }
  const manifest = parsed.manifest;
  if (manifest) {
    if (manifest.relayPackageContractVersion !== REVIEW_PACKAGE_CONTRACT_VERSION) issues.push(issue('PACKAGE_LEGACY_COMPATIBILITY', compat ? 'warning' : 'error', 'Package does not declare the current relay package contract version.', REVIEW_PACKAGE_LAYOUT.indexPath));
    const counts: Array<[string, number]> = [['featureCount', parsed.features.length], ['pictureCount', parsed.pictures.length], ['deleteCount', parsed.deletes.length]];
    for (const [field, actual] of counts) {
      if (Number.isSafeInteger(manifest[field]) && manifest[field] !== actual) issues.push(issue('PACKAGE_COUNT_MISMATCH', compat ? 'warning' : 'error', `Manifest ${field} does not match package content.`, REVIEW_PACKAGE_LAYOUT.indexPath));
    }
  }
  if (parsed.pictureBindingPathPresent) {
    const bindingManifest = parsed.pictureBindingManifest;
    const bindingItems = bindingManifest?.bindings;
    if (bindingManifest?.schemaVersion !== REVIEW_PACKAGE_PICTURE_BINDINGS_SCHEMA_VERSION || !Array.isArray(bindingItems)) {
      issues.push(issue('PACKAGE_PICTURE_BINDING_INVALID', compat ? 'warning' : 'error', 'Picture binding index is invalid.', REVIEW_PACKAGE_LAYOUT.pictureIndexPath));
    } else {
      const featureKeys = new Set(parsed.features.map((feature) => `${feature.worldId}\u0000${feature.classCode}\u0000${feature.featureId}`));
      const actualPaths = new Set(parsed.pictures.map((picture) => picture.path));
      const boundPaths = new Set<string>();
      const bindingKeys = new Set<string>();
      for (const binding of bindingItems) {
        const value = binding && typeof binding === 'object' && !Array.isArray(binding) ? binding as Record<string, unknown> : null;
        const worldId = String(value?.worldId ?? '');
        const classCode = String(value?.classCode ?? '');
        const featureId = String(value?.featureId ?? '');
        const kindPath = value?.kindPath;
        const files = value?.files;
        const key = `${worldId}\u0000${classCode}\u0000${featureId}`;
        if (!value || ![worldId, classCode, featureId].every(isSafeSegment) || !Array.isArray(kindPath) || !kindPath.every(isSafeSegment) || !Array.isArray(files) || !featureKeys.has(key) || bindingKeys.has(key)) {
          issues.push(issue('PACKAGE_PICTURE_BINDING_INVALID', compat ? 'warning' : 'error', 'Picture binding identity is invalid.', REVIEW_PACKAGE_LAYOUT.pictureIndexPath));
          continue;
        }
        bindingKeys.add(key);
        const orders = new Set<number>();
        for (const file of files) {
          const item = file && typeof file === 'object' && !Array.isArray(file) ? file as Record<string, unknown> : null;
          const path = String(item?.path ?? '');
          const order = item?.order;
          if (!item || !actualPaths.has(path) || item.role !== 'display' || !Number.isSafeInteger(order) || Number(order) < 1 || orders.has(Number(order)) || boundPaths.has(path)) {
            issues.push(issue('PACKAGE_PICTURE_BINDING_INVALID', compat ? 'warning' : 'error', 'Picture binding file is invalid.', REVIEW_PACKAGE_LAYOUT.pictureIndexPath));
            continue;
          }
          orders.add(Number(order));
          boundPaths.add(path);
        }
      }
      if (bindingKeys.size !== featureKeys.size || boundPaths.size !== actualPaths.size) {
        issues.push(issue('PACKAGE_PICTURE_BINDING_INVALID', compat ? 'warning' : 'error', 'Picture binding index does not cover the package features and pictures exactly.', REVIEW_PACKAGE_LAYOUT.pictureIndexPath));
      }
    }
  }
  for (const deletion of parsed.deletes) {
    const fullyLocated = isSafeSegment(deletion.ID) && isSafeSegment(deletion.worldId) && isSafeSegment(deletion.classCode);
    if (!fullyLocated) issues.push(issue('PACKAGE_DELETE_AMBIGUOUS', compat ? 'warning' : 'error', 'A delete marker is missing a complete feature location.', REVIEW_PACKAGE_LAYOUT.deletePath));
  }
  for (const feature of parsed.features) {
    const kindIssue = validateKindPath(feature.classCode, feature.kindPath, profile, compat, feature.path);
    if (kindIssue) issues.push(kindIssue);
  }
  for (const picture of parsed.pictures) {
    const kindIssue = validateKindPath(picture.classCode, picture.kindPath, profile, compat, picture.path);
    if (kindIssue) issues.push(kindIssue);
  }
  for (const path of parsed.extraPaths) {
    if (pathStartsWith(path, REVIEW_PACKAGE_LAYOUT.toolRefreshRoot)) continue;
    issues.push(issue('PACKAGE_PATH_UNRECOGNIZED', compat ? 'warning' : 'error', 'Package contains an unrecognized path.', path));
  }
  return report(mode, issues);
}

export function isReviewPackageSafeSegment(value: unknown): value is string {
  return isSafeSegment(value);
}
