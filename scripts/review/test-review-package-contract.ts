import JSZip from 'jszip';
import {
  buildReviewPackageArtifact,
  calculateReviewPackageDigest,
  createReviewRevisionUploadRequest,
  createReviewSubmissionIdentity,
  saveReviewPackageRevision,
  normalizeReviewPackageDeleteMarks,
  parseReviewPackageBlob,
  REVIEW_PACKAGE_LAYOUT,
  REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION,
  parseReviewPackageProfile,
  buildReviewPackageToolRefreshFiles,
  validateParsedReviewPackage,
  type ReviewPackageProfile,
} from '../../src/components/Review';

const profile: ReviewPackageProfile = {
  schemaVersion: REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION,
  profileId: 'test-profile',
  nestedKindClasses: ['ISG'],
};
const jsonProfile = parseReviewPackageProfile({ schemaVersion: REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION, profileId: 'json-profile', nestedKindClasses: ['ISG'] });
if (jsonProfile.profileId !== 'json-profile' || REVIEW_PACKAGE_LAYOUT.featureRoot !== 'Data_Spilt' || REVIEW_PACKAGE_LAYOUT.pictureRoot !== 'Picture') throw new Error('canonical Relay layout failed');
try {
  parseReviewPackageProfile({ schemaVersion: REVIEW_PACKAGE_PROFILE_SCHEMA_VERSION, profileId: 'invalid-path-override', featureRoot: 'Features' });
  throw new Error('profile path override was accepted');
} catch (error) {
  if (!(error instanceof Error) || !error.message.startsWith('review-package-profile-invalid')) throw error;
}

const artifact = await buildReviewPackageArtifact(profile, {
  packageName: 'test-package',
  operator: 'tester',
  note: 'contract test',
  exportedAt: '2026-08-13T00:00:00.000Z',
  packageVersion: 'draft-test',
  sourceSnapshot: { releaseId: 'release-a', formalVersion: 1, technicalId: 'technical-a', resolvedAt: '2026-08-13T00:00:00.000Z' },
  features: [
    { worldId: 'world-a', classCode: 'BUD', featureId: 'feature-a', record: { ID: 'feature-a', Class: 'BUD' } },
    { worldId: 'world-a', classCode: 'ISG', featureId: 'feature-kind-a', kindPath: ['gate'], record: { ID: 'feature-kind-a', Class: 'ISG' } },
  ],
  pictures: [],
  deletes: [{ ID: 'feature-b', Name: 'Feature B', worldId: 'world-a', classCode: 'BUD' }],
  extraFiles: buildReviewPackageToolRefreshFiles(),
});
if (!artifact.files.some((file) => file.path === REVIEW_PACKAGE_LAYOUT.reviewPath)) throw new Error('review marker not generated');
if (!artifact.files.some((file) => file.path === 'Data_Spilt/world-a/BUD/feature-a.json')) throw new Error('feature path not generated');
if (!artifact.files.some((file) => file.path === 'Data_Spilt/world-a/ISG/gate/feature-kind-a.json')) throw new Error('configured nested kind path not generated');
if (!artifact.files.some((file) => file.path === 'Tool_Refresh/refresh_package_meta.py')) throw new Error('tool refresh path not generated');
const parsed = await parseReviewPackageBlob(artifact.blob);
const strict = validateParsedReviewPackage(parsed, profile, 'strict-submission');
if (!strict.valid || parsed.features.length !== 2 || parsed.deletes.length !== 1) throw new Error(`strict package validation failed: ${strict.errors.map((entry) => entry.code).join(',')}`);
const digest = await calculateReviewPackageDigest(artifact.blob);
if (digest.byteLength !== artifact.blob.size || !/^[a-f0-9]{64}$/.test(digest.sha256) || !/^[A-Za-z0-9+/]{22}==$/.test(digest.contentMd5)) throw new Error('digest generation failed');
const knownDigest = await calculateReviewPackageDigest(new Blob(['hello']));
if (knownDigest.sha256 !== '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' || knownDigest.contentMd5 !== 'XUFAKrxLKna5cZ2REBfFkg==') throw new Error('digest algorithm compatibility failed');
const identity = createReviewSubmissionIdentity({ submissionId: 'submission-test', clock: () => new Date('2026-08-13T00:00:00.000Z') });
const request = await createReviewRevisionUploadRequest({ artifact, identity, expectedStateVersion: 0 });
if (request.packageName !== 'test-package' || request.submissionId !== 'submission-test' || request.byteLength !== artifact.blob.size) throw new Error('revision upload request failed');

const revisionStages: string[] = [];
let uploadedRevisionId = '';
const revisionSave = await saveReviewPackageRevision({
  artifact,
  submissionId: 'submission-test',
  revisionCount: 3,
  expectedStateVersion: 9,
  onProgress: (stage) => revisionStages.push(stage),
  transport: {
    async requestRevisionUpload(value) {
      if (value.submissionId !== 'submission-test' || !value.revisionId.startsWith('submission-test-r4-') || value.expectedStateVersion !== 9) throw new Error('revision-save-request-invalid');
      uploadedRevisionId = value.revisionId;
      return { method: 'PUT', url: 'https://example.invalid/upload', headers: {}, key: 'revision.zip', expiresInSeconds: 60 };
    },
    async uploadRevision(_grant, blob) {
      if (blob.size !== artifact.blob.size) throw new Error('revision-save-upload-invalid');
    },
    async completeRevisionUpload(value) {
      if (value.revisionId !== uploadedRevisionId) throw new Error('revision-save-completion-invalid');
      return { accepted: true, submission: { submissionId: value.submissionId, currentRevisionId: value.revisionId } };
    },
  },
});
if (revisionSave.submissionId !== 'submission-test' || revisionSave.revisionId !== uploadedRevisionId || revisionStages.join(',') !== 'building-request,requesting-upload,uploading,finalizing,completed') throw new Error('revision save lifecycle failed');
try {
  await saveReviewPackageRevision({ artifact, submissionId: 'submission-test', revisionCount: 0, expectedStateVersion: 0, transport: {} as any });
  throw new Error('revision save accepted invalid revision count');
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'review-revision-count-invalid') throw error;
}

const legacyZip = new JSZip();
legacyZip.file('legacy/INDEX.json', JSON.stringify({ featureCount: 1, pictureCount: 0, deleteCount: 1 }));
legacyZip.file('legacy/Delete.json', JSON.stringify({ items: [{ ID: 'legacy-delete' }] }));
legacyZip.file('legacy/Data_Spilt/world-a/BUD/feature-a.json', JSON.stringify({ ID: 'feature-a', Class: 'BUD' }));
const legacy = await parseReviewPackageBlob(await legacyZip.generateAsync({ type: 'blob' }));
const compatible = validateParsedReviewPackage(legacy, profile, 'compat-import');
const legacyStrict = validateParsedReviewPackage(legacy, profile, 'strict-submission');
if (!compatible.valid || compatible.warnings.length < 2 || legacyStrict.valid) throw new Error('legacy compatibility modes failed');
const normalized = normalizeReviewPackageDeleteMarks([{ ID: 'legacy-delete' }], [{ ID: 'legacy-delete', worldId: 'world-a', classCode: 'BUD' }]);
if (normalized.deletes[0]?.worldId !== 'world-a' || normalized.deletes[0]?.classCode !== 'BUD') throw new Error('legacy delete normalization failed');
console.log('Review package contract test: PASS');
