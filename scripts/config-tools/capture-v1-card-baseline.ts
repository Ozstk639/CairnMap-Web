import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const reference = process.cwd();
const candidate = path.resolve(reference, '../cairnmap-config-runtime-v32-migration-20261007');
const { buildInfoSectionsForFeature } = await import(pathToFileURL(path.join(reference, 'src/components/Rules/cardrules/fieldRules.ts')).href);
const fixtures = JSON.parse(fs.readFileSync(path.join(candidate, 'scripts/config-tools/fixtures/v1-workflow-output-parity.json'), 'utf8')).cases;
const { listClassConfigs } = await import(pathToFileURL(path.join(reference, 'src/core/project/classMetadata.ts')).href);
const records = fixtures.map((item: any) => ({ key: item.schemaKey, record: item.expectedRecord }));
for (const config of listClassConfigs()) {
  for (const option of [{}, ...(config.classification?.options ?? [])]) {
    const fi: any = { ID: 'card-oracle', Name: 'Card sample', Class: config.classCode, Kind: option.kind ?? '', SKind: option.skind ?? '', SKind2: option.skind2 ?? '', Type: config.geometry.type === 'Point' ? 'Points' : config.geometry.type === 'LineString' ? 'Polyline' : 'Polygon', World: 'zth', CreateBy: 'card-author', CreateTime: '20261007' };
    for (const field of config.fields) {
      if (['ID','Name','Class','Kind','SKind','SKind2','Type','World','CoordP','CoordL','CoordG'].includes(field.key)) continue;
      const parts = field.key.split('.'); let node = fi;
      for (const part of parts.slice(0,-1)) node = node[part] ??= {};
      node[parts.at(-1)!] = field.type === 'boolean' ? false : field.type === 'number' ? 0 : field.type === 'json' ? {} : 'sample';
    }
    records.push({ key: `catalog:${config.classCode}/${fi.Kind}/${fi.SKind}/${fi.SKind2}`, record: fi });
  }
}
const cases = records.map((item: any) => ({ ...item, sections: buildInfoSectionsForFeature({ uid: item.record.ID, featureInfo: item.record, type: item.record.Type, meta: { Class: item.record.Class, idValue: item.record.ID, sig: item.record } }, null) }));
fs.writeFileSync(path.join(candidate, 'scripts/config-tools/fixtures/v1-independent-card-baseline.json'), JSON.stringify({ sourceSha: '0b82863d4fea3791f98917ba6d13f70e1f27eb15', cases }, null, 2));
console.log(`Frozen V1 cards: ${cases.length} schema and catalog cases`);
