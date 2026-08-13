export type ReviewAuthSessionState = {
  status: 'anonymous' | 'authenticated' | 'expired' | 'unavailable';
  principalId?: string;
  roles?: string[];
  message?: string;
};

export interface ReviewAuthPort {
  getSession(): Promise<ReviewAuthSessionState>;
  beginLogin(): void;
  logout(): Promise<void>;
}

export function normalizeReviewAuthSession(value: unknown): ReviewAuthSessionState {
  if (!value || typeof value !== 'object') return { status: 'unavailable', message: 'Identity service returned an invalid session response.' };
  const input = value as Record<string, unknown>;
  const status = input.status;
  if (status !== 'anonymous' && status !== 'authenticated' && status !== 'expired' && status !== 'unavailable') return { status: 'unavailable', message: 'Identity service returned an unknown session state.' };
  const principalId = typeof input.principalId === 'string' && input.principalId.trim() ? input.principalId.trim() : undefined;
  const roles = Array.isArray(input.roles) ? input.roles.filter((role): role is string => typeof role === 'string' && !!role.trim()) : undefined;
  return { status, ...(principalId ? { principalId } : {}), ...(roles ? { roles } : {}), ...(typeof input.message === 'string' ? { message: input.message } : {}) };
}
