import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareReviewStatusBoards,
  createReviewReleasePlan,
  isReviewReleaseGateLeaseActive,
  isReviewReleaseGateLeaseExpired,
} from '../../src/components/Review/statusBoard';

const reviewer = { principalId: 'reviewer-1', roles: ['reviewer'] };
const entry = { submissionId: 'package-a', state: 'approved' as const, decisionRevisionId: 'r1', decisionAction: 'approve' as const, updatedAt: '2026-08-16T00:00:00.000Z', updatedBy: reviewer };

test('status decisions do not silently follow a newer revision', () => {
  const differences = compareReviewStatusBoards([entry], [{ ...entry, decisionRevisionId: 'r2' }]);
  assert.equal(differences[0]?.kind, 'revision-changed');
});

test('release plan preserves status-save time order and ignores pending items', () => {
  const plan = createReviewReleasePlan({ schemaVersion: 'cairn.review-status-board.v1', boardVersion: 4, updatedAt: '2026-08-16T00:00:00.000Z', entries: [
    { ...entry, submissionId: 'later', updatedAt: '2026-08-16T01:00:00.000Z' },
    { ...entry, submissionId: 'early', updatedAt: '2026-08-16T00:30:00.000Z' },
    { ...entry, submissionId: 'pending', state: 'pending' as const, decisionRevisionId: null, decisionAction: 'reopen' as const },
  ] }, ['later', 'early', 'pending']);
  assert.deepEqual(plan.selected.map((item) => item.submissionId), ['early', 'later']);
});

test('only a non-expired active release-gate lease blocks a retry', () => {
  const now = Date.parse('2026-08-20T00:00:00.000Z');
  assert.equal(isReviewReleaseGateLeaseActive({ state: 'prechecking', leaseExpiresAt: '2026-08-20T00:01:00.000Z' }, now), true);
  assert.equal(isReviewReleaseGateLeaseExpired({ state: 'prechecking', leaseExpiresAt: '2026-08-19T23:59:59.000Z' }, now), true);
  assert.equal(isReviewReleaseGateLeaseActive({ state: 'prechecking', leaseExpiresAt: '2026-08-19T23:59:59.000Z' }, now), false);
  assert.equal(isReviewReleaseGateLeaseActive({ state: 'idle' }, now), false);
  assert.equal(isReviewReleaseGateLeaseActive({ state: 'prechecking' }, now), true);
});
