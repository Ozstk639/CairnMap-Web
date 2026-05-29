#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
import { classConfigPath, coreSharedDir } from './lib/audit-config-paths.mjs';
const sharedDir = coreSharedDir(root);
const finalContractsPath = path.join(sharedDir, 'common', 'renderFormatFinalContracts.json');
const displayContractsPath = path.join(sharedDir, 'display', 'displayRuntimeContracts.json');
const formatContractsPath = path.join(sharedDir, 'format', 'formatRuntimeContracts.json');
const schemaContractsPath = path.join(sharedDir, 'format', 'schemaRuntimeContracts.json');
const compatibilityAdapterPath = path.join(root, 'src', 'core', 'project', 'renderFormatCompatibilityAdapter.ts');
const specialFormattersPath = path.join(sharedDir, 'format', 'formatSpecialFormatters.json');
const displayAlgorithmsPath = path.join(sharedDir, 'display', 'displayAlgorithms.json');

const expectedClasses = ['STA','PLF','RLE','PFB','STB','SBP','STF','ROD','TPP','WRP','TRP','ISP','ISL','ISG','BUD','FLR'];
const messages = [];
let errors = 0;
let warnings = 0;
let infos = 0;

function add(level, message) {
  messages.push({ level, message });
  if (level === 'ERROR') errors += 1;
  else if (level === 'WARN') warnings += 1;
  else infos += 1;
}

function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { add('ERROR', `Unable to read ${path.relative(root, filePath)}: ${error.message}`); return fallback; }
}

function asArray(value) { return Array.isArray(value) ? value : []; }
function normalize(value) { return String(value ?? '').trim(); }
function normalizeClassCode(value) { return normalize(value).toUpperCase(); }

if (!fs.existsSync(compatibilityAdapterPath)) add('ERROR', 'Missing renderFormatCompatibilityAdapter.ts');
const finalContracts = readJson(finalContractsPath, { items: [] });
const displayContracts = readJson(displayContractsPath, { items: [] });
const formatContracts = readJson(formatContractsPath, { items: [] });
const schemaContracts = readJson(schemaContractsPath, { items: [] });
const specialFormatters = readJson(specialFormattersPath, { items: [] });
const displayAlgorithms = readJson(displayAlgorithmsPath, { items: [] });

if (finalContracts?.schemaVersion !== 'cairnmap.render-format-final-contracts.v1') {
  add('ERROR', `renderFormatFinalContracts.json schemaVersion mismatch: ${String(finalContracts?.schemaVersion)}`);
}
if (finalContracts?.runtimeStatus !== 'completed') {
  add('ERROR', `renderFormatFinalContracts.json runtimeStatus must be completed, got ${String(finalContracts?.runtimeStatus)}`);
}

const finalByClass = new Map(asArray(finalContracts?.items).map((item) => [normalizeClassCode(item?.classCode), item]));
const displayByClass = new Map(asArray(displayContracts?.items).map((item) => [normalizeClassCode(item?.classCode), item]));
const formatByClass = new Map(asArray(formatContracts?.items).map((item) => [normalizeClassCode(item?.classCode), item]));
const schemaByClass = new Map(asArray(schemaContracts?.items).map((item) => [normalizeClassCode(item?.classCode), item]));
const algorithmKeys = new Set(asArray(displayAlgorithms?.items).map((item) => normalize(item?.algorithmKey || item?.id)).filter(Boolean));
const specialFormatterKeys = new Set(asArray(specialFormatters?.items).map((item) => normalize(item?.key)).filter(Boolean));

for (const classCode of expectedClasses) {
  const classPath = classConfigPath(root, classCode);
  if (!fs.existsSync(classPath)) add('ERROR', `Missing class config: ${classCode}.json`);

  const final = finalByClass.get(classCode);
  if (!final) {
    add('ERROR', `${classCode} missing render-format final contract`);
    continue;
  }
  if (final.displaySource !== 'config') add('ERROR', `${classCode} displaySource must be config, got ${String(final.displaySource)}`);
  if (final.formatSource !== 'config') add('ERROR', `${classCode} formatSource must be config, got ${String(final.formatSource)}`);
  if (final.schemaSource !== 'config') add('ERROR', `${classCode} schemaSource must be config, got ${String(final.schemaSource)}`);
  if (final.completionStatus !== 'configDefinitionComplete') add('ERROR', `${classCode} completionStatus must be configDefinitionComplete`);
  const displayContract = displayByClass.get(classCode);
  if (!displayContract) add('ERROR', `${classCode} missing display runtime contract`);
  else if (displayContract.mode !== 'configPrimary') add('ERROR', `${classCode} display runtime contract must be configPrimary in FINAL_3+, got ${displayContract.mode}`);
  const formatContract = formatByClass.get(classCode);
  if (!formatContract) add('ERROR', `${classCode} missing format runtime contract`);
  else if (formatContract.formatterKey && !specialFormatterKeys.has(formatContract.formatterKey)) add('ERROR', `${classCode} references unregistered special formatter: ${formatContract.formatterKey}`);
  if (!schemaByClass.has(classCode)) add('ERROR', `${classCode} missing schema runtime contract`);

  const classConfig = readJson(classConfigPath(root, classCode), null);
  for (const rule of asArray(classConfig?.display?.rules)) {
    for (const algorithm of asArray(rule?.algorithms)) {
      const key = normalize(algorithm?.key);
      if (!key) add('ERROR', `${classCode} display rule contains algorithm without key`);
      else if (!algorithmKeys.has(key)) add('ERROR', `${classCode} references unregistered display algorithm: ${key}`);
    }
  }
}

for (const item of asArray(finalContracts?.items)) {
  const classCode = normalizeClassCode(item?.classCode);
  if (!expectedClasses.includes(classCode)) add('ERROR', `renderFormatFinalContracts references unknown class: ${classCode || '<empty>'}`);
}

console.log('CairnMap Render / Format Final Audit');
console.log(`Assembly source: presets + openriamap-ria project`);
console.log('');
console.log('Summary');
console.log(`  Classes checked: ${expectedClasses.length}`);
console.log(`  Final contracts: ${asArray(finalContracts?.items).length}`);
console.log(`  Legacy files: ${asArray(finalContracts?.legacyFiles).length}`);
console.log(`  Display contracts: ${asArray(displayContracts?.items).length}`);
console.log(`  Format contracts: ${asArray(formatContracts?.items).length}`);
console.log(`  Schema contracts: ${asArray(schemaContracts?.items).length}`);
console.log(`  Display algorithms: ${asArray(displayAlgorithms?.items).length}`);
console.log(`  Errors: ${errors}`);
console.log(`  Warnings: ${warnings}`);
console.log(`  Info: ${infos}`);
console.log('');
console.log('Per-Class Summary');
for (const classCode of expectedClasses) {
  const item = finalByClass.get(classCode);
  console.log(`  ${classCode}: display=${item?.displayContract ?? 'missing'} format=${item?.formatContract ?? 'missing'} legacyRole=${item?.legacyRole ?? 'missing'}`);
}
if (messages.length) {
  console.log('');
  console.log('Checks');
  for (const message of messages) console.log(`  [${message.level}] ${message.message}`);
}
console.log('');
const result = errors > 0 ? 'FAIL' : warnings > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';
console.log(`Result: ${result}`);
process.exitCode = errors > 0 ? 1 : 0;
