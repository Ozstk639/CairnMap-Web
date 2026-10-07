import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FEATURE_RENDER_RULES } from '../../src/components/Rules/rendering/featureRenderRules';
import { toZoomLevel } from '../../src/components/Rules/rendering/renderRules';
import { V1_BEHAVIOR_BASELINE } from '../../src/configStudio/v1BehaviorBaseline';

const ruleSource = readFileSync(fileURLToPath(new URL('../../src/components/Rules/rendering/featureRenderRules.ts', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const sourceHash = createHash('sha256').update(ruleSource).digest('hex');
assert.equal(sourceHash, V1_BEHAVIOR_BASELINE.featureRuleSourceSha256, 'V1 feature render-rule source changed; update the frozen baseline in an explicit V1 review.');
assert.equal(FEATURE_RENDER_RULES.length, V1_BEHAVIOR_BASELINE.probes.length, 'V1 rule inventory changed; update the frozen baseline in an explicit V1 review.');

for (const probe of V1_BEHAVIOR_BASELINE.probes) {
  const rule = FEATURE_RENDER_RULES.find((candidate) => (
    candidate.name === probe.ruleName
    && candidate.match.Class === probe.classCode
    && candidate.match.Type === probe.geometry
  ));
  assert.ok(rule, `V1 frozen probe missing: ${probe.classCode} / ${probe.ruleName}`);
}

assert.equal(toZoomLevel(-3), 0, 'V1 zoom lower bound changed');
assert.equal(toZoomLevel(5), 8, 'V1 zoom upper bound changed');
assert.equal(toZoomLevel(2), 5, 'V1 zoom mapping changed');

console.log(`V1 render baseline OK (${V1_BEHAVIOR_BASELINE.probes.length} probes).`);
