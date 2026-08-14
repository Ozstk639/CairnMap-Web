import type {
  ReviewPackageArtifact,
  ReviewRevisionUploadRequest,
  ReviewRevisionUploadResult,
  ReviewSubmissionIdentity,
  ReviewSubmissionTransport,
} from './contracts';
import { calculateReviewPackageDigest } from './digest';

function nowSegment(clock: () => Date): string {
  return clock().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function randomSegment(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const values = new Uint8Array(6);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createReviewSubmissionIdentity(input: { submissionId?: string; revisionNumber?: number; clock?: () => Date } = {}): ReviewSubmissionIdentity {
  const clock = input.clock ?? (() => new Date());
  const submissionId = input.submissionId ?? `submission-${nowSegment(clock)}-${randomSegment()}`;
  const revisionId = `${submissionId}-r${Math.max(1, Math.floor(input.revisionNumber ?? 1))}-${randomSegment().slice(0, 8)}`;
  const correlationId = `review-${nowSegment(clock)}-${randomSegment()}`;
  const requestId = `request-${nowSegment(clock)}-${randomSegment()}`;
  return { submissionId, revisionId, requestId, correlationId, idempotencyKey: `${submissionId}:${revisionId}:upload:${correlationId}` };
}

export async function createReviewRevisionUploadRequest(input: {
  artifact: ReviewPackageArtifact;
  identity: ReviewSubmissionIdentity;
  expectedStateVersion: number;
  summary?: string;
}): Promise<ReviewRevisionUploadRequest> {
  if (!Number.isSafeInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) throw new Error('review-submission-state-version-invalid');
  const digest = await calculateReviewPackageDigest(input.artifact.blob);
  return {
    ...input.identity,
    ...digest,
    packageName: input.artifact.packageName,
    ...(input.summary ? { summary: input.summary } : {}),
    expectedStateVersion: input.expectedStateVersion,
  };
}

export async function submitReviewPackageRevision<TSubmission>(transport: ReviewSubmissionTransport<TSubmission>, request: ReviewRevisionUploadRequest, artifact: ReviewPackageArtifact): Promise<ReviewRevisionUploadResult<TSubmission>> {
  const grant = await transport.requestRevisionUpload(request);
  await transport.uploadRevision(grant, artifact.blob);
  return transport.completeRevisionUpload(request);
}
