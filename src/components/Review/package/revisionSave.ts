import type {
  ReviewPackageArtifact,
  ReviewRevisionUploadResult,
  ReviewSubmissionTransport,
} from './contracts';
import {
  createReviewRevisionUploadRequest,
  createReviewSubmissionIdentity,
} from './submissionTransport';

/**
 * Provider-neutral lifecycle checkpoints for saving an edited review package.
 * Hosts may render these as progress UI, but the core performs no UI work.
 */
export type ReviewRevisionSaveStage =
  | 'building-request'
  | 'requesting-upload'
  | 'uploading'
  | 'finalizing'
  | 'completed';

export type ReviewRevisionSaveInput<TSubmission = unknown> = {
  /** The immutable ZIP generated from the current review workspace. */
  artifact: Pick<ReviewPackageArtifact, 'blob' | 'packageName'>;
  /** The logical package being edited. A save must never create a second submission. */
  submissionId: string;
  /** Number of revisions already known by the caller. */
  revisionCount: number;
  /** Conditional-write version read with the selected package revision. */
  expectedStateVersion: number;
  summary?: string;
  transport: ReviewSubmissionTransport<TSubmission>;
  onProgress?: (stage: ReviewRevisionSaveStage) => void;
};

export type ReviewRevisionSaveResult<TSubmission = unknown> = {
  submissionId: string;
  revisionId: string;
  requestId: string;
  correlationId: string;
  expectedStateVersion: number;
  result: ReviewRevisionUploadResult<TSubmission>;
};

function requiredText(value: unknown, error: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(error);
  return text;
}

/**
 * Saves an immutable replacement revision for an existing review submission.
 *
 * The caller owns authentication, confirmation UI, and provider binding. This
 * function intentionally does not mark a workspace clean: that may happen
 * only after this promise resolves successfully at the host boundary.
 */
export async function saveReviewPackageRevision<TSubmission = unknown>(input: ReviewRevisionSaveInput<TSubmission>): Promise<ReviewRevisionSaveResult<TSubmission>> {
  const submissionId = requiredText(input.submissionId, 'review-revision-submission-id-required');
  if (!Number.isSafeInteger(input.revisionCount) || input.revisionCount < 1) throw new Error('review-revision-count-invalid');
  if (!Number.isSafeInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) throw new Error('review-submission-state-version-invalid');

  input.onProgress?.('building-request');
  const identity = createReviewSubmissionIdentity({
    submissionId,
    revisionNumber: input.revisionCount + 1,
  });
  const request = await createReviewRevisionUploadRequest({
    artifact: input.artifact,
    identity,
    expectedStateVersion: input.expectedStateVersion,
    summary: input.summary,
  });

  input.onProgress?.('requesting-upload');
  const grant = await input.transport.requestRevisionUpload(request);
  input.onProgress?.('uploading');
  await input.transport.uploadRevision(grant, input.artifact.blob);
  input.onProgress?.('finalizing');
  const result = await input.transport.completeRevisionUpload(request);
  input.onProgress?.('completed');

  return {
    submissionId,
    revisionId: identity.revisionId,
    requestId: identity.requestId,
    correlationId: identity.correlationId,
    expectedStateVersion: input.expectedStateVersion,
    result,
  };
}
