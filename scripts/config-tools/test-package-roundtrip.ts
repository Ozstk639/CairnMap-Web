import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { buildConfigPackageArchive, readConfigPackage } from '../../src/configStudio/package';
import { validateConfigPackage } from '../../src/configStudio/runtime';
import { normalizeImportedLocalization } from '../../src/configStudio/localization';

const config = createConfigPackageFromCurrentProject();
const expected = JSON.parse(JSON.stringify(normalizeImportedLocalization(config)));
const archive = await buildConfigPackageArchive(config, validateConfigPackage(config));
const imported = await readConfigPackage(new File([archive], 'roundtrip.zip'));
assert.deepEqual(imported, expected);
assert.equal(validateConfigPackage(imported).valid, true);
assert.deepEqual(await readConfigPackage(new File([JSON.stringify(config)], 'roundtrip.json')), expected);
const zip = await JSZip.loadAsync(await archive.arrayBuffer());
zip.file('config.json', JSON.stringify({ ...expected, revision: 999 }));
const tampered = await zip.generateAsync({ type: 'uint8array' });
await assert.rejects(() => readConfigPackage(new File([tampered], 'tampered.zip')), /哈希校验失败/);
console.log('package-roundtrip: real ZIP/JSON roundtrip with optional undefined values and tamper rejection: OK');
