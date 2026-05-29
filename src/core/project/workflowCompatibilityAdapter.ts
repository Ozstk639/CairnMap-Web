import { resolveWorkflowRuntimeByClassCode } from './workflowRuntimeResolver';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapWorkflowCompatibilityLookup = {
  classCode: string;
  workflowId: string | null;
  runtimeMode: string | null;
  usesConfig: boolean;
  legacyFallback: boolean;
};

export function getWorkflowCompatibilityLookup(classCode: string): CairnMapWorkflowCompatibilityLookup {
  const code = normalize(classCode).toUpperCase();
  const runtime = resolveWorkflowRuntimeByClassCode(code);
  return {
    classCode: code,
    workflowId: runtime?.workflowId ?? null,
    runtimeMode: runtime?.runtimeMode ?? null,
    usesConfig: runtime?.runtimeMode === 'configPrimary' || runtime?.runtimeMode === 'specialComponentPrimary',
    legacyFallback: runtime?.legacyFallback ?? true,
  };
}
