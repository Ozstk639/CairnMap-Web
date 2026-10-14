import {isQuickMappingWorkflow} from '@/configStudio/workflowEditing';
import { drawingKey, enabledDrawing } from '@/configStudio/workflowDrawing';
import { migrateWorkflowDrawings } from '@/configStudio/workflowDrawingMigration';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRuleDataStore } from '@/store/ruleDataStore';
import { V3WorkflowRunner, normalizeV3WorldId, type V3WorkflowRunResult } from '@/configStudio/V3WorkflowRunner';
import type { ConfigPackageV3, MountedFeatureRecord, WorkflowDefinition, WorkflowStep } from '@/configStudio/types';
import WorkflowHost, { type WorldPoint, type WorkflowBridge, type WorkflowKey, type WorkflowRegistry } from './WorkflowHost';

export function NativeWorkflowHost({ config, workflow, bridge, registry, onCommit, onExit }: {
  config: ConfigPackageV3; workflow: WorkflowDefinition; bridge: WorkflowBridge; registry: WorkflowRegistry;
  onCommit: (config: ConfigPackageV3, workflow: WorkflowDefinition, outputs: V3WorkflowRunResult) => void;
  onExit: () => void;
}) {
  // A running workflow cannot change underneath an author saving a new package.
  const [snapshot] = useState(() => ({ config: structuredClone(config), workflow: migrateWorkflowDrawings(workflow), world: normalizeV3WorldId(bridge.getCurrentWorldId()) }));
  const worldMismatch = normalizeV3WorldId(bridge.getCurrentWorldId()) !== snapshot.world;
  const bridgeRef = useRef(bridge); bridgeRef.current = bridge;
  const previousStep = useRef<WorkflowStep>();
  const drafts = useRef(new Map<string, WorldPoint[]>());
  const activeCapture = useRef<string>();
  const previousMismatch = useRef(false);
  const resumeRequired = useRef(false);
  useEffect(() => {
    const current = bridgeRef.current;
    if (worldMismatch) {
      if (!previousMismatch.current && activeCapture.current) drafts.current.set(activeCapture.current, current.getTempPoints().map(point => ({ ...point })));
      current.suspendDrawMode(); current.clearTempPoints(); resumeRequired.current = true;
    } else if (previousMismatch.current) { current.suspendDrawMode(); current.clearTempPoints(); }
    previousMismatch.current = worldMismatch;
  }, [worldMismatch]);
  const datasets = useRuleDataStore(state => state.datasets);
  const deleted = new Set(bridge.getDeleteMarkedFeatureIds?.() ?? []);
  const all = [...Object.values(datasets).flatMap(dataset => dataset.features), ...(bridge.getCommittedLayerJsonInfos?.().map(item => item.featureInfo) ?? [])];
  const records = [...new Map(all.map(raw => {
    const record = (raw.featureInfo && typeof raw.featureInfo === 'object' ? raw.featureInfo : raw) as MountedFeatureRecord;
    return [`${record.World}:${record.Class}:${record.Kind ?? ""}:${record.SKind ?? record.Skind ?? ""}:${record.SKind2 ?? record.Skind2 ?? ""}:${record.ID}`, record] as const;
  })).values()].filter(record => !deleted.has(String(record.ID ?? '')));
  const switchStep = useCallback((step: WorkflowStep | undefined) => {
    const current = bridgeRef.current;
    const previous = previousStep.current;
    if (previous?.id === step?.id) return;
    if (previous?.kind === 'geometry') {
      if (previous.drawing?.keepDrawingWhenBack === false) for (const id of [drawingKey(previous), ...(previous.drawing?.auxiliaryPoints ?? []).map(point => `auxiliary:${point.id}`)]) { drafts.current.delete(id); current.clearWorkflowPreview(`native:${id}`); }
      else drafts.current.set(activeCapture.current ?? drawingKey(previous), current.getTempPoints().map(point => ({ ...point })));
    }
    current.suspendDrawMode();
    if (step?.kind === 'geometry') {
      activeCapture.current = drawingKey(step);
      current.clearTempPoints();
      current.setTempPoints(drafts.current.get(drawingKey(step)) ?? []);
      if (step.drawing?.enabledFromThisPage !== false) current.setDrawMode(step.geometry?.[0] === 'Point' ? 'point' : step.geometry?.[0] === 'LineString' ? 'polyline' : 'polygon');
    }
    previousStep.current = step;
  }, []);
  const previewSlots = useCallback((slots: Record<string, unknown>) => {
    for(const step of snapshot.workflow.steps.filter(step=>step.kind==='geometry'))if(!enabledDrawing(step,snapshot.workflow,slots)){const key=drawingKey(step);bridgeRef.current.clearWorkflowPreview(`native:${key}`);if(activeCapture.current===key){drafts.current.set(key,bridgeRef.current.getTempPoints().map(point=>({...point})));bridgeRef.current.suspendDrawMode();bridgeRef.current.clearTempPoints();activeCapture.current=undefined;}}
    const actor = String(slots.actor ?? '');
    if (bridgeRef.current.getEditorId() !== actor) bridgeRef.current.setEditorId(actor);
  }, []);
  if(!isQuickMappingWorkflow(snapshot.workflow))return <p role="alert">此方案专供编辑或已关闭便捷测绘，不能从采集入口执行。</p>;
  if (snapshot.workflow.mode === 'external') {
    const key = { railwayWorkflow: 'railway', stationWorkflow: 'station', tradePointWorkflow: 'trp_point' }[snapshot.workflow.external?.componentKey ?? ''] as WorkflowKey | undefined;
    return key ? <div>{worldMismatch ? <p role="alert">请返回 {snapshot.world} 后继续此工作流。<button type="button" onClick={onExit}>退出工作流</button></p> : null}<fieldset disabled={worldMismatch}><WorkflowHost workflowKey={key} bridge={bridge} registry={registry} onExit={onExit} /></fieldset></div> : <p role="alert">外部工作流未获得受控绑定。</p>;
  }
  return <div>{worldMismatch ? <p role="alert" className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">此工作流属于 {snapshot.world}。请返回原世界继续，或退出后重新开始。</p> : null}<button type="button" className="mb-2 rounded border px-2 py-1 text-xs" onClick={onExit}>退出工作流</button><fieldset disabled={worldMismatch}><V3WorkflowRunner config={snapshot.config} workflow={snapshot.workflow} records={records} worldId={snapshot.world} initialActor={bridge.getEditorId()}
    onPreviewGeometry={(id,geometry)=>bridgeRef.current.upsertWorkflowPreview(`native:${id}`,geometry.type==='Point'?'point':geometry.type==='LineString'?'polyline':'polygon',[],undefined,geometry)}
    onStepChange={switchStep} onPreviewSlotsChange={previewSlots}
    onRequestGeometry={(outputId, geometry, options) => {
      const current = bridgeRef.current;
      if (activeCapture.current !== outputId || resumeRequired.current) {
        if (activeCapture.current && !resumeRequired.current) drafts.current.set(activeCapture.current, current.getTempPoints().map(point => ({ ...point })));
        current.clearTempPoints(); current.setTempPoints(drafts.current.get(outputId) ?? []); activeCapture.current = outputId; resumeRequired.current = false;
      }
      if(options?.newPart)current.clearTempPoints();
      current.setDrawMode(geometry === 'Point' ? 'point' : geometry === 'LineString' ? 'polyline' : 'polygon');
    }}
    onCaptureGeometry={(outputId, geometry) => {
      if(resumeRequired.current||normalizeV3WorldId(bridgeRef.current.getCurrentWorldId())!==snapshot.world)throw new Error('请返回原世界并重新进入绘制。');
      const rawPoints=activeCapture.current===outputId?bridgeRef.current.getTempPoints():drafts.current.get(outputId);
      if(!rawPoints)throw new Error('此绘制尚未采集有效坐标。');
      const task=snapshot.workflow.steps.find(step=>step.kind==='geometry'&&drawingKey(step)===outputId);
      const selected=geometry==='Point'&&snapshot.config.contractRevision<8&&task?.geometryRole!=='auxiliary'?rawPoints.slice(-1):rawPoints;
      const coords=selected.map(point=>({x:point.x,y:point.y??-64,z:point.z}));
      const rawPoint=selected[0];drafts.current.set(outputId,selected.map(point=>({...point})));
      if(coords.length>=(geometry==='Point'?1:geometry==='LineString'?2:3))bridgeRef.current.upsertWorkflowPreview(`native:${outputId}`,geometry==='Point'?'point':geometry==='LineString'?'polyline':'polygon',coords);
      return {coordinates:coords,point:rawPoint?{x:rawPoint.x,y:rawPoint.y,z:rawPoint.z}:undefined};
    }}
    onSubmit={outputs => { if (normalizeV3WorldId(bridgeRef.current.getCurrentWorldId()) !== snapshot.world) throw new Error('当前世界与工作流坐标不一致。'); onCommit(snapshot.config, snapshot.workflow, outputs); onExit(); }}
  /></fieldset></div>;
}
