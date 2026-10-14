import assert from 'node:assert/strict';
import { placeLabel, labelCandidateShift, labelPlacementTransform, iconBoundsAtAnchor, type LabelPlacement } from '../../src/components/Rules/rendering/labelPlacement';

const origins: Array<[LabelPlacement, number, number, string]> = [
  ['center', 80, 90, 'translate(-50%, -50%)'], ['N', 80, 80, 'translate(-50%, -100%)'],
  ['S', 80, 100, 'translate(-50%, 0%)'], ['E', 100, 90, 'translate(0%, -50%)'],
  ['W', 60, 90, 'translate(-100%, -50%)'], ['NE', 100, 80, 'translate(0%, -100%)'],
  ['NW', 60, 80, 'translate(-100%, -100%)'], ['SE', 100, 100, 'translate(0%, 0%)'], ['SW', 60, 100, 'translate(-100%, 0%)'],
];
for (const [placement, x, y, css] of origins) {
  assert.equal(labelPlacementTransform(placement), css);
  for (const [offsetX, offsetY] of [[0, 0], [12, 15], [-12, -15], [12, -15], [-12, 15]]) {
    assert.deepEqual(placeLabel({ x: 100, y: 100 }, { w: 40, h: 20 }, placement, offsetX, offsetY), { x: x + offsetX, y: y + offsetY, w: 40, h: 20 });
  }
  assert.deepEqual(labelCandidateShift('C', placement, { w: 40, h: 20 }, 0), { dx: 0, dy: 0 });
}
assert.deepEqual(placeLabel({ x: 100, y: 100 }, { w: 40, h: 20 }, 'near', 0, 5, false), { x: 80, y: 71, w: 40, h: 20 });
assert.deepEqual(placeLabel({ x: 100, y: 100 }, { w: 40, h: 20 }, 'center', 0, 5, false), { x: 80, y: 90, w: 40, h: 20 });
assert.deepEqual(iconBoundsAtAnchor({ x: 100, y: 100 }, [40, 20], [20, 5], 3), { x: 77, y: 92, w: 46, h: 26 });
console.log('label-placement: nine positions, signed X/Y, CSS/bbox origin and legacy baseline: OK');
