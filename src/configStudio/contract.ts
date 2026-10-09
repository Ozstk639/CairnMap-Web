/** Capability revision is distinct from the user's saved package revision. */
export const NATIVE_CONFIG_REVISION = 7 as const;
export function isNativeConfigRevision(value: unknown): value is 5 | 6 | 7 { return value === 5 || value === 6 || value === 7; }
