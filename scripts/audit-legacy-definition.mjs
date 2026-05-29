#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const messages = [];
let errors = 0;
let warnings = 0;
const add = (level, message) => { messages.push({ level, message }); if (level === 'ERROR') errors += 1; if (level === 'WARN') warnings += 1; };
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const read = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
};
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { add('ERROR', `${rel(file)}: invalid JSON (${error.message})`); return null; }
};

const packageJson = readJson(path.join(root, 'package.json'));
if (packageJson?.scripts?.build && String(packageJson.scripts.build).includes('export:data-schema')) add('ERROR', 'package.json build must not call export:data-schema');
if (packageJson?.scripts?.['export:data-schema']) add('ERROR', 'package.json must not expose formal export:data-schema script');
if (fs.existsSync(path.join(root, 'scripts/export-data-schema.mjs'))) add('ERROR', 'scripts/export-data-schema.mjs must be removed');
if (fs.existsSync(path.join(root, 'src/schemas/data_tool_schema.json'))) add('ERROR', 'src/schemas/data_tool_schema.json must be removed');

const featureFormats = read(path.join(root, 'src/components/Common/featureFormats.ts'));
if (/WORKFLOW_FEATURE_CATALOG\s*:\s*[^=]+\=\s*\[/.test(featureFormats)) add('ERROR', 'featureFormats.ts must not contain WORKFLOW_FEATURE_CATALOG array literal definitions');
if (/FORMAT_REGISTRY\s*:\s*[^=]+\=\s*\{/.test(featureFormats)) add('ERROR', 'featureFormats.ts must not contain FORMAT_REGISTRY object literal definitions');
if (/WORLD_CODE_BY_WORLD_ID\s*:\s*[^=]+\=\s*\{/.test(featureFormats)) add('ERROR', 'featureFormats.ts must derive WORLD_CODE_BY_WORLD_ID from environment/worlds.json');

const forbiddenRootShared = walk(path.join(root, 'project-config/presets/core-structures/shared')).filter((file) => path.dirname(file) === path.join(root, 'project-config/presets/core-structures/shared') && file.endsWith('.json'));
for (const file of forbiddenRootShared) add('ERROR', `legacy shared root JSON must be removed: ${rel(file)}`);

for (const file of walk(path.join(root, 'project-config')).filter((f) => f.endsWith('.json'))) {
  const text = read(file);
  if (/\bshadow\b|Shadow/.test(text)) add('ERROR', `${rel(file)} contains shadow marker`);
}

for (const file of walk(path.join(root, 'project-config/presets')).filter((f) => f.includes(`${path.sep}workflows${path.sep}`) && f.endsWith('.json'))) {
  const workflow = readJson(file);
  if (!workflow) continue;
  for (const key of ['pages', 'blocks', 'output']) {
    if (Object.prototype.hasOwnProperty.call(workflow, key)) add('ERROR', `${rel(file)} must not contain ${key}`);
  }
  if (workflow.runtimeMode !== 'componentExecutor') add('ERROR', `${rel(file)} must use runtimeMode=componentExecutor`);
  if (workflow.blockRunnerReady !== false) add('ERROR', `${rel(file)} must set blockRunnerReady=false`);
  if (!workflow.componentKey) add('ERROR', `${rel(file)} componentKey missing`);
}

const sourceFiles = [
  'src/core/project/openriamapRiaShared.ts',
  'src/core/project/displayMetadata.ts',
  'src/core/project/formatRuntimeContracts.ts',
  'src/core/project/schemaRuntimeContracts.ts',
  'src/core/project/renderFormatFinalMetadata.ts',
  'src/core/project/workflowMetadata.ts',
].map((item) => path.join(root, item));
for (const file of sourceFiles) {
  const text = read(file);
  if (/presets\/core-structures\/shared\/[A-Za-z0-9_-]+\.json/.test(text)) add('ERROR', `${rel(file)} imports legacy shared root JSON`);
}

console.log('CairnMap Legacy Definition Hard Audit');
console.log('Summary');
console.log(`  Errors: ${errors}`);
console.log(`  Warnings: ${warnings}`);
if (messages.length) {
  console.log('');
  console.log('Checks');
  for (const message of messages) console.log(`  [${message.level}] ${message.message}`);
}
console.log('');
console.log(`Result: ${errors > 0 ? 'FAIL' : warnings > 0 ? 'PASS_WITH_WARNINGS' : 'PASS'}`);
process.exitCode = errors > 0 ? 1 : 0;
