import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { createEditableConfigPackageFromCurrentProject } from '../../src/configStudio/renderRuleTemplates';
import { migrateRenderRulesToR7 } from '../../src/configStudio/renderRuleMigration';
import { buildConfigPackageArchive, readConfigPackage } from '../../src/configStudio/package';
import { compileConfigRuntime, validateConfigPackage } from '../../src/configStudio/runtime';

const baseline = JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-independent-baseline.json', 'utf8'));
const reference = path.resolve(process.env.CAIRNMAP_V1_REFERENCE ?? '../cairnmap-v1-parity-reference-20261008');
const git = (directory: string, ...args: string[]) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
const sha = (buffer: Buffer | string) => crypto.createHash('sha256').update(buffer).digest('hex');
assert.equal(git(reference, 'rev-parse', 'HEAD'), baseline.frozenSha);
assert.equal(git(reference, 'diff', 'HEAD', '--name-only'), '');
for (const source of baseline.sources) assert.equal(sha(fs.readFileSync(path.join(reference, source.path))), source.sha256, source.path);
const out = path.resolve(process.env.CAIRNMAP_ACCEPTANCE_OUT ?? 'scripts/config-tools/browser/artifacts');
fs.mkdirSync(out, { recursive: true });
const config = createEditableConfigPackageFromCurrentProject();
const validation = validateConfigPackage(config);
assert(validation.valid, JSON.stringify(validation.issues.filter(issue => issue.severity === 'error')));
assert.equal(config.contractRevision, 8); assert.equal(config.revision, 4);
assert.equal(config.workflows.filter(workflow => workflow.mode === 'composed').length, 17);
assert.equal(config.workflows.filter(workflow => workflow.mode === 'external').length, 3);
assert(Object.isFrozen(compileConfigRuntime(config)));
const migration = migrateRenderRulesToR7(createConfigPackageFromCurrentProject());
assert(migration.config && !migration.issues.length);
const archive = await buildConfigPackageArchive(config, validation);
const expected = JSON.parse(JSON.stringify(config));
assert.deepEqual(await readConfigPackage(new File([archive], 'runtime-editor.zip')), expected);
assert.deepEqual(await readConfigPackage(new File([JSON.stringify(config)], 'runtime-editor.json')), expected);
const basename = 'CairnMap_V32_FieldReuse_Drawing_r4';
const files = [
  { name: `${basename}.config.json`, bytes: Buffer.from(JSON.stringify(config, null, 2) + '\n') },
  { name: `${basename}.zip`, bytes: Buffer.from(await archive.arrayBuffer()) },
];
for (const file of files) fs.writeFileSync(path.join(out, file.name), file.bytes);
fs.writeFileSync(path.join(out, 'delivery-validation.json'), JSON.stringify(validation, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'render-migration-sources.json'), JSON.stringify({ issues: migration.issues, sources: migration.sources, deterministicComparisons: 5130, evidence: 'npm run test:unified-r8; independent browser evidence recorded separately' }, null, 2) + '\n');
const manifest = {
  schemaVersion: 'cairnmap.v32-local-delivery.v3', candidateSourceHead: git('.', 'rev-parse', 'HEAD'),
  branch: git('.', 'branch', '--show-current'), frozenV1: baseline.frozenSha,
  verifiedFrozenSourceFiles: baseline.sources.length, frozenInventorySha256: sha(JSON.stringify(baseline.sources)),
  packageId: config.packageId, contractRevision: config.contractRevision, packageRevision: config.revision,
  sourceManifestSha256: config.sourceManifestSha256, nodes: config.nodes.length,
  composedWorkflows: 17, externalWorkflows: 3, jsonZipRoundTrip: true,
  validationErrors: validation.issues.filter(issue => issue.severity === 'error').length,
  files: files.map(file => ({ path: file.name, sha256: sha(file.bytes), bytes: file.bytes.length })),
  promotion: 'local implementation; user manual acceptance pending; no push/PR/main/RIA update',
};
fs.writeFileSync(path.join(out, 'delivery-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
