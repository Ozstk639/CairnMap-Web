/**
 * Versioned, provider-neutral content contract for a review relay package.
 *
 * This contract describes only the submitted ZIP artifact.  It is deliberately
 * separate from runtime-data schemas, release manifests and provider-owned
 * review state.
 */
export const REVIEW_PACKAGE_CONTRACT_VERSION = 'cairnmap.review-package.v1';
export const REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION = 'cairnmap.native-relay-review.v1';

export type ReviewPackageValidationMode = 'compat-import' | 'normalize-on-export' | 'strict-submission' | 'strict-execution';

export type ReviewPackageProfile = {
  /** Local composition identifier; it is not a cloud or repository identifier. */
  profileId: string;
  featureRoot: string;
  pictureRoot: string;
  indexPath: string;
  reviewPath: string;
  deletePath: string;
  toolRefreshRoot?: string;
  /** Classes whose feature and picture paths preserve a nested kind path. */
  nestedKindClasses?: readonly string[];
};

export type ReviewPackageDeleteMark = {
  ID: string;
  Name?: string;
  worldId?: string;
  classCode?: string;
};

/** Application-provided identity facts used to normalize a legacy delete mark. */
export type ReviewPackageDeleteLocation = {
  ID: string;
  Name?: string;
  worldId: string;
  classCode: string;
};

export type ReviewPackageNormalizationResult = {
  deletes: ReviewPackageDeleteMark[];
  warnings: ReviewPackageValidationIssue[];
};

export type ReviewPackageSourceSnapshot = {
  releaseId?: string | null;
  formalVersion?: number | null;
  technicalId?: string | null;
  resolvedAt?: string | null;
};

export type ReviewPackageFeatureInput = {
  worldId: string;
  classCode: string;
  featureId: string;
  kindPath?: readonly string[];
  record: unknown;
};

export type ReviewPackagePictureInput = {
  worldId: string;
  classCode: string;
  featureId: string;
  filename: string;
  content: Blob;
  kindPath?: readonly string[];
};

export type ReviewPackageExtraFile = {
  path: string;
  text: string;
};

export type ReviewPackageDraft = {
  packageName: string;
  operator: string;
  note: string;
  exportedAt?: string;
  packageVersion?: string | number;
  sourceSnapshot?: ReviewPackageSourceSnapshot;
  features: readonly ReviewPackageFeatureInput[];
  pictures: readonly ReviewPackagePictureInput[];
  deletes: readonly ReviewPackageDeleteMark[];
  extraFiles?: readonly ReviewPackageExtraFile[];
};

export type ReviewPackageManifest = {
  schemaVersion: string;
  relayPackageContractVersion: typeof REVIEW_PACKAGE_CONTRACT_VERSION;
  operator: string;
  note: string;
  version: string | number;
  packageVersion: string | number;
  exportedAt: string;
  featureCount: number;
  pictureCount: number;
  deleteCount: number;
  sourceSnapshot?: ReviewPackageSourceSnapshot;
};

export type ReviewPackageReviewMarker = {
  schemaVersion: typeof REVIEW_PACKAGE_REVIEW_SCHEMA_VERSION;
  status: 'pending';
  submissionMode: 'review-submission-v2';
  exportedAt: string;
};

export type ReviewPackageFile = {
  path: string;
  content: string | Blob;
};

export type ReviewPackageArtifact = {
  contractVersion: typeof REVIEW_PACKAGE_CONTRACT_VERSION;
  packageName: string;
  blob: Blob;
  manifest: ReviewPackageManifest;
  reviewMarker: ReviewPackageReviewMarker;
  files: readonly Pick<ReviewPackageFile, 'path'>[];
};

export type ParsedReviewPackageFeature = {
  path: string;
  worldId: string;
  classCode: string;
  featureId: string;
  kindPath: string[];
  record: unknown;
};

export type ParsedReviewPackagePicture = {
  path: string;
  worldId: string;
  classCode: string;
  featureId: string;
  kindPath: string[];
  filename: string;
  content: Blob;
};

export type ParsedReviewPackage = {
  rootPrefix: string;
  isPackageLike: boolean;
  /** Normalized archive paths, without an optional single wrapper directory. */
  paths: string[];
  manifest: Record<string, unknown> | null;
  reviewMarker: Record<string, unknown> | null;
  deletes: ReviewPackageDeleteMark[];
  features: ParsedReviewPackageFeature[];
  pictures: ParsedReviewPackagePicture[];
  extraPaths: string[];
  parseWarnings: ReviewPackageValidationIssue[];
};

export type ReviewPackageValidationCode =
  | 'PROFILE_INVALID'
  | 'PACKAGE_NAME_INVALID'
  | 'PACKAGE_REQUIRED_FILE_MISSING'
  | 'PACKAGE_REVIEW_MARKER_INVALID'
  | 'PACKAGE_REVIEW_MARKER_FORBIDDEN_FIELD'
  | 'PACKAGE_PATH_INVALID'
  | 'PACKAGE_PATH_UNRECOGNIZED'
  | 'PACKAGE_FEATURE_INVALID'
  | 'PACKAGE_FEATURE_DUPLICATE'
  | 'PACKAGE_DELETE_INVALID'
  | 'PACKAGE_DELETE_AMBIGUOUS'
  | 'PACKAGE_COUNT_MISMATCH'
  | 'PACKAGE_CONTENT_INVALID'
  | 'PACKAGE_LEGACY_COMPATIBILITY';

export type ReviewPackageValidationIssue = {
  code: ReviewPackageValidationCode;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
};

export type ReviewPackageValidationReport = {
  contractVersion: typeof REVIEW_PACKAGE_CONTRACT_VERSION;
  mode: ReviewPackageValidationMode;
  valid: boolean;
  errors: ReviewPackageValidationIssue[];
  warnings: ReviewPackageValidationIssue[];
};

export type ReviewPackageDigest = {
  byteLength: number;
  sha256: string;
  contentMd5: string;
};

export type ReviewSubmissionIdentity = {
  submissionId: string;
  revisionId: string;
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
};

export type ReviewRevisionUploadRequest = ReviewSubmissionIdentity & ReviewPackageDigest & {
  packageName: string;
  summary?: string;
  expectedStateVersion: number;
};

export type ReviewRevisionUploadGrant = {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  key: string;
  expiresInSeconds: number;
};

export type ReviewRevisionUploadResult<TSubmission = unknown> = {
  accepted: boolean;
  alreadySubmitted?: boolean;
  submission: TSubmission;
};

/**
 * The application owns endpoint and provider details.  Core code only knows
 * the two-phase upload protocol and never reaches a storage provider itself.
 */
export interface ReviewSubmissionTransport<TSubmission = unknown> {
  requestRevisionUpload(request: ReviewRevisionUploadRequest): Promise<ReviewRevisionUploadGrant>;
  uploadRevision(grant: ReviewRevisionUploadGrant, artifact: Blob): Promise<void>;
  completeRevisionUpload(request: ReviewRevisionUploadRequest): Promise<ReviewRevisionUploadResult<TSubmission>>;
}
