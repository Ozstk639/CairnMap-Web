import assert from 'node:assert/strict';
import { MAP_ZOOM_BOUNDS, TILE_ZOOM_BOUNDS, toLeafletZoom, toZoomLevel } from '../../src/lib/mapZoom';
for (let logical = 0; logical <= 8; logical += 1) {
  const map = toLeafletZoom(logical);
  assert.equal(map, logical - 3);
  assert.equal(toZoomLevel(map), logical);
  assert.ok(map >= MAP_ZOOM_BOUNDS.minZoom && map <= MAP_ZOOM_BOUNDS.maxZoom);
  const native = Math.min(TILE_ZOOM_BOUNDS.maxNativeZoom, Math.max(TILE_ZOOM_BOUNDS.minNativeZoom, map));
  assert.ok(native >= -2 && native <= 3);
}
assert.equal(toLeafletZoom(-1), -3);
assert.equal(toLeafletZoom(9), 5);
console.log('map-zoom: shared logical/map/tile limits, including Zoom 0–2: OK');
