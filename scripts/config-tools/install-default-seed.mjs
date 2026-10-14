import fs from 'node:fs';
import crypto from 'node:crypto';
import JSZip from 'jszip';

const source = 'docs/90_roadmap-and-history/runtime-v32-unified-repair-20261011/CairnMap_V32_FieldReuse_Drawing_r4.config.json';
const bytes = fs.readFileSync(source);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
if (sha256(bytes) !== 'ffcf77938eb83ea7054ebde4bdbe42980c36cde73c4cad864af5e329a216a2f5') throw Error('Frozen r4 seed changed');
const stable = value => Array.isArray(value) ? '['+value.map(stable).join(',')+']' : value && typeof value==='object' ? '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}' : JSON.stringify(value);
const fingerprint = value => {const {parity:_parity,...content}=value;return sha256(stable(content));};
const oldZip = await JSZip.loadAsync(fs.readFileSync('docs/90_roadmap-and-history/runtime-v32-implementation-20261008/CairnMap_V32_V1Parity_r2.zip'));
const old = JSON.parse(await oldZip.file('config.json').async('string'));
const config = JSON.parse(bytes);
fs.mkdirSync('src/configStudio/defaults', {recursive:true});
fs.writeFileSync('src/configStudio/defaults/r8-r4.config.json', bytes);
fs.writeFileSync('src/configStudio/defaults/manifest.json',JSON.stringify({packageId:config.packageId,revision:config.revision,contractRevision:config.contractRevision,sha256:sha256(bytes),semanticFingerprint:fingerprint(config),legacyDefaultFingerprints:[fingerprint(old)]},null,2)+'\n');
console.log('Frozen default seed installed, r8/r4; previous r2 fingerprint recorded');
