// Copy this test entry into the frozen worktree; all relative imports then
// resolve to its unmodified production components and formatter dependencies.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, useMap } from 'react-leaflet';
import '../../src/styles/index.css';
import 'leaflet/dist/leaflet.css';
import { getWorkflowExecutorComponent } from '../../src/components/Mapping/Workflow/workflowComponentExecutorRegistry';
import TeleportPointWorkflow from '../../src/components/Mapping/Workflow/TeleportPointWorkflow';
import WarpPointWorkflow from '../../src/components/Mapping/Workflow/WarpPointWorkflow';
import { getFormatDef } from '../../src/components/Common/featureFormats';
import { DynmapProjection, createDynmapCRS, ZTH_FLAT_CONFIG } from '../../src/lib/DynmapProjection';
import type { WorldPoint, WorkflowBridge, WorkflowCommitArgs } from '../../src/components/Mapping/Workflow/WorkflowHost';
const projection = new DynmapProjection(ZTH_FLAT_CONFIG);
function Capture({ enabled, onPoint }: { enabled: boolean; onPoint: (point: WorldPoint) => void }) {
  const map = useMap();
  useEffect(() => { const click = (event: any) => { if (!enabled) return; const point = projection.latLngToLocation(event.latlng, 64); onPoint({ x: point.x, z: point.z }); }; map.on('click', click); return () => { map.off('click', click); }; }, [map, enabled, onPoint]);
  return null;
}
function Harness() {
  const [points, setPoints] = useState<WorldPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [records, setRecords] = useState<unknown[]>([]);
  const pointRef = useRef(points); pointRef.current = points;
  const actor = useRef('');
  const bridge = {
    getEditorId: () => actor.current, setEditorId: (id: string) => { actor.current = id; },
    getCurrentWorldId: () => 'zth', getTempPoints: () => pointRef.current,
    setTempPoints: (values: WorldPoint[]) => { pointRef.current = values; setPoints(values); },
    clearTempPoints: () => { pointRef.current = []; setPoints([]); },
    setDrawMode: (mode: string) => setDrawing(mode !== 'none'), setDrawColor: () => {}, upsertWorkflowPreview: () => {}, clearWorkflowPreview: () => {}, getCommittedLayerJsonInfos: () => records.map(featureInfo => ({ featureInfo })), getDeleteMarkedFeatureIds: () => [], suspendDrawMode: () => setDrawing(false),
    exitWorkflowToSelector: () => setDrawing(false),
    commitFeature: (args: WorkflowCommitArgs) => {
      const record = getFormatDef(args.subType).buildFeatureInfo({ op: 'create', mode: args.mode, coords: args.coords, values: args.values, groups: args.groupInfo, editorId: args.editorId, worldId: 'zth', now: new Date('2026-10-07T00:00:00Z') });
      setRecords(current => [...current, record]); return { ok: true, featureInfo: record };
    },
  } as unknown as WorkflowBridge;
  useEffect(() => { (window as any).v1WorkflowOracle = { sourceSha: '0b82863d4fea3791f98917ba6d13f70e1f27eb15', records, points, drawing }; }, [records, points, drawing]);
  const params = new URLSearchParams(location.search);
  const Component = params.get('componentKey') ? getWorkflowExecutorComponent(params.get('componentKey')!)! : params.get('workflow') === 'wrp' ? WarpPointWorkflow : TeleportPointWorkflow;
  return <main style={{ width: 1200, height: 900, margin: 20 }}><MapContainer style={{ width: '100%', height: '100%' }} center={[0, 0]} zoom={3} crs={createDynmapCRS(ZTH_FLAT_CONFIG)}><Capture enabled={drawing} onPoint={point => setPoints(values => [...values, point])} /></MapContainer><aside style={{ position: 'absolute', top: 50, left: 35, width: 450, maxHeight: 850, overflow: 'auto', background: 'white', padding: 12, zIndex: 3000 }}><Component workflowKey={'railway' as any} bridge={bridge} onExit={() => setDrawing(false)} /></aside></main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
