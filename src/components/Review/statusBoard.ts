import type { ReviewAuthorizationContext, ReviewSubmissionState } from './contracts';

/**
 * The board is deliberately separate from package revisions. A decision is
 * made for one explicit revision, while the logical submission keeps one
 * current status. Switching the viewed revision never silently transfers a
 * decision to that revision.
 */
export type ReviewStatusBoardState = Extract<ReviewSubmissionState, 'pending' | 'approved' | 'rejected' | 'archived'>;
export type ReviewStatusDecisionAction = 'approve' | 'reject' | 'request-changes' | 'archive' | 'reopen';

export type ReviewStatusBoardEntry = {
  submissionId: string;
  state: ReviewStatusBoardState;
  /** The exact revision the reviewer inspected when the state was saved. */
  decisionRevisionId: string | null;
  /** Keeps reject and request-changes distinct while sharing the rejected lamp. */
  decisionAction?: ReviewStatusDecisionAction;
  updatedAt: string;
  updatedBy: ReviewAuthorizationContext;
  reason?: string;
};

export type ReviewStatusBoardSnapshot = {
  schemaVersion: 'cairn.review-status-board.v1';
  /** Conditional-write generation. It changes only after a board save. */
  boardVersion: number;
  entries: readonly ReviewStatusBoardEntry[];
  updatedAt: string;
};

export type ReviewStatusBoardDraft = {
  baseBoardVersion: number;
  entries: readonly ReviewStatusBoardEntry[];
};

export type ReviewStatusBoardDifference = {
  submissionId: string;
  local: ReviewStatusBoardEntry | null;
  remote: ReviewStatusBoardEntry | null;
  kind: 'missing-local' | 'missing-remote' | 'state-changed' | 'revision-changed' | 'reason-changed' | 'unchanged';
};

export type ReviewStatusBoardSaveRequest = {
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
  expectedBoardVersion: number;
  entries: readonly ReviewStatusBoardEntry[];
  actor: ReviewAuthorizationContext;
  occurredAt: string;
};

export type ReviewStatusBoardSaveResult = {
  board: ReviewStatusBoardSnapshot;
  differences: readonly ReviewStatusBoardDifference[];
  /** A false value requires the caller to refresh and explicitly resolve. */
  accepted: boolean;
};

export type ReviewReleasePlanItem = {
  submissionId: string;
  state: Extract<ReviewStatusBoardState, 'approved' | 'rejected'>;
  decisionRevisionId: string;
  statusUpdatedAt: string;
};

export type ReviewReleasePlan = {
  schemaVersion: 'cairn.review-release-plan.v1';
  sourceBoardVersion: number;
  selected: readonly ReviewReleasePlanItem[];
};

function bySubmissionId(entries: readonly ReviewStatusBoardEntry[]) {
  return new Map(entries.map((entry) => [entry.submissionId, entry]));
}

export function createReviewStatusBoardDraft(board: ReviewStatusBoardSnapshot): ReviewStatusBoardDraft {
  return { baseBoardVersion: board.boardVersion, entries: board.entries.map((entry) => ({ ...entry, updatedBy: { ...entry.updatedBy } })) };
}

export function compareReviewStatusBoards(local: readonly ReviewStatusBoardEntry[], remote: readonly ReviewStatusBoardEntry[]): ReviewStatusBoardDifference[] {
  const localById = bySubmissionId(local);
  const remoteById = bySubmissionId(remote);
  const ids = [...new Set([...localById.keys(), ...remoteById.keys()])].sort();
  return ids.map((submissionId) => {
    const left = localById.get(submissionId) ?? null;
    const right = remoteById.get(submissionId) ?? null;
    if (!left) return { submissionId, local: null, remote: right, kind: 'missing-local' };
    if (!right) return { submissionId, local: left, remote: null, kind: 'missing-remote' };
    if (left.state !== right.state) return { submissionId, local: left, remote: right, kind: 'state-changed' };
    if (left.decisionRevisionId !== right.decisionRevisionId) return { submissionId, local: left, remote: right, kind: 'revision-changed' };
    if ((left.decisionAction ?? '') !== (right.decisionAction ?? '')) return { submissionId, local: left, remote: right, kind: 'state-changed' };
    if ((left.reason ?? '') !== (right.reason ?? '')) return { submissionId, local: left, remote: right, kind: 'reason-changed' };
    return { submissionId, local: left, remote: right, kind: 'unchanged' };
  });
}

/**
 * Only approved/rejected entries with an explicit reviewed revision may enter
 * a release plan. Pending and archived items stay in the queue by design.
 */
export function createReviewReleasePlan(board: ReviewStatusBoardSnapshot, submissionIds: readonly string[]): ReviewReleasePlan {
  const selectedIds = new Set(submissionIds);
  const selected = board.entries
    .filter((entry): entry is ReviewStatusBoardEntry & { decisionRevisionId: string } => selectedIds.has(entry.submissionId)
      && (entry.state === 'approved' || entry.state === 'rejected')
      && Boolean(entry.decisionRevisionId))
    .map((entry): ReviewReleasePlanItem => ({ submissionId: entry.submissionId, state: entry.state as 'approved' | 'rejected', decisionRevisionId: entry.decisionRevisionId, statusUpdatedAt: entry.updatedAt }))
    .sort((left, right) => left.statusUpdatedAt.localeCompare(right.statusUpdatedAt) || left.submissionId.localeCompare(right.submissionId));
  return { schemaVersion: 'cairn.review-release-plan.v1', sourceBoardVersion: board.boardVersion, selected };
}

export function isReviewStatusBoardDirty(draft: ReviewStatusBoardDraft, board: ReviewStatusBoardSnapshot): boolean {
  return compareReviewStatusBoards(draft.entries, board.entries).some((difference) => difference.kind !== 'unchanged');
}
