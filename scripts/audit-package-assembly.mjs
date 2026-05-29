#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const assemblyPath = path.join(root, 'project-config/assemblies/openriamap-ria.json');
const projectPath = path.join(root, 'project-config/packages/openriamap-ria/project.json');
const presetsRoot = path.join(root, 'project-config/presets');
const expectedPresets = ['core-structures','building','rail','road','teleport','warp','trade'];
const expectedClasses = ['STA','PLF','RLE','PFB','STB','SBP','STF','ROD','TPP','WRP','TRP','ISP','ISL','ISG','BUD','FLR'];
let errors = 0;
let warnings = 0;
const messages = [];
const add = (level, message) => { messages.push({ level, message }); if (level === 'ERROR') errors += 1; if (level === 'WARN') warnings += 1; };
const readJson = (filePath) => {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { add('ERROR', `Unable to read ${path.relative(root, filePath)}: ${error.message}`); return null; }
};
const normalize = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];

const assembly = readJson(assemblyPath);
const project = readJson(projectPath);
const projectPackage = readJson(path.join(root, 'project-config/packages/openriamap-ria/package.json'));
if (assembly?.schemaVersion !== 'cairnmap.assembly.v1') add('ERROR', 'assembly schemaVersion mismatch');
if (project?.schemaVersion !== 'cairnmap.project-package.v1') add('ERROR', 'project schemaVersion mismatch');

const projectPresets = new Set(asArray(project?.presets).map(normalize).filter(Boolean));
for (const id of expectedPresets) {
  if (!projectPresets.has(id)) add('ERROR', `project.json missing preset: ${id}`);
  const presetDir = path.join(presetsRoot, id);
  const presetJson = readJson(path.join(presetDir, 'preset.json'));
  if (!fs.existsSync(presetDir)) add('ERROR', `Missing preset directory: ${id}`);
  if (presetJson?.nativePreset !== true) add('ERROR', `${id}/preset.json must set nativePreset=true`);
}

const classOwner = new Map();
for (const id of expectedPresets) {
  const presetJson = readJson(path.join(presetsRoot, id, 'preset.json'));
  for (const classCode of asArray(presetJson?.providedClasses)) {
    const code = normalize(classCode).toUpperCase();
    if (!code) continue;
    if (classOwner.has(code)) add('ERROR', `Class ${code} provided by both ${classOwner.get(code)} and ${id}`);
    classOwner.set(code, id);
    if (!fs.existsSync(path.join(presetsRoot, id, 'classes', `${code}.json`))) add('ERROR', `${id} declares ${code} but classes/${code}.json is missing`);
  }
  for (const workflowId of asArray(presetJson?.providedWorkflows)) {
    if (!fs.existsSync(path.join(presetsRoot, id, 'workflows', `${workflowId}.json`))) add('ERROR', `${id} declares workflow ${workflowId} but workflow file is missing`);
  }
}
for (const classCode of expectedClasses) {
  if (!classOwner.has(classCode)) add('ERROR', `No preset provides class ${classCode}`);
}


const legacyProjectDefinitionDirs = [
  'project-config/packages/openriamap-ria/classes',
  'project-config/packages/openriamap-ria/shared',
  'project-config/packages/openriamap-ria/workflows',
];
for (const rel of legacyProjectDefinitionDirs) {
  if (fs.existsSync(path.join(root, rel))) add('ERROR', `Legacy project definition directory should be removed after preset cleanup: ${rel}`);
}
if (projectPackage?.contains?.classes !== false) add('ERROR', 'openriamap-ria/package.json contains.classes must be false after preset cleanup');
if (projectPackage?.contains?.shared !== false) add('ERROR', 'openriamap-ria/package.json contains.shared must be false after preset cleanup');
if (projectPackage?.contains?.workflows !== false) add('ERROR', 'openriamap-ria/package.json contains.workflows must be false after preset cleanup');

const legacySharedRootFiles = fs.existsSync(path.join(presetsRoot, 'core-structures/shared'))
  ? fs.readdirSync(path.join(presetsRoot, 'core-structures/shared')).filter((name) => name.endsWith('.json'))
  : [];
for (const fileName of legacySharedRootFiles) {
  add('ERROR', `Legacy shared root JSON should be removed: project-config/presets/core-structures/shared/${fileName}`);
}

const assemblyPaths = new Set(asArray(assembly?.loadOrder).filter((item) => item?.enabled !== false).map((item) => normalize(item?.path)));
for (const id of expectedPresets) {
  if (!assemblyPaths.has(`../presets/${id}`)) add('ERROR', `assembly loadOrder missing ../presets/${id}`);
}
if (!assemblyPaths.has('../packages/openriamap-ria')) add('ERROR', 'assembly loadOrder missing project package');

console.log('CairnMap Package Assembly Audit');
console.log('Summary');
console.log(`  Presets checked: ${expectedPresets.length}`);
console.log(`  Classes checked: ${expectedClasses.length}`);
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
