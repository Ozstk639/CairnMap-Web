#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
import { classConfigPath, coreSharedDir } from './lib/audit-config-paths.mjs';
const sharedDir = coreSharedDir(root);
const schemaContractsPath = path.join(sharedDir, 'format', 'schemaRuntimeContracts.json');
const formatContractsPath = path.join(sharedDir, 'format', 'formatRuntimeContracts.json');
const featureFormatsPath = path.join(root, 'src', 'components', 'Common', 'featureFormats.ts');
const specialFormattersPath = path.join(sharedDir, 'format', 'formatSpecialFormatters.json');

const expectedClasses = ['STA', 'PLF', 'RLE', 'PFB', 'STB', 'SBP', 'STF', 'ROD', 'TPP', 'WRP', 'TRP', 'ISP', 'ISL', 'ISG', 'BUD', 'FLR'];
const genericDiagnosticExpected = new Set(['ISP', 'ISL', 'ISG', 'BUD', 'FLR', 'ROD', 'TPP', 'WRP']);
const messages = [];
let errors = 0;
let warnings = 0;
let infos = 0;

function add(level, message) {
  messages.push({ level, message });
  if (level === 'ERROR') errors += 1;
  else if (level === 'WARN') warnings += 1;
  else if (level === 'INFO') infos += 1;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    add('ERROR', `Unable to read JSON ${path.relative(root, filePath)}: ${error.message}`);
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    add('ERROR', `Unable to read text ${path.relative(root, filePath)}: ${error.message}`);
    return '';
  }
}

function normalize(value) {
  return String(value ?? '').trim();
}

function normalizeClassCode(value) {
  return normalize(value).toUpperCase();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkUnique(owner, items, keyName = 'key') {
  const seen = new Set();
  for (const item of asArray(items)) {
    const key = normalize(item?.[keyName]);
    if (!key) continue;
    if (seen.has(key)) add('ERROR', `${owner} duplicate ${keyName}: ${key}`);
    seen.add(key);
  }
}

const featureFormatsText = readText(featureFormatsPath);
const specialFormattersConfig = readJson(specialFormattersPath, { items: [] });
const specialFormatterKeys = new Set(asArray(specialFormattersConfig?.items).map((item) => normalize(item?.key)).filter(Boolean));

const loadedClasses = expectedClasses.map((classCode) => {
  const filePath = classConfigPath(root, classCode);
  return { classCode, filePath, config: readJson(filePath, null) };
});

const classByCode = new Map();
for (const item of loadedClasses) {
  if (!item.config) continue;
  const classCode = normalizeClassCode(item.config.classCode || item.classCode);
  classByCode.set(classCode, item.config);
}

const contractsConfig = readJson(schemaContractsPath, { items: [] });
const contracts = asArray(contractsConfig?.items);
const contractByClassCode = new Map(contracts.map((item) => [normalizeClassCode(item?.classCode), item]));
const formatContractsConfig = readJson(formatContractsPath, { items: [] });
const formatContracts = asArray(formatContractsConfig?.items);
const formatContractByClassCode = new Map(formatContracts.map((item) => [normalizeClassCode(item?.classCode), item]));

if (contractsConfig?.schemaVersion !== 'cairnmap.schema-runtime-contracts.v1') {
  add('ERROR', `schemaRuntimeContracts.json schemaVersion mismatch: ${String(contractsConfig?.schemaVersion)}`);
}
if (formatContractsConfig?.schemaVersion !== 'cairnmap.format-runtime-contracts.v1') {
  add('ERROR', `formatRuntimeContracts.json schemaVersion mismatch: ${String(formatContractsConfig?.schemaVersion)}`);
}

for (const classCode of expectedClasses) {
  const config = classByCode.get(classCode);
  if (!config) {
    add('ERROR', `Missing class config: ${classCode}.json`);
    continue;
  }

  const contract = contractByClassCode.get(classCode);
  if (!contract) add('ERROR', `${classCode} missing schema runtime contract`);
  else {
    if (!contract.schemaMode) add('ERROR', `${classCode} schema contract missing schemaMode`);
    if (!contract.formatMode) add('ERROR', `${classCode} schema contract missing formatMode`);
    if (genericDiagnosticExpected.has(classCode) && contract.formatMode !== 'genericDiagnostic' && contract.formatMode !== 'genericConfigPrimary') {
      add('WARN', `${classCode} is expected to participate in generic format diagnostics, got ${contract.formatMode}`);
    }
    if (contract.sourceFeatureKey && config.sourceFeatureKey && contract.sourceFeatureKey !== config.sourceFeatureKey) {
      add('WARN', `${classCode} contract sourceFeatureKey differs from class config`);
    }
  }

  const formatContract = formatContractByClassCode.get(classCode);
  if (!formatContract) add('ERROR', `${classCode} missing format runtime contract`);
  else {
    if (!formatContract.formatMode) add('ERROR', `${classCode} format runtime contract missing formatMode`);
    if ((formatContract.formatMode === 'specialFormatter' || formatContract.formatMode === 'specialFormatterConfigPrimary') && !formatContract.formatterKey) {
      add('ERROR', `${classCode} special formatter contract missing formatterKey`);
    }
    if (formatContract.formatterKey && !specialFormatterKeys.has(formatContract.formatterKey)) {
      add('ERROR', `${classCode} references unregistered special formatter: ${formatContract.formatterKey}`);
    }
  }

  if (!isObject(config.geometry)) add('ERROR', `${classCode} missing geometry object`);
  else {
    if (!normalize(config.geometry.type)) add('ERROR', `${classCode} missing geometry.type`);
    if (!normalize(config.geometry.sourceField)) add('ERROR', `${classCode} missing geometry.sourceField`);
  }

  if (!isObject(config.identity)) add('ERROR', `${classCode} missing identity object`);
  else {
    const idField = normalize(config.identity.idField);
    if (!idField) add('ERROR', `${classCode} missing identity.idField`);
    const nameField = normalize(config.identity.nameField);
    if (!nameField) add('WARN', `${classCode} missing identity.nameField`);
  }

  if (config.sourceFeatureKey && !featureFormatsText.includes(config.sourceFeatureKey)) {
    add('WARN', `${classCode} sourceFeatureKey was not found in featureFormats.ts text: ${config.sourceFeatureKey}`);
  }
  if (!Array.isArray(config.fields)) add('ERROR', `${classCode} fields must be an array`);
  else {
    checkUnique(`${classCode} fields`, config.fields);
    for (const field of config.fields) {
      if (!normalize(field?.key)) add('ERROR', `${classCode} contains field without key`);
      if (!field?.label) add('ERROR', `${classCode}.${normalize(field?.key)} missing label`);
      if (!normalize(field?.type)) add('ERROR', `${classCode}.${normalize(field?.key)} missing type`);
    }
  }

  if (!Array.isArray(config.groups)) add('ERROR', `${classCode} groups must be an array`);
  else {
    checkUnique(`${classCode} groups`, config.groups);
    for (const group of config.groups) {
      if (!normalize(group?.key)) add('ERROR', `${classCode} contains group without key`);
      if (!Array.isArray(group?.fields)) add('ERROR', `${classCode}.${normalize(group?.key)} group.fields must be an array`);
      else checkUnique(`${classCode}.${normalize(group?.key)} group.fields`, group.fields);
    }
  }

  if (!isObject(config.tags)) add('ERROR', `${classCode} tags must be an object`);
  if (!isObject(config.extensions)) add('ERROR', `${classCode} extensions must be an object`);
}

for (const contract of contracts) {
  const classCode = normalizeClassCode(contract?.classCode);
  if (!classCode) add('ERROR', 'schemaRuntimeContracts contains item without classCode');
  else if (!classByCode.has(classCode)) add('ERROR', `schemaRuntimeContracts references unknown class: ${classCode}`);
}

console.log('CairnMap Schema / Format Audit');
console.log(`Assembly source: presets + openriamap-ria project`);
console.log('');
console.log('Summary');
console.log(`  Classes checked: ${expectedClasses.length}`);
console.log(`  Schema contracts: ${contracts.length}`);
console.log(`  Format contracts: ${formatContracts.length}`);
console.log(`  genericConfigPrimary: ${formatContracts.filter((item) => item?.formatMode === 'genericConfigPrimary').length}`);
console.log(`  Errors: ${errors}`);
console.log(`  Warnings: ${warnings}`);
console.log(`  Info: ${infos}`);
console.log('');
console.log('Per-Class Summary');
for (const classCode of expectedClasses) {
  const config = classByCode.get(classCode);
  const contract = contractByClassCode.get(classCode);
  console.log(`  ${classCode}: fields=${asArray(config?.fields).length} groups=${asArray(config?.groups).length} schemaMode=${contract?.schemaMode ?? 'missing'} formatMode=${contract?.formatMode ?? 'missing'}`);
}
if (messages.length) {
  console.log('');
  console.log('Checks');
  for (const message of messages) console.log(`  [${message.level}] ${message.message}`);
}
console.log('');
const result = errors > 0 ? 'FAIL' : warnings > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';
console.log(`Result: ${result}`);
process.exit(errors > 0 ? 1 : 0);
