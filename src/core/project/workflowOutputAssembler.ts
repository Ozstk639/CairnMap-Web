import type { CairnMapWorkflowConfig, CairnMapWorkflowOutputConfig } from './workflowTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapWorkflowOutputRuntimeSummary = {
  workflowId: string;
  mode: string;
  fieldMappingCount: number;
  computedFieldCount: number;
  tagMappingCount: number;
  extensionMappingCount: number;
  hasGeometryMapping: boolean;
};

export function getWorkflowOutputConfig(workflow: CairnMapWorkflowConfig): CairnMapWorkflowOutputConfig {
  return workflow.output ?? {};
}

export function getWorkflowOutputRuntimeSummary(workflow: CairnMapWorkflowConfig): CairnMapWorkflowOutputRuntimeSummary {
  const output = getWorkflowOutputConfig(workflow);
  return {
    workflowId: workflow.id,
    mode: normalize(output.mode) || 'shadow',
    fieldMappingCount: output.fieldMappings?.length ?? 0,
    computedFieldCount: output.computedFields?.length ?? 0,
    tagMappingCount: output.tagMappings?.length ?? 0,
    extensionMappingCount: output.extensionMappings?.length ?? 0,
    hasGeometryMapping: Boolean((output as { geometryMapping?: unknown }).geometryMapping),
  };
}

export function listWorkflowOutputPaths(workflow: CairnMapWorkflowConfig): string[] {
  const paths = new Set<string>();
  const output = getWorkflowOutputConfig(workflow);
  for (const item of output.fieldMappings ?? []) {
    const to = normalize((item as { to?: unknown }).to);
    if (to) paths.add(to);
  }
  for (const item of output.tagMappings ?? []) {
    const outputPath = normalize((item as { outputPath?: unknown }).outputPath);
    if (outputPath) paths.add(outputPath);
  }
  for (const item of output.extensionMappings ?? []) {
    const outputPath = normalize((item as { outputPath?: unknown }).outputPath);
    if (outputPath) paths.add(outputPath);
  }
  return [...paths];
}
