import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';

const reference = path.resolve(process.env.CAIRNMAP_V1_REFERENCE ?? '../cairnmap-v1-parity-reference-20261008');
const frozenSha = '0b82863d4fea3791f98917ba6d13f70e1f27eb15';
const git = (...args: string[]) => execFileSync('git', ['-C', reference, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== frozenSha || git('diff', '--name-only')) throw new Error('V1 参照不是未修改的冻结提交。');
const files = git('ls-files', '-z', 'src', 'public', 'project-config', 'package.json', 'package-lock.json', 'vite.config.ts').split('\0').filter(Boolean);
const sources = files.map(file => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(reference, file))).digest('hex') }));
const config = createConfigPackageFromCurrentProject();
const sourceFile = ts.createSourceFile('types.ts', fs.readFileSync('src/configStudio/types.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const parameters: Array<{ type: string; field: string; optional: boolean; state: string; evidenceRequired: string[] }> = [];
for (const declaration of sourceFile.statements) {
  if (!ts.isTypeAliasDeclaration(declaration) || !ts.isTypeLiteralNode(declaration.type)) continue;
  for (const member of declaration.type.members) if (ts.isPropertySignature(member) && member.name) parameters.push({
    type: declaration.name.text, field: member.name.getText(sourceFile), optional: Boolean(member.questionToken),
    state: 'pending_consumer_and_editing_audit', evidenceRequired: ['effective-default', 'editor-or-system-policy', 'save-validation', 'archive-roundtrip', 'runtime-consumer', 'map-preview-parity'],
  });
}
const baseline = { schemaVersion: 'cairnmap.v1-independent-baseline.v1', frozenSha, sources,
  comparisonEnvironment: { world: 'zth', logicalZoom: [0, 1, 2, 3, 4, 5, 6, 7, 8], viewport: [1440, 1000], mapSize: [1200, 900], deviceScaleFactor: 1, renderer: 'independent frozen RuleDrivenLayer, styles and helpers', loadedFontRequired: true },
  candidateInventory: { nodes: config.nodes.map(node => ({ nodeId: node.nodeId, classification: node.path })), workflows: config.workflows.map(workflow => ({ id: workflow.id, mode: workflow.mode, outputs: workflow.outputs.map(output => ({ id: output.id, classification: output.classification, geometry: output.geometry.selected })) })) },
};
fs.writeFileSync('scripts/config-tools/fixtures/v1-independent-baseline.json', JSON.stringify(baseline, null, 2) + '\n');
fs.writeFileSync('scripts/config-tools/fixtures/v3-parameter-ledger.json', JSON.stringify({ schemaVersion: 'cairnmap.v3-parameter-ledger.v1', note: 'Direct named contract members; pending is not a claim of support. Nested settings require their own runtime evidence.', parameters }, null, 2) + '\n');
console.log(JSON.stringify({ frozenSha, sourceFiles: sources.length, candidateNodes: config.nodes.length, workflows: config.workflows.length, directContractParameters: parameters.length }));
