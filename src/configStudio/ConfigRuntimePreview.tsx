import { MAP_ZOOM_BOUNDS, TILE_ZOOM_BOUNDS } from '@/lib/mapZoom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type * as L from 'leaflet';
import { MapContainer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createDynmapCRS, DynmapProjection, ZTH_FLAT_CONFIG } from '@/lib/DynmapProjection';
import { createDynmapTileLayer } from '@/lib/DynmapTileLayer';
import RuleDrivenLayer from '@/components/Rules/core/RuleDrivenLayer';
import { compileConfigRuntime, resolveGeometryProfile, validateConfigPackage } from './runtime';
import { toLeafletZoom, toZoomLevel } from '@/components/Rules/rendering/renderRules';
import type { CategoryNode, ConfigPackageV3, GeometryKind, PreviewScenario } from './types';

export const PREVIEW_SCENARIOS: Array<{ id: PreviewScenario; label: string; geometry: GeometryKind; multipart: boolean; zoom: number }> = [
  { id: 'singlePoint', label: '单点', geometry: 'Point', multipart: false, zoom: 6 },
  { id: 'multiPoint', label: '多点', geometry: 'Point', multipart: true, zoom: 6 },
  { id: 'largePolygon', label: '大面（约 Zoom 2 全图）', geometry: 'Polygon', multipart: false, zoom: 2 },
  { id: 'mediumPolygon', label: '中面（约 Zoom 4）', geometry: 'Polygon', multipart: false, zoom: 4 },
  { id: 'smallPolygon', label: '小面（约 Zoom 6）', geometry: 'Polygon', multipart: false, zoom: 6 },
  { id: 'tinyPolygon', label: '极小面（约 Zoom 8）', geometry: 'Polygon', multipart: false, zoom: 8 },
  { id: 'multiMediumPolygon', label: '多中面', geometry: 'Polygon', multipart: true, zoom: 4 },
  { id: 'multiSmallPolygon', label: '多小面', geometry: 'Polygon', multipart: true, zoom: 6 },
  { id: 'singleLine', label: '单线', geometry: 'LineString', multipart: false, zoom: 6 },
  { id: 'multiLine', label: '多线', geometry: 'LineString', multipart: true, zoom: 6 },
];

const t = (x: number, z: number): [number, number, number] => [x, -64, z];

function coordinatesFor(scenario: PreviewScenario): Record<string, unknown> {
  const scale = scenario === 'largePolygon' ? 520 : scenario === 'mediumPolygon' || scenario === 'multiMediumPolygon' ? 160 : scenario === 'smallPolygon' || scenario === 'multiSmallPolygon' ? 58 : scenario === 'tinyPolygon' ? 16 : 42;
  const z = -32;
  if (scenario === 'singlePoint') return { CoordP: [t(0, z)] };
  if (scenario === 'multiPoint') return { CoordP: [t(-28, z - 14), t(0, z), t(28, z + 14)] };
  if (scenario === 'singleLine') return { CoordL: [[t(-scale, z + scale / 2), t(-scale / 3, z - scale / 3), t(scale / 3, z + scale / 4), t(scale, z - scale / 2)]] };
  if (scenario === 'multiLine') return { CoordL: [[t(-scale, z + scale / 2), t(-scale / 4, z - scale / 3), t(scale / 2, z + scale / 4)], [t(-scale / 2, z - scale / 2), t(scale / 4, z + scale / 3), t(scale, z - scale / 4)]] };
  const outer = [t(-scale, z - scale), t(scale, z - scale * 0.8), t(scale * 0.8, z + scale), t(-scale * 0.9, z + scale * 0.75)];
  if (scenario === 'multiMediumPolygon' || scenario === 'multiSmallPolygon') {
    // Three independent exterior rings: this is deliberate multipart geometry,
    // not an outer polygon plus a hole masquerading as a multipolygon.
    const a = [t(-scale * 1.35, z - scale * 0.65), t(-scale * 0.45, z - scale * 0.55), t(-scale * 0.58, z + scale * 0.25), t(-scale * 1.18, z + scale * 0.45)];
    const b = [t(-scale * 0.12, z - scale * 0.38), t(scale * 0.62, z - scale * 0.25), t(scale * 0.52, z + scale * 0.38), t(-scale * 0.22, z + scale * 0.22)];
    const c = [t(scale * 0.78, z - scale * 0.66), t(scale * 1.35, z - scale * 0.45), t(scale * 1.22, z + scale * 0.04), t(scale * 0.7, z - scale * 0.08)];
    return { CoordG: [[a], [b], [c]] };
  }
  return { CoordG: [[outer]] };
}

function scenarioType(scenario: PreviewScenario): 'Points' | 'Polyline' | 'Polygon' {
  return PREVIEW_SCENARIOS.find((item) => item.id === scenario)?.geometry === 'Point' ? 'Points' : PREVIEW_SCENARIOS.find((item) => item.id === scenario)?.geometry === 'LineString' ? 'Polyline' : 'Polygon';
}

function samePath(left: CategoryNode['path'], right: CategoryNode['path']): boolean {
  return left.class === right.class
    && (left.kind ?? '') === (right.kind ?? '')
    && (left.skind ?? '') === (right.skind ?? '')
    && (left.skind2 ?? '') === (right.skind2 ?? '');
}

function fixtureFor(
  path: CategoryNode['path'],
  type: 'Points' | 'Polyline' | 'Polygon',
  coordinates: Record<string, unknown>,
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  return {
    ID: id,
    Name: name,
    World: 'zth',
    Class: path.class,
    ...(path.kind ? { Kind: path.kind } : {}),
    ...(path.skind ? { SKind: path.skind } : {}),
    ...(path.skind2 ? { SKind2: path.skind2 } : {}),
    Type: type,
    ...coordinates,
    ...extra,
  };
}

function typeForPath(config: ConfigPackageV3, path: CategoryNode['path']): 'Points' | 'Polyline' | 'Polygon' {
  const geometry = (['Point', 'LineString', 'Polygon'] as GeometryKind[]).find((candidate) => resolveGeometryProfile(config, path, candidate)?.enabled);
  return geometry === 'Point' ? 'Points' : geometry === 'LineString' ? 'Polyline' : 'Polygon';
}

/** A selected member needs a visibly larger external host. It is intentionally
 * not derived from the member's scenario size: equal-sized fixtures made the
 * host/member relation impossible to review visually. */
function coordinatesForExternalHost(type: 'Points' | 'Polyline' | 'Polygon'): Record<string, unknown> {
  if (type === 'Points') return { CoordP: [t(0, -32)] };
  if (type === 'Polyline') return { CoordL: [[t(-240, -32), t(0, -32), t(240, -32)]] };
  const host = [t(-230, -255), t(245, -215), t(220, 205), t(-245, 225)];
  return { CoordG: [[host]] };
}

export function makeConfigPreviewFixture(config: ConfigPackageV3, node: CategoryNode, scenario: PreviewScenario): { features: unknown[] } {
  const selectedType = scenarioType(scenario);
  const path = node.path;
  const selected = fixtureFor(path, selectedType, coordinatesFor(scenario), `config-preview-${scenario}`, [path.class, path.kind, path.skind, path.skind2].filter(Boolean).join('/') || path.class);
  const binding = (config.contextBindings ?? []).find((candidate) => candidate.enabled && (samePath(candidate.host.classification, path) || samePath(candidate.member.classification, path)));
  if (!binding) return { features: [selected] };

  const hostId = 'config-preview-context-host';
  const selectedIsHost = samePath(binding.host.classification, path);
  const selectedWithRelation = {
    ...selected,
    ...(selectedIsHost ? { [binding.host.referenceField]: hostId } : { [binding.member.referenceField]: hostId }),
    ...(selectedIsHost ? {} : { [binding.memberSelectorField || 'ID']: '1' }),
  };
  // A host is reviewed by itself. Only a selected member receives an external
  // host fixture and its embedded floor context panel.
  if (selectedIsHost) return { features: [selectedWithRelation] };
  const peerPath = binding.host.classification;
  const peerType = typeForPath(config, peerPath);
  const peer = fixtureFor(
    peerPath,
    peerType,
    coordinatesForExternalHost(peerType),
    hostId,
    '预览主结构',
    { [binding.host.referenceField]: hostId },
  );
  return { features: [peer, selectedWithRelation] };
}

function TileLayer({ onError }: { onError: (message: string) => void }) {
  const map = useMap();
  useEffect(() => {
    const layer = createDynmapTileLayer('zth', 'flat', { ...TILE_ZOOM_BOUNDS, maxRetries: 1 });
    layer.on('tileerror', () => onError('部分底图瓦片加载失败，请检查当前瓦片源。'));
    layer.on('loading', () => onError(''));
    layer.addTo(map);
    return () => { layer.remove(); };
  }, [map, onError]);
  return null;
}

function LockedViewport({ zoom, onReady, onZoom }: { zoom: number; onReady: (map: L.Map) => void; onZoom: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  useLayoutEffect(() => {
    map.setView([0, 0], zoom, { animate: false });
    map.invalidateSize({ pan: false, debounceMoveend: true });
  }, [map, zoom]);
  useEffect(() => {
    // Leaflet's native wheel zoom anchors at the cursor, which is exactly the
    // behaviour a fixed-centre rule preview must not inherit.  Own the wheel
    // event and always issue a centre-preserving setView instead.
    const container = map.getContainer();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY < 0 ? 1 : -1;
      const next = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + delta));
      if (next !== map.getZoom()) map.setView([0, 0], next, { animate: false });
    };
    const normalizeCenter = () => {
      const center = map.getCenter();
      if (Math.abs(center.lat) > 0.000001 || Math.abs(center.lng) > 0.000001) map.setView([0, 0], map.getZoom(), { animate: false });
      onZoom(map.getZoom());
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    map.on('zoomend', normalizeCenter);
    return () => {
      container.removeEventListener('wheel', onWheel);
      map.off('zoomend', normalizeCenter);
    };
  }, [map, onZoom]);
  return null;
}

export function previewScenarioCompatible(config: ConfigPackageV3, node: CategoryNode, scenario: PreviewScenario): boolean {
  const definition = PREVIEW_SCENARIOS.find((item) => item.id === scenario);
  if (!definition) return false;
  const profile = resolveGeometryProfile(config, node.path, definition.geometry);
  return Boolean(profile?.enabled && (!definition.multipart || profile.allowMultipleParts));
}

export function ConfigRuntimePreview({ config, node, scenario, onRuntimeError, onMapReady }: { config: ConfigPackageV3; node: CategoryNode; scenario: PreviewScenario; onRuntimeError?: (error: Error) => void; onMapReady?: (map: L.Map) => void }) {
  const activeConfig = useMemo(() => validateConfigPackage(config).valid ? compileConfigRuntime(config, true) : undefined, [config]);
  const [map, setMap] = useState<L.Map | null>(null);
  const [tileError, setTileError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const scenarioDefinition = PREVIEW_SCENARIOS.find((item) => item.id === scenario) ?? PREVIEW_SCENARIOS[0];
  const selectedBinding = (config.contextBindings ?? []).find((candidate) => candidate.enabled && samePath(candidate.member.classification, node.path));
  const dataset = useMemo(() => makeConfigPreviewFixture(config, node, scenario), [config, node, scenario]);
  useEffect(() => { if (map) onMapReady?.(map); }, [map, onMapReady]);
  const projection = useMemo(() => new DynmapProjection(ZTH_FLAT_CONFIG), []);
  const [zoom, setZoom] = useState(scenarioDefinition.zoom);
  useEffect(() => setZoom(scenarioDefinition.zoom), [scenarioDefinition.zoom]);
  const leafletZoom = toLeafletZoom(zoom);
  useLayoutEffect(() => {
    if (!map) return;
    try { map.setView([0, 0], leafletZoom, { animate: false }); } catch (error) { onRuntimeError?.(error instanceof Error ? error : new Error('验证器缩放失败')); }
  }, [map, leafletZoom, onRuntimeError]);
  useLayoutEffect(() => {
    if (!map || !containerRef.current) return undefined;
    let frame = 0;
    const invalidate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ pan: false, debounceMoveend: true });
        map.setView([0, 0], map.getZoom(), { animate: false });
      });
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(containerRef.current);
    invalidate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [map]);
  return <div ref={containerRef} className="relative h-full min-h-[300px] w-full min-w-0 overflow-hidden rounded-xl border border-slate-300 bg-slate-950">
    <MapContainer center={[0, 0]} zoom={leafletZoom} minZoom={MAP_ZOOM_BOUNDS.minZoom} maxZoom={MAP_ZOOM_BOUNDS.maxZoom} zoomControl={false} attributionControl crs={createDynmapCRS(ZTH_FLAT_CONFIG)} className="absolute inset-0 h-full min-h-[300px] w-full" dragging={false} touchZoom={false} doubleClickZoom={false} boxZoom={false} keyboard={false} scrollWheelZoom={false} zoomSnap={1} zoomDelta={1}>
      <TileLayer onError={setTileError} />
      <LockedViewport zoom={leafletZoom} onReady={setMap} onZoom={(value) => setZoom(toZoomLevel(value))} />
      {map && activeConfig ? <RuleDrivenLayer mapReady map={map} projection={projection} worldId="zth" visible activeButtonIds={[]} bypassButtonFilter runtimeDataset={dataset} disableTransientSources configRuntime={activeConfig} floorPanelMode={selectedBinding ? 'embedded' : 'hidden'} /> : null}
    </MapContainer>
    {tileError ? <p role="alert" className="absolute bottom-3 left-3 right-3 z-[1100] rounded bg-rose-50/95 p-2 text-xs text-rose-800">{tileError}</p> : null}
    {!activeConfig ? <p role="status" className="absolute bottom-3 left-3 right-3 z-[1100] rounded bg-amber-50 p-2 text-xs text-amber-900">当前草稿尚未通过核验，完善条件或引用后恢复原生预览。</p> : null}
    <div className="absolute left-3 top-3 z-[1100] flex overflow-hidden rounded border border-slate-300 bg-white/95 shadow">
      <button type="button" className="px-3 py-1 text-lg hover:bg-slate-100" aria-label="缩小验证器" onClick={() => setZoom((value) => Math.max(0, value - 1))}>−</button>
      <span aria-live="polite" className="min-w-20 border-x px-2 py-1 text-center text-xs leading-6">规则 Zoom {zoom}</span>
      <button type="button" className="px-3 py-1 text-lg hover:bg-slate-100" aria-label="放大验证器" onClick={() => setZoom((value) => Math.min(8, value + 1))}>＋</button>
    </div>
  </div>;
}

export default ConfigRuntimePreview;
