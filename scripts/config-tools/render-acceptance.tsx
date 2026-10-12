// Local browser acceptance entry; never imported by the application entry point.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, useMap } from 'react-leaflet';
import type * as L from 'leaflet';
import '../../src/styles/index.css';
import 'leaflet/dist/leaflet.css';
import { ConfigRuntimePreview, makeConfigPreviewFixture } from '../../src/configStudio/ConfigRuntimePreview';
import { createEditableConfigPackageFromCurrentProject as createConfigPackageFromCurrentProject } from '../../src/configStudio/renderRuleTemplates';
import finalSeed from '../../src/configStudio/defaults/r9-r5.config.json';
import type {ConfigPackageV3} from '../../src/configStudio/types';
import { compileConfigRuntime, configCompilationStats, resolveGeometryProfile, validateConfigPackage } from '../../src/configStudio/runtime';
import type { PreviewScenario } from '../../src/configStudio/types';
import { createDynmapCRS, DynmapProjection, ZTH_FLAT_CONFIG } from '../../src/lib/DynmapProjection';
import { createDynmapTileLayer } from '../../src/lib/DynmapTileLayer';
import { MAP_ZOOM_BOUNDS, TILE_ZOOM_BOUNDS, toLeafletZoom } from '../../src/lib/mapZoom';
import RuleDrivenLayer from '../../src/components/Rules/core/RuleDrivenLayer';
import { buildConfigPackageArchive, readConfigPackage } from '../../src/configStudio/package';

const api = window as unknown as { acceptance: Record<string, unknown> };
function Ready({ ready }: { ready: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { ready(map); const tiles = createDynmapTileLayer('zth', 'flat', TILE_ZOOM_BOUNDS); tiles.addTo(map); return () => { tiles.remove(); }; }, [map, ready]);
  return null;
}
function Harness() {
  const params = new URLSearchParams(location.search);
  const [config, setConfig] = useState(()=>params.get('final')==='1'?structuredClone(finalSeed) as ConfigPackageV3:createConfigPackageFromCurrentProject());
  // Controlled geometry probes may intentionally combine authoring-incompatible
  // profiles. This test-only entry compiles them; production activation validates.
  const runtimeConfig = useMemo(() => compileConfigRuntime(config, true), [config]);
  const [map, setMap] = useState<L.Map | null>(null);
  const [datasetOverride, setDataset] = useState<{ features: unknown[] } | null>(null);
  const [featurePatch, setFeaturePatch] = useState<Record<string, unknown>>({});
  const node = config.nodes.find((item) => item.path.class === (params.get('class') ?? 'BUD') && !item.path.kind)!;
  const scenario = (params.get('scenario') ?? 'smallPolygon') as PreviewScenario;
  const dataset = useMemo(() => ({ features: (datasetOverride?.features ?? makeConfigPreviewFixture(config, node, scenario).features).map((feature) => ({ ...(feature as object), ...featurePatch })) }), [config, node, scenario, featurePatch, datasetOverride]);
  const projection = useMemo(() => new DynmapProjection(ZTH_FLAT_CONFIG), []);
  useEffect(() => {
    api.acceptance = { map, config, dataset, setConfig, setDataset, setFeaturePatch, compilationStats: () => configCompilationStats(runtimeConfig), geometry: resolveGeometryProfile(config, node.path, scenario.includes('Point') ? 'Point' : scenario.includes('Line') ? 'LineString' : 'Polygon'),
      roundTrip: async () => { const report = validateConfigPackage(config); const archive = await buildConfigPackageArchive(config, report); return readConfigPackage(new File([archive], 'acceptance.zip')); } };
  }, [map, config, runtimeConfig, dataset, node, scenario]);
  return <main style={{ height: 900, width: 1200, margin: 20 }}>
    {params.get('mode') === 'preview' ? <ConfigRuntimePreview config={config} node={node} scenario={scenario} onMapReady={setMap} /> :
      <MapContainer style={{ height: '100%', width: '100%' }} center={[0, 0]} zoom={toLeafletZoom(6)} zoomAnimation={false} fadeAnimation={false} {...MAP_ZOOM_BOUNDS} crs={createDynmapCRS(ZTH_FLAT_CONFIG)}><Ready ready={setMap} />
        {map ? <RuleDrivenLayer mapReady map={map} projection={projection} worldId="zth" visible activeButtonIds={[]} bypassButtonFilter runtimeDataset={dataset} disableTransientSources={!params.has('transient')} configRuntime={params.get('mode') === 'v1' ? undefined : runtimeConfig} floorPanelMode="hidden" /> : null}
      </MapContainer>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
