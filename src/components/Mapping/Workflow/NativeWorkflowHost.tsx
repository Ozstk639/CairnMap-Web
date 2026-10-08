import { useCallback, useRef, useState } from 'react';
import { useRuleDataStore } from '@/store/ruleDataStore';
import { V3WorkflowRunner, type V3WorkflowRunResult } from '@/configStudio/V3WorkflowRunner';
import type { ConfigPackageV3, MountedFeatureRecord, WorkflowDefinition, WorkflowStep } from '@/configStudio/types';
import type { MultipartCoord } from '@/core/geometry/multipartGeometry';
import WorkflowHost, { type WorkflowBridge, type WorkflowKey, type WorkflowRegistry } from './WorkflowHost';

export function NativeWorkflowHost({ config, workflow, bridge, registry, onCommit, onExit }: {
  config: ConfigPackageV3; workflow: WorkflowDefinition; bridge: WorkflowBridge; registry: WorkflowRegistry;
  onCommit: (config: ConfigPackageV3, workflow: WorkflowDefinition, outputs: V3WorkflowRunResult) => void;
  onExit: () => void;
}) {
  // A running workflow cannot change underneath an author saving a new package.
  const [snapshot] = useState(() => ({ config: structuredClone(config), workflow: structuredClone(workflow) }));
  const bridgeRef = useRef(bridge); bridgeRef.current = bridge;
  const previousStep = useRef<WorkflowStep>();
  const drafts = useRef(new Map<string, MultipartCoord[]>());
  const datasets = useRuleDataStore(state => state.datasets);
  const deleted = new Set(bridge.getDeleteMarkedFeatureIds?.() ?? []);
  const all = [...Object.values(datasets).flatMap(dataset => dataset.features), ...(bridge.getCommittedLayerJsonInfos?.().map(item => item.featureInfo) ?? [])];
  const records = [...new Map(all.map(raw => {
    const record = (raw.featureInfo && typeof raw.featureInfo === 'object' ? raw.featureInfo : raw) as MountedFeatureRecord;
    return [`${record.World}:${record.Class}:${record.ID}`, record] as const;
  })).values()].filter(record => !deleted.has(String(record.ID ?? '')));
  const points = () => bridgeRef.current.getTempPoints().map(point => ({ x: point.x, y: point.y ?? -64, z: point.z }));
  const switchStep = useCallback((step: WorkflowStep | undefined) => {
    const current = bridgeRef.current;
    const previous = previousStep.current;
    if (previous?.id === step?.id) return;
    if (previous?.kind === 'geometry' && previous.outputId) {
      if (previous.drawing?.keepDrawingWhenBack === false) { drafts.current.delete(previous.outputId); current.clearWorkflowPreview(`native:${previous.outputId}`); }
      else drafts.current.set(previous.outputId, points());
    }
    current.suspendDrawMode();
    if (step?.kind === 'geometry') {
      current.clearTempPoints();
      current.setTempPoints(drafts.current.get(step.outputId!) ?? []);
      current.setDrawMode(step.geometry?.[0] === 'Point' ? 'point' : step.geometry?.[0] === 'LineString' ? 'polyline' : 'polygon');
    }
    previousStep.current = step;
  }, []);
  const previewSlots = useCallback((slots: Record<string, unknown>) => {
    const actor = String(slots.actor ?? '');
    if (bridgeRef.current.getEditorId() !== actor) bridgeRef.current.setEditorId(actor);
  }, []);
  if (snapshot.workflow.mode === 'external') {
    const key = { railwayWorkflow: 'railway', stationWorkflow: 'station', tradePointWorkflow: 'trp_point' }[snapshot.workflow.external?.componentKey ?? ''] as WorkflowKey | undefined;
    return key ? <WorkflowHost workflowKey={key} bridge={bridge} registry={registry} onExit={onExit} /> : <p role="alert">外部工作流未获得受控绑定。</p>;
  }
  return <div><button type="button" className="mb-2 rounded border px-2 py-1 text-xs" onClick={onExit}>退出工作流</button><V3WorkflowRunner config={snapshot.config} workflow={snapshot.workflow} records={records} worldId={bridge.getCurrentWorldId()} initialActor={bridge.getEditorId()}
    onStepChange={switchStep} onPreviewSlotsChange={previewSlots}
    onRequestGeometry={(_outputId, geometry) => bridgeRef.current.setDrawMode(geometry === 'Point' ? 'point' : geometry === 'LineString' ? 'polyline' : 'polygon')}
    onCaptureGeometry={(outputId, geometry) => {
      const coords = geometry === 'Point' ? points().slice(0, 1) : points();
      drafts.current.set(outputId, coords);
      bridgeRef.current.upsertWorkflowPreview(`native:${outputId}`, geometry === 'Point' ? 'point' : geometry === 'LineString' ? 'polyline' : 'polygon', coords);
      bridgeRef.current.suspendDrawMode();
      return coords;
    }}
    onSubmit={outputs => { onCommit(snapshot.config, snapshot.workflow, outputs); onExit(); }}
  /></div>;
}
