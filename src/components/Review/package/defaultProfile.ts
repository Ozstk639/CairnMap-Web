import { REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION, type ReviewPackageProfile } from './contracts';

/**
 * Neutral fallback for a standalone CairnMap workbench. Applications that use
 * nested class kinds inject their own JSON profile; this default never names a
 * downstream application or class.
 */
export const CAIRNMAP_DEFAULT_REVIEW_PACKAGE_PROFILE: ReviewPackageProfile = Object.freeze({
  schemaVersion: REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION,
  profileId: 'cairnmap-default-review-package',
  nestedKindClasses: [],
});
