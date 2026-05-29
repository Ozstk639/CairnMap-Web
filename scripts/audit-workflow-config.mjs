#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { coreSharedDir, EXPECTED_CLASS_CODES, listWorkflowConfigFiles } from './lib/audit-config-paths.mjs';

const root = process.cwd();
const sharedWorkflowDir = path.join(coreSharedDir(root), 'workflow');
const messages = [];
let errors = 0;
let warnings = 0;
const add = (level, message) => { messages.push({ level, message }); if (level === 'ERROR') errors += 1; if (level === 'WARN') warnings += 1; };
const readJson = (file, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { add('ERROR', `Unable to read ${path.relative(root, file)}: ${error.message}`); return fallback; }
};
const normalize = (value) => String(value ?? '').trim();
const normalizeClass = (value) => normalize(value).toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];

const workflowBlocksFile = path.join(sharedWorkflowDir, 'workflowBlocks.json');
const workflowComponentsFile = path.join(sharedWorkflowDir, 'workflowComponents.json');
const workflowContractsFile = path.join(sharedWorkflowDir, 'workflowRuntimeContracts.json');
const workflowFinalContractsFile = path.join(sharedWorkflowDir, 'workflowFinalContracts.json');
const workflowLegacyExecutorsFile = path.join(sharedWorkflowDir, 'workflowLegacyExecutors.json');

const blockConfig = readJson(workflowBlocksFile, { items: [] });
const componentsConfig = readJson(workflowComponentsFile, { items: [] });
const contractsConfig = readJson(workflowContractsFile, { items: [] });
const finalContractsConfig = fs.existsSync(workflowFinalContractsFile) ? readJson(workflowFinalContractsFile, { items: [] }) : { items: [] };
const legacyExecutorsConfig = readJson(workflowLegacyExecutorsFile, { items: [] });

const componentKeys = new Set(asArray(componentsConfig.items).flatMap((item) => [normalize(item.id), normalize(item.componentKey)]).filter(Boolean));
const legacyExecutorKeys = new Set(asArray(legacyExecutorsConfig.items).flatMap((item) => [normalize(item.id), normalize(item.componentKey)]).filter(Boolean));
const knownComponentKeys = new Set([...componentKeys, ...legacyExecutorKeys]);
const workflowById = new Map();
const workflowByClass = new Map();

for (const item of listWorkflowConfigFiles(root)) {
  if (!fs.existsSync(item.filePath)) {
    add('ERROR', `Missing workflow config: ${item.presetId}/workflows/${item.fileName}`);
    continue;
  }
  const workflow = readJson(item.filePath, null);
  if (!workflow) continue;
  const id = normalize(workflow.id);
  const classCode = normalizeClass(workflow.targetClass);
  const runtimeMode = normalize(workflow.runtimeMode);
  const componentKey = normalize(workflow.componentKey ?? workflow.uiRuntime?.componentKey);
  if (workflow.schemaVersion !== 'cairnmap.workflow.v1') add('ERROR', `${id || item.fileName}: schemaVersion mismatch`);
  if (!id) add('ERROR', `${item.fileName}: workflow.id missing`);
  if (workflowById.has(id)) add('ERROR', `${id}: duplicate workflow id`);
  workflowById.set(id, workflow);
  if (!classCode) add('ERROR', `${id}: targetClass missing`);
  else workflowByClass.set(classCode, workflow);
  if (runtimeMode !== 'componentExecutor') add('ERROR', `${id}: runtimeMode must be componentExecutor in final cleanup baseline`);
  if (!componentKey) add('ERROR', `${id}: componentKey missing`);
  else if (!knownComponentKeys.has(componentKey)) add('ERROR', `${id}: componentKey ${componentKey} is not registered`);
  if (workflow.blockRunnerReady !== false) add('ERROR', `${id}: blockRunnerReady must be false for legacy executor workflow`);
  if ('pages' in workflow) add('ERROR', `${id}: active workflow JSON must not contain pages`);
  if ('blocks' in workflow) add('ERROR', `${id}: active workflow JSON must not contain blocks`);
  if ('output' in workflow) add('ERROR', `${id}: active workflow JSON must not contain output assembly`);
}

const contractClasses = new Set(asArray(contractsConfig.items).map((item) => normalizeClass(item.classCode)));
const contractWorkflowIds = new Set(asArray(contractsConfig.items).map((item) => normalize(item.workflowId)));
const finalContractClasses = new Set(asArray(finalContractsConfig.items).map((item) => normalizeClass(item.classCode)));
for (const classCode of EXPECTED_CLASS_CODES) {
  if (!contractClasses.has(classCode)) add('ERROR', `${classCode}: missing workflow runtime contract`);
  if (!workflowByClass.has(classCode)) add('ERROR', `${classCode}: missing workflow config`);
  if (asArray(finalContractsConfig.items).length && !finalContractClasses.has(classCode)) add('ERROR', `${classCode}: missing workflow final contract`);
}
for (const workflowId of workflowById.keys()) {
  if (!contractWorkflowIds.has(workflowId)) add('WARN', `${workflowId}: no runtime contract references this workflow id`);
}

console.log('CairnMap Workflow Config Audit');
console.log('Summary');
console.log(`  Workflows checked: ${workflowById.size}`);
console.log(`  Components registered: ${componentKeys.size}`);
console.log(`  Legacy executors registered: ${legacyExecutorKeys.size}`);
console.log(`  Block definitions: ${asArray(blockConfig.items).length}`);
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
