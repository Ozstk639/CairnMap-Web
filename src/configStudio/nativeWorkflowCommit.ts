import type { ConfigPackageV3, WorkflowDefinition } from './types';
import type { V3WorkflowRunResult } from './V3WorkflowRunner';
import { activeOutputIds } from './workflowDrawing';
import { normalizeV3WorldId, validateV3WorkflowRecords } from './V3WorkflowRunner';
import { readMultipartGeometry, validateMultipartGeometry } from '../core/geometry/multipartGeometry';

/** Prepare the complete batch before the map mutates any layer. */
export function prepareNativeWorkflowCommit(config: ConfigPackageV3, workflow: WorkflowDefinition, outputs: V3WorkflowRunResult, world: string) {
  if ((workflow.outputs.some(output=>output.when)||workflow.steps.some(step=>step.when))&&!outputs.executionSlots) throw new Error('条件输出缺少实际求值上下文。');
  const expected=activeOutputIds(workflow,outputs.executionSlots??{});
  if (!expected.length || outputs.length !== expected.length || outputs.some(output=>!expected.includes(output.outputId)) || new Set(outputs.map(output => output.outputId)).size !== outputs.length) throw new Error('工作流输出数量/身份不完整。');
  const issues = validateV3WorkflowRecords(config, workflow, outputs);
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'));
  const ids = new Set<string>();
  return outputs.map(output => {
    const definition = workflow.outputs.find(item => item.id === output.outputId);
    const read = readMultipartGeometry(output.record, definition?.geometry.selected ?? 'Point');
    const geometry = read.geometry;
    const geometryError = read.error || (geometry ? validateMultipartGeometry(geometry) : '缺少实际绘制几何');
    if (!definition || geometryError || geometry?.type !== definition.geometry.selected || output.geometry !== definition.geometry.selected) throw new Error(`输出 ${output.outputId}：${geometryError || '几何不一致'}`);
    if (normalizeV3WorldId(output.record.World) !== normalizeV3WorldId(world)) throw new Error('输出与当前活动世界不一致。');
    if (output.record.Class !== output.classification.class || String(output.record.Kind ?? '') !== String(output.classification.kind ?? '') || String(output.record.SKind ?? '') !== String(output.classification.skind ?? '') || String(output.record.SKind2 ?? '') !== String(output.classification.skind2 ?? '')) throw new Error('输出 record 分类不一致。');
    const id = String(output.record.ID);
    if (ids.has(id)) throw new Error(`工作流输出 ID 重复：${id}`);
    ids.add(id);
    const coords = geometry!.type === 'Point' ? geometry!.parts : geometry!.type === 'LineString' ? geometry!.parts[0] : geometry!.parts[0][0];
    return { outputId: output.outputId, record: structuredClone(output.record), geometry: geometry!, coords, mode: geometry!.type === 'Point' ? 'point' as const : geometry!.type === 'LineString' ? 'polyline' as const : 'polygon' as const };
  });
}
