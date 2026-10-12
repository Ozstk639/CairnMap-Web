import {createTrpEditingWorkflow} from '../../src/configStudio/externalEditRegistry';
import {installRailEditingWorkflows} from '../../src/configStudio/railEditingTemplates';
import {migrateConfigToR9} from '../../src/configStudio/r9Migration';
import finalSeed from '../../src/configStudio/defaults/r9-r5.config.json';
import type {ConfigPackageV3} from '../../src/configStudio/types';
// Isolated production MeasuringModule acceptance, never imported by the app.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, useMap } from 'react-leaflet';
import type * as L from 'leaflet';
import '../../src/styles/index.css';
import 'leaflet/dist/leaflet.css';
import { useRuleDataStore } from '../../src/store/ruleDataStore';
import MeasuringModule, { type MeasuringModuleHandle } from '../../src/components/Mapping/core/MeasuringModule';
import { createEditableConfigPackageFromCurrentProject as createConfigPackageFromCurrentProject } from '../../src/configStudio/renderRuleTemplates';
import { compileConfigRuntime } from '../../src/configStudio/runtime';
import { DynmapProjection, createDynmapCRS, ZTH_FLAT_CONFIG } from '../../src/lib/DynmapProjection';
import { MAP_ZOOM_BOUNDS } from '../../src/lib/mapZoom';
function Ready({ onReady }: { onReady: (map: L.Map) => void }) { const map = useMap(); useEffect(() => onReady(map), [map, onReady]); return null; }
function Harness() {
  const [world, setWorld] = useState('zth');
  const [config, setConfig] = useState(()=>{if(location.search.includes('final=1'))return structuredClone(finalSeed) as ConfigPackageV3;const config=createConfigPackageFromCurrentProject();if(!location.search.includes('edit=1'))return config;const edited=migrateConfigToR9(config);for(const workflow of edited.workflows)if(workflow.mode==='composed'&&workflow.id!=='v3-tpp_teleport')workflow.editor={enabled:true};const withRail=installRailEditingWorkflows(edited);withRail.workflows.push(createTrpEditingWorkflow());return withRail;});
  const runtimeConfig = useMemo(() => compileConfigRuntime(config), [config]);
  const [map, setMap] = useState<L.Map | null>(null);
  const mapRef = useRef<L.Map | null>(null); mapRef.current = map;
  const projection = useMemo(() => new DynmapProjection(ZTH_FLAT_CONFIG), []);
  const projectionRef = useRef(projection);
  const measurementRef = useRef<MeasuringModuleHandle | null>(null);
  useEffect(() => { (window as any).workflowAcceptance = { map, config, setConfig, world, setWorld, setRecords: (features: unknown[]) => useRuleDataStore.setState({ datasets: { zth: { worldId: 'zth', features } as any } }), screenPointAt: (x: number, z: number) => { const p = map!.latLngToContainerPoint(projection.locationToLatLng(x,64,z)); const r = map!.getContainer().getBoundingClientRect(); return { x: p.x + r.x, y: p.y + r.y }; }, measurement: measurementRef.current }; }, [map, config, world]);
  return <main style={{ height: 900, width: 1200, margin: 20 }}><MapContainer style={{ height: '100%', width: '100%' }} center={[0, 0]} zoom={3} {...MAP_ZOOM_BOUNDS} crs={createDynmapCRS(ZTH_FLAT_CONFIG)}><Ready onReady={setMap} /></MapContainer>
    {map ? <MeasuringModule ref={measurementRef} mapReady leafletMapRef={mapRef} projectionRef={projectionRef} currentWorldId={world} configRuntime={runtimeConfig} disablePackageUpload={!location.search.includes('edit=1')} /> : null}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
