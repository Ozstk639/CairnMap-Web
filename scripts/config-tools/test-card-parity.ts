import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { buildV3CardSections } from '../../src/configStudio/V3CardRenderer';
const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/v1-independent-card-baseline.json', import.meta.url), 'utf8'));
const config = createConfigPackageFromCurrentProject();
const empty = (value: any) => value == null || typeof value === 'string' && (!value.trim() || value.trim() === '未知') || typeof value === 'object' && !Object.keys(value).length || Array.isArray(value) && !value.length || value.kind === 'lineChips' && !value.items?.length;
const normalize = (sections: any) => Object.fromEntries(['mainRows','otherRows'].map(key => [key, (sections?.[key] ?? []).filter((row: any) => !empty(row.value)).map(({ label, value }: any) => ({ label, value }))]));
const differences = [];
for (const item of baseline.cases) {
  if (item.record.Class === 'TRP') continue;
  const fi = item.record;
  const record: any = { uid: fi.ID, featureInfo: fi, type: fi.Type, meta: { Class: fi.Class, idValue: fi.ID, sig: fi } };
  const expected = normalize(item.sections), actual = normalize(buildV3CardSections(config, record));
  try { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected))); }
  catch { differences.push({ key: item.key, fi, expected, actual }); }
}
if (differences.length) { fs.writeFileSync('card-parity-differences.json', JSON.stringify(differences, null, 2)); console.error(`${differences.length} card differences; see card-parity-differences.json`); }
assert.equal(differences.length, 0);
console.log(`card-parity: ${baseline.cases.length} frozen schema/catalog cases (TRP explicit exception): OK`);
