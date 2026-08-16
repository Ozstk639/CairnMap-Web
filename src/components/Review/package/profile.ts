import { REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION, type ReviewPackageProfile } from './contracts';
import { validateReviewPackageProfile } from './validator';

/** Machine-readable schema description for application-owned JSON profiles. */
export const REVIEW_PACKAGE_PROFILE_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'cairnmap.review-package-profile.v1',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'profileId'],
  properties: {
    schemaVersion: { const: REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION },
    profileId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' },
    nestedKindClasses: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' },
    },
  },
});

/**
 * Reads only downstream classification choices. Relay directory names are
 * intentionally absent: they are locked by REVIEW_PACKAGE_LAYOUT upstream.
 */
export function parseReviewPackageProfile(value: unknown): ReviewPackageProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review-package-profile-invalid');
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(['schemaVersion', 'profileId', 'nestedKindClasses']);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) throw new Error('review-package-profile-invalid:additional-property');
  if ('nestedKindClasses' in input && !Array.isArray(input.nestedKindClasses)) throw new Error('review-package-profile-invalid:nested-kind-classes');
  const profile: ReviewPackageProfile = {
    schemaVersion: input.schemaVersion as ReviewPackageProfile['schemaVersion'],
    profileId: String(input.profileId ?? ''),
    ...(Array.isArray(input.nestedKindClasses) ? { nestedKindClasses: input.nestedKindClasses.map((item) => String(item)) } : {}),
  };
  const errors = validateReviewPackageProfile(profile).filter((issue) => issue.severity === 'error');
  if (errors.length) throw new Error(`review-package-profile-invalid:${errors.map((issue) => issue.code).join(',')}`);
  return profile;
}
