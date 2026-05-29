import { resolveWorkflowRuntimeByClassCode } from './workflowRuntimeResolver';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapWorkflowLegacyCompatibilityRole =
  | 'configPrimary'
  | 'specialComponentExecutor'
  | 'legacyFallback'
  | 'unresolved';

export type CairnMapWorkflowLegacyCompatibilitySummary = {
  classCode: string;
  workflowId: string | null;
  role: CairnMapWorkflowLegacyCompatibilityRole;
  legacyFallback: boolean;
};

export function getWorkflowLegacyCompatibilitySummary(classCode: string): CairnMapWorkflowLegacyCompatibilitySummary {
  const code = normalize(classCode).toUpperCase();
  const runtime = resolveWorkflowRuntimeByClassCode(code);
  if (!runtime) {
    return { classCode: code, workflowId: null, role: 'unresolved', legacyFallback: true };
  }
  if (runtime.runtimeMode === 'configPrimary') {
    return { classCode: code, workflowId: runtime.workflowId, role: 'configPrimary', legacyFallback: runtime.legacyFallback };
  }
  if (runtime.runtimeMode === 'specialComponentPrimary') {
    return { classCode: code, workflowId: runtime.workflowId, role: 'specialComponentExecutor', legacyFallback: runtime.legacyFallback };
  }
  return { classCode: code, workflowId: runtime.workflowId, role: 'legacyFallback', legacyFallback: runtime.legacyFallback };
}

export function isWorkflowLegacyFallbackAllowed(classCode: string): boolean {
  return getWorkflowLegacyCompatibilitySummary(classCode).legacyFallback;
}
