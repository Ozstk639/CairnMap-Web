import { getWorkflowBlockDefinition } from './workflowMetadata';
import type { CairnMapWorkflowBlock } from './workflowTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapWorkflowBlockValidationResult =
  | { ok: true; blockType: string }
  | { ok: false; blockType: string; reason: string };

export function isKnownWorkflowBlockType(blockType: string): boolean {
  return getWorkflowBlockDefinition(blockType) !== null;
}

export function validateWorkflowBlock(block: CairnMapWorkflowBlock): CairnMapWorkflowBlockValidationResult {
  const blockType = normalize(block.type);
  if (!blockType) return { ok: false, blockType: '', reason: 'Block type is missing.' };
  if (!isKnownWorkflowBlockType(blockType)) {
    return { ok: false, blockType, reason: `Unknown workflow block type: ${blockType}` };
  }
  if (blockType === 'fieldInput' && !normalize(block.field)) {
    return { ok: false, blockType, reason: 'fieldInput block requires field.' };
  }
  if (blockType === 'runtimeValue' && !normalize(block.key)) {
    return { ok: false, blockType, reason: 'runtimeValue block requires key.' };
  }
  if (blockType === 'relationSearch') {
    if (!Array.isArray(block.targetClassScope) || block.targetClassScope.length === 0) {
      return { ok: false, blockType, reason: 'relationSearch block requires targetClassScope.' };
    }
    if (!normalize(block.returnField)) return { ok: false, blockType, reason: 'relationSearch block requires returnField.' };
  }
  if (blockType === 'classificationPicker' && !normalize(block.classCode)) {
    return { ok: false, blockType, reason: 'classificationPicker block requires classCode.' };
  }
  if (blockType === 'component' && !normalize(block.componentKey)) {
    return { ok: false, blockType, reason: 'component block requires componentKey.' };
  }
  return { ok: true, blockType };
}

export function listWorkflowBlockComponentKeys(blocks: CairnMapWorkflowBlock[]): string[] {
  const keys = new Set<string>();
  for (const block of blocks) {
    const key = normalize(block.componentKey);
    if (key) keys.add(key);
  }
  return [...keys];
}
