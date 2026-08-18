import { canTransitionReviewSubmission, canTransitionReviewWorkflow, createIdleReviewReleaseGate, createReviewSubmissionIdempotencyKey, createReviewWorkflowIdempotencyKey, createReviewWorkspaceAdapterRegistry, emptyReviewWorkspaceSession, hasExpectedReviewSubmissionStateVersion, isReviewSubmissionActionAllowed, loadReviewWorkspaceSession, markReviewWorkspaceDirty, preflightReviewRelease, recordReviewWorkspaceIntent, ReviewOperationError, serializeReviewReleasePreflightReport, targetStateForReviewIntent, type TemporaryLayerPort } from '../../src/components/Review';

const layers: TemporaryLayerPort = { mount() {}, clear() {} };
const registry = createReviewWorkspaceAdapterRegistry();
registry.register('local-adapter', { temporaryLayers: layers });
if (!registry.resolve('local-adapter') || registry.resolve('missing')) throw new Error('adapter registry resolution failed');
const loaded = loadReviewWorkspaceSession({ packageId: 'relay-1', worldId: 'demo', source: 'local-file', featureCount: 1, deleteCount: 0, pictureCount: 0 });
if (!markReviewWorkspaceDirty(loaded).dirty) throw new Error('dirty session state failed');
const intent = recordReviewWorkspaceIntent(markReviewWorkspaceDirty(loaded), 'approve', '2026-01-01T00:00:00.000Z');
if (intent.dirty || intent.lastIntent?.kind !== 'approve') throw new Error('intent state failed');
if (emptyReviewWorkspaceSession().package !== null) throw new Error('empty session failed');
if (!canTransitionReviewWorkflow('precheck-passed', 'awaiting-approval') || canTransitionReviewWorkflow('draft', 'completed')) throw new Error('workflow transition guard failed');
if (targetStateForReviewIntent('approve') !== 'awaiting-approval') throw new Error('intent target failed');
if (createReviewWorkflowIdempotencyKey({ packageId: 'relay-1', intent: 'submit', correlationId: 'c-1' }) !== 'relay-1:submit:c-1') throw new Error('idempotency key failed');
if (!canTransitionReviewSubmission('pending', 'approved') || canTransitionReviewSubmission('mirrored', 'pending')) throw new Error('submission transition guard failed');
if (!isReviewSubmissionActionAllowed('pending', 'save') || isReviewSubmissionActionAllowed('approved', 'save')) throw new Error('submission action guard failed');
if (!hasExpectedReviewSubmissionStateVersion(4, 4) || hasExpectedReviewSubmissionStateVersion(4, 5)) throw new Error('state version guard failed');
if (createReviewSubmissionIdempotencyKey({ submissionId: 'submission-1', targetRevisionId: 'submission-1-r2', action: 'approve', correlationId: 'c-1' }) !== 'submission-1:submission-1-r2:approve:c-1') throw new Error('submission idempotency key failed');
const idleGate = createIdleReviewReleaseGate();
if (idleGate.state !== 'idle' || idleGate.initialized !== false || idleGate.gateVersion !== 0 || idleGate.updatedAt !== undefined) throw new Error('idle release gate normalization failed');
const operationError = new ReviewOperationError({ code: 'blocked', message: 'blocked for test', retryable: true, correlationId: 'c-1', details: ['detail'] });
if (operationError.code !== 'blocked' || !operationError.retryable || operationError.correlationId !== 'c-1' || operationError.details[0] !== 'detail') throw new Error('operation error contract failed');
const warningPreflight = preflightReviewRelease({
  package: { submissionId: 'submission-1', revisionId: 'r2', sha256: 'a'.repeat(64), byteLength: 22 },
  candidate: { baseReleaseId: 'release-old', upserts: [{ worldId: 'world-a', classCode: 'BUD', featureId: 'f-1' }], deletes: [{ worldId: 'world-a', classCode: 'BUD', featureId: 'f-2' }] },
  snapshot: { snapshotId: 'snapshot-1', releaseId: 'release-current', capturedAt: '2026-07-29T00:00:00.000Z', features: [{ worldId: 'world-a', classCode: 'BUD', featureId: 'f-1' }, { worldId: 'world-a', classCode: 'BUD', featureId: 'f-2' }] },
});
if (warningPreflight.decision !== 'warning-confirmation-required' || warningPreflight.summary.updated !== 1 || warningPreflight.summary.deleted !== 1 || !warningPreflight.findings.some((entry) => entry.code === 'BASE_RELEASE_CHANGED')) throw new Error('release preflight warning handling failed');
const blockedPreflight = preflightReviewRelease({
  package: { submissionId: 'submission-1', revisionId: 'r3', sha256: 'b'.repeat(64), byteLength: 22 },
  candidate: { upserts: [], deletes: [{ featureId: 'missing' }] },
  snapshot: { snapshotId: 'snapshot-1', releaseId: 'release-current', capturedAt: '2026-07-29T00:00:00.000Z', features: [] },
});
if (blockedPreflight.decision !== 'blocked' || !blockedPreflight.findings.some((entry) => entry.code === 'DELETE_TARGET_MISSING')) throw new Error('release preflight missing-delete guard failed');
const batchDeletePreflight = preflightReviewRelease({
  package: { submissionId: 'submission-1', revisionId: 'r4', sha256: 'c'.repeat(64), byteLength: 22 },
  candidate: { upserts: [], deletes: [{ worldId: 'world-a', classCode: 'BUD', featureId: 'f-2' }] },
  selectedCandidates: [{ upserts: [], deletes: [{ worldId: 'world-a', classCode: 'BUD', featureId: 'f-2' }] }],
  snapshot: { snapshotId: 'snapshot-1', releaseId: 'release-current', capturedAt: '2026-07-29T00:00:00.000Z', features: [{ worldId: 'world-a', classCode: 'BUD', featureId: 'f-2' }] },
});
if (batchDeletePreflight.decision !== 'blocked' || !batchDeletePreflight.findings.some((entry) => entry.code === 'BATCH_DELETE_TARGET_OVERLAP')) throw new Error('release preflight batch delete guard failed');
if (serializeReviewReleasePreflightReport(warningPreflight) !== serializeReviewReleasePreflightReport(warningPreflight)) throw new Error('release preflight serialisation failed');
console.log('Review workspace contract test: PASS');
