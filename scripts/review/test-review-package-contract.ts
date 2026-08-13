import JSZip from 'jszip';
import {
  buildReviewPackageArtifact,
  calculateReviewPackageDigest,
  createReviewRevisionUploadRequest,
  createReviewSubmissionIdentity,
  normalizeReviewPackageDeleteMarks,
  parseReviewPackageBlob,
  validateParsedReviewPackage,
  type ReviewPackageProfile,
} from '../../src/components/Review';

const profile: ReviewPackageProfile = {
  profileId: 'test-profile',
  featureRoot: 'Features',
  pictureRoot: 'Pictures',
  indexPath: 'INDEX.json',
  reviewPath: 'Review.json',
  deletePath: 'Delete.json',
  toolRefreshRoot: 'Tool_Refresh',
  nestedKindClasses: ['ISG'],
};

const artifact = await buildReviewPackageArtifact(profile, {
  packageName: 'test-package',
  operator: 'tester',
  note: 'contract test',
  exportedAt: '2026-08-13T00:00:00.000Z',
  packageVersion: 'draft-test',
  sourceSnapshot: { releaseId: 'release-a', formalVersion: 1, technicalId: 'technical-a', resolvedAt: '2026-08-13T00:00:00.000Z' },
  features: [{ worldId: 'world-a', classCode: 'BUD', featureId: 'feature-a', record: { ID: 'feature-a', Class: 'BUD' } }],
  pictures: [],
  deletes: [{ ID: 'feature-b', Name: 'Feature B', worldId: 'world-a', classCode: 'BUD' }],
});
if (!artifact.files.some((file) => file.path === 'Review.json')) throw new Error('review marker not generated');
if (!artifact.files.some((file) => file.path === 'Features/world-a/BUD/feature-a.json')) throw new Error('feature path not generated');
const parsed = await parseReviewPackageBlob(artifact.blob, profile);
const strict = validateParsedReviewPackage(parsed, profile, 'strict-submission');
if (!strict.valid || parsed.features.length !== 1 || parsed.deletes.length !== 1) throw new Error(`strict package validation failed: ${strict.errors.map((entry) => entry.code).join(',')}`);
const digest = await calculateReviewPackageDigest(artifact.blob);
if (digest.byteLength !== artifact.blob.size || !/^[a-f0-9]{64}$/.test(digest.sha256) || !/^[A-Za-z0-9+/]{22}==$/.test(digest.contentMd5)) throw new Error('digest generation failed');
const identity = createReviewSubmissionIdentity({ submissionId: 'submission-test', clock: () => new Date('2026-08-13T00:00:00.000Z') });
const request = await createReviewRevisionUploadRequest({ artifact, identity, expectedStateVersion: 0 });
if (request.packageName !== 'test-package' || request.submissionId !== 'submission-test' || request.byteLength !== artifact.blob.size) throw new Error('revision upload request failed');

const legacyZip = new JSZip();
legacyZip.file('legacy/INDEX.json', JSON.stringify({ featureCount: 1, pictureCount: 0, deleteCount: 1 }));
legacyZip.file('legacy/Delete.json', JSON.stringify({ items: [{ ID: 'legacy-delete' }] }));
legacyZip.file('legacy/Features/world-a/BUD/feature-a.json', JSON.stringify({ ID: 'feature-a', Class: 'BUD' }));
const legacy = await parseReviewPackageBlob(await legacyZip.generateAsync({ type: 'blob' }), profile);
const compatible = validateParsedReviewPackage(legacy, profile, 'compat-import');
const legacyStrict = validateParsedReviewPackage(legacy, profile, 'strict-submission');
if (!compatible.valid || compatible.warnings.length < 2 || legacyStrict.valid) throw new Error('legacy compatibility modes failed');
const normalized = normalizeReviewPackageDeleteMarks([{ ID: 'legacy-delete' }], [{ ID: 'legacy-delete', worldId: 'world-a', classCode: 'BUD' }]);
if (normalized.deletes[0]?.worldId !== 'world-a' || normalized.deletes[0]?.classCode !== 'BUD') throw new Error('legacy delete normalization failed');
console.log('Review package contract test: PASS');
