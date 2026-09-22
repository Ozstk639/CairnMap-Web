import assert from 'node:assert/strict';
import {
  readMultipartGeometry,
  serializeMultipartGeometry,
  validateMultipartGeometry,
} from '../../src/core/geometry/multipartGeometry';
import { stringifyFeatureJson } from '../../src/components/Common/featureJsonSerializer';

const point = readMultipartGeometry({ CoordP: [[1, -64, 2], [3, 70, 4]] }, 'Point');
assert.equal(point.source, 'canonical');
assert.deepEqual(serializeMultipartGeometry(point.geometry!), [[1, -64, 2], [3, 70, 4]]);
assert.equal(validateMultipartGeometry(point.geometry), undefined);

const line = readMultipartGeometry({ CoordL: [[[1, -64, 2], [3, -64, 4]], [[5, -64, 6], [7, -64, 8]]] }, 'LineString');
assert.equal(line.geometry?.type, 'LineString');
assert.equal((line.geometry as any).parts.length, 2);
assert.equal(validateMultipartGeometry(line.geometry), undefined);

const polygon = readMultipartGeometry({
  CoordG: [
    [
      [[0, -64, 0], [10, -64, 0], [10, -64, 10], [0, -64, 10]],
      [[2, -64, 2], [2, -64, 4], [4, -64, 4], [4, -64, 2]],
    ],
    [
      [[20, -64, 20], [30, -64, 20], [30, -64, 30], [20, -64, 30]],
    ],
  ],
}, 'Polygon');
assert.equal(polygon.geometry?.type, 'Polygon');
assert.equal((polygon.geometry as any).parts.length, 2);
assert.equal(validateMultipartGeometry(polygon.geometry), undefined);

const legacy = readMultipartGeometry({ Conpoints: [[0, -64, 0], [10, -64, 0], [10, -64, 10]] }, 'Polygon', 'Conpoints');
assert.equal(legacy.source, 'legacy');
assert.equal(validateMultipartGeometry(legacy.geometry), undefined);

const conflict = readMultipartGeometry({
  CoordP: [[1, -64, 2]],
  coordinate: { x: 2, y: -64, z: 2 },
}, 'Point', 'coordinate');
assert.equal(conflict.error, 'geometry-field-conflict');

const legacyConflict = readMultipartGeometry({
  PLpoints: [[1, -64, 2], [3, -64, 4]],
  Linepoints: [[1, -64, 2], [5, -64, 6]],
}, 'LineString');
assert.equal(legacyConflict.error, 'geometry-field-conflict');

const invalidHole = readMultipartGeometry({
  CoordG: [[
    [[0, -64, 0], [10, -64, 0], [10, -64, 10], [0, -64, 10]],
    [[12, -64, 12], [13, -64, 12], [13, -64, 13]],
  ]],
}, 'Polygon');
assert.match(validateMultipartGeometry(invalidHole.geometry) ?? '', /必须完全位于外边界内/);

const exported = stringifyFeatureJson({ Type: 'Polygon', Name: 'multipart', CoordG: serializeMultipartGeometry(polygon.geometry!) });
assert.match(exported, /"CoordG"/);
assert.match(exported, /\[0,-64,0\]/);
assert.equal(exported.split('\n').filter((line) => line.includes('[0,-64,0]')).length, 1);

console.log('multipart geometry contract: ok');
