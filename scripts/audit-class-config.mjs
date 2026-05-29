#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
import { listClassConfigFiles, EXPECTED_CLASS_CODES } from './lib/audit-config-paths.mjs';
const CLASSES_LABEL = 'project-config/presets/*/classes';
const FEATURE_FORMATS_PATH = path.join(ROOT, 'src', 'components', 'Common', 'featureFormats.ts');

const EXPECTED_CLASSES = {
  STA: { geometryType: 'Point', sourceField: 'coordinate', defaultType: 'Points', catalogExpected: false },
  PLF: { geometryType: 'Point', sourceField: 'coordinate', defaultType: 'Points', catalogExpected: false },
  SBP: { geometryType: 'Point', sourceField: 'coordinate', defaultType: 'Points', catalogExpected: false },
  TPP: { geometryType: 'Point', sourceField: 'coordinate', defaultType: 'Points', catalogExpected: true },
  WRP: { geometryType: 'Point', sourceField: 'coordinate', defaultType: 'Points', catalogExpected: true },
  TRP: { geometryType: 'Point', sourceField: 'coordinate', defaultType: 'Points', catalogExpected: true },
  ISP: { geometryType: 'Point', sourceField: 'coordinate', defaultType: 'Points', catalogExpected: true },
  RLE: { geometryType: 'LineString', sourceField: 'PLpoints', defaultType: 'Polyline', catalogExpected: false },
  ROD: { geometryType: 'LineString', sourceField: 'Linepoints', defaultType: 'Polyline', catalogExpected: true },
  ISL: { geometryType: 'LineString', sourceField: 'Linepoints', defaultType: 'Polyline', catalogExpected: true },
  PFB: { geometryType: 'Polygon', sourceField: 'Flrpoints', defaultType: 'Polygon', catalogExpected: false },
  STB: { geometryType: 'Polygon', sourceField: 'Conpoints', defaultType: 'Polygon', catalogExpected: false },
  STF: { geometryType: 'Polygon', sourceField: 'Flrpoints', defaultType: 'Polygon', catalogExpected: false },
  ISG: { geometryType: 'Polygon', sourceField: 'Conpoints', defaultType: 'Polygon', catalogExpected: true },
  BUD: { geometryType: 'Polygon', sourceField: 'Conpoints', defaultType: 'Polygon', catalogExpected: true },
  FLR: { geometryType: 'Polygon', sourceField: 'Flrpoints', defaultType: 'Polygon', catalogExpected: true },
};

const REQUIRED_TOP_LEVEL_KEYS = [
  'schemaVersion',
  'projectId',
  'runtimeStatus',
  'classCode',
  'classKey',
  'sourceFeatureKey',
  'label',
  'data',
  'geometry',
  'identity',
  'classification',
  'fields',
  'groups',
  'tags',
  'extensions',
  'display',
  'card',
  'workflowBindings',
];

/** @type {{level:'OK'|'INFO'|'WARN'|'ERROR', message:string}[]} */
const messages = [];

function add(level, message) {
  messages.push({ level, message });
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    add('ERROR', `${path.relative(ROOT, filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function labelToString(label) {
  if (typeof label === 'string') return label;
  if (isObject(label)) {
    return label['zh-CN'] || label.zh || label.en || Object.values(label).find((v) => typeof v === 'string') || '';
  }
  return '';
}

function findDuplicateKeys(items, getKey) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    if (seen.has(key)) duplicates.push([key, seen.get(key), item]);
    else seen.set(key, item);
  }
  return duplicates;
}

function checkArrayUnique(ownerLabel, items, keyName = 'key') {
  if (!Array.isArray(items)) return;
  const seen = new Set();
  for (const item of items) {
    const key = item?.[keyName];
    if (!key) continue;
    if (seen.has(key)) add('ERROR', `${ownerLabel} duplicate ${keyName}: ${key}`);
    seen.add(key);
  }
}

function featureTextContains(featureText, token) {
  if (!token) return true;
  return featureText.includes(String(token));
}

function checkClassConfig(fileName, config, featureText) {
  const expectedCode = path.basename(fileName, '.json');
  const classLabel = `${expectedCode}.json`;

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!hasOwn(config, key)) add('ERROR', `${classLabel} missing top-level key: ${key}`);
  }

  if (config.schemaVersion !== 'cairnmap.class.v1') {
    add('ERROR', `${classLabel} schemaVersion expected cairnmap.class.v1, got ${String(config.schemaVersion)}`);
  }

  if (!['active', 'configPrimary'].includes(config.runtimeStatus)) {
    add('ERROR', `${classLabel} runtimeStatus must be active/configPrimary after final cleanup: ${String(config.runtimeStatus)}`);
  }

  if (config.classCode !== expectedCode) {
    add('ERROR', `${classLabel} classCode mismatch: expected ${expectedCode}, got ${String(config.classCode)}`);
  }

  const expected = EXPECTED_CLASSES[expectedCode];
  if (expected) {
    if (config.geometry?.type !== expected.geometryType) {
      add('ERROR', `${classLabel} geometry.type expected ${expected.geometryType}, got ${String(config.geometry?.type)}`);
    }
    if (config.geometry?.sourceField !== expected.sourceField) {
      add('ERROR', `${classLabel} geometry.sourceField expected ${expected.sourceField}, got ${String(config.geometry?.sourceField)}`);
    }
    if (config.data?.defaultType !== expected.defaultType) {
      add('ERROR', `${classLabel} data.defaultType expected ${expected.defaultType}, got ${String(config.data?.defaultType)}`);
    }
    if (config.data?.defaultClass !== expectedCode) {
      add('ERROR', `${classLabel} data.defaultClass expected ${expectedCode}, got ${String(config.data?.defaultClass)}`);
    }
  }

  if (!config.identity?.idField) add('ERROR', `${classLabel} missing identity.idField`);
  if (!config.identity?.nameField) add('ERROR', `${classLabel} missing identity.nameField`);
  if (config.identity?.idField && config.identity.idField !== 'ID') {
    add('WARN', `${classLabel} identity.idField is not ID: ${config.identity.idField}`);
  }
  if (config.identity?.nameField && config.identity.nameField !== 'Name') {
    add('WARN', `${classLabel} identity.nameField is not Name: ${config.identity.nameField}`);
  }

  if (!Array.isArray(config.fields)) {
    add('ERROR', `${classLabel} fields must be an array`);
  } else {
    if (config.fields.length === 0) add('WARN', `${classLabel} has no fields`);
    checkArrayUnique(`${classLabel} fields`, config.fields);
    for (const field of config.fields) {
      if (!field?.key) add('ERROR', `${classLabel} contains a field without key`);
      if (!field?.label) add('ERROR', `${classLabel} field ${String(field?.key)} missing label`);
      if (!field?.type) add('ERROR', `${classLabel} field ${String(field?.key)} missing type`);
    }
  }

  if (!Array.isArray(config.groups)) {
    add('ERROR', `${classLabel} groups must be an array`);
  } else {
    checkArrayUnique(`${classLabel} groups`, config.groups);
    for (const group of config.groups) {
      if (!group?.key) add('ERROR', `${classLabel} contains a group without key`);
      if (!group?.label) add('ERROR', `${classLabel} group ${String(group?.key)} missing label`);
      if (!group?.type) add('ERROR', `${classLabel} group ${String(group?.key)} missing type`);
      if (!Array.isArray(group?.fields)) {
        add('WARN', `${classLabel} group ${String(group?.key)} fields should be an array`);
      } else {
        checkArrayUnique(`${classLabel} group ${String(group.key)} fields`, group.fields);
      }
    }
  }

  const classification = config.classification;
  if (!isObject(classification)) {
    add('ERROR', `${classLabel} classification must be an object`);
  } else {
    if (!Array.isArray(classification.options)) add('ERROR', `${classLabel} classification.options must be an array`);
    else {
      if (expected?.catalogExpected && classification.options.length === 0) {
        add('WARN', `${classLabel} is expected to have classification options, but options is empty`);
      }
      for (const [index, option] of classification.options.entries()) {
        const optionLabel = `${classLabel} classification.options[${index}]`;
        if (!option?.kind) add('ERROR', `${optionLabel} missing kind`);
        if (!option?.label) add('ERROR', `${optionLabel} missing label`);
        if (option?.skind2 && !option?.skind) add('WARN', `${optionLabel} has skind2 without skind`);
        if (!labelToString(option?.label)) add('WARN', `${optionLabel} has empty localized label`);
      }
    }
  }

  const tags = config.tags;
  if (!isObject(tags)) add('ERROR', `${classLabel} tags must be an object`);
  else {
    if (typeof tags.enabled !== 'boolean') add('ERROR', `${classLabel} tags.enabled must be boolean`);
    if (tags.enabled && typeof tags.allowOther !== 'boolean') add('WARN', `${classLabel} tags.allowOther should be boolean when tags are enabled`);
    if (!Array.isArray(tags.items)) add('ERROR', `${classLabel} tags.items must be an array`);
  }

  const extensions = config.extensions;
  if (!isObject(extensions)) add('ERROR', `${classLabel} extensions must be an object`);
  else {
    if (typeof extensions.enabled !== 'boolean') add('ERROR', `${classLabel} extensions.enabled must be boolean`);
    if (extensions.enabled && typeof extensions.allowOtherNamespaces !== 'boolean') {
      add('WARN', `${classLabel} extensions.allowOtherNamespaces should be boolean when extensions are enabled`);
    }
    if (!Array.isArray(extensions.namespaces)) add('ERROR', `${classLabel} extensions.namespaces must be an array`);
  }

  if (!['active', 'configPrimary'].includes(config.display?.runtimeStatus)) {
    add('ERROR', `${classLabel} display.runtimeStatus must be active/configPrimary`);
  }
  if (config.card?.runtimeStatus && !['active', 'configPrimary'].includes(config.card.runtimeStatus)) {
    add('ERROR', `${classLabel} card.runtimeStatus must be active/configPrimary when present`);
  }

  if (!Array.isArray(config.workflowBindings)) {
    add('ERROR', `${classLabel} workflowBindings must be an array`);
  }

}

function printReport(classConfigs) {
  const grouped = messages.reduce((acc, message) => {
    acc[message.level] = (acc[message.level] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

  const errors = grouped.ERROR || 0;
  const warnings = grouped.WARN || 0;
  const infos = grouped.INFO || 0;
  const oks = grouped.OK || 0;

  console.log('CairnMap Class Config Audit');
  console.log('Baseline package: openriamap-ria');
  console.log(`Classes source: ${CLASSES_LABEL}`);
  console.log('');
  console.log('Summary');
  console.log(`  Classes found: ${classConfigs.length}`);
  console.log(`  OK: ${oks}`);
  console.log(`  Info: ${infos}`);
  console.log(`  Warnings: ${warnings}`);
  console.log(`  Errors: ${errors}`);
  console.log('');

  if (messages.length) {
    console.log('Checks');
    for (const message of messages) {
      console.log(`  [${message.level}] ${message.message}`);
    }
    console.log('');
  }

  console.log('Per-Class Summary');
  for (const config of classConfigs.sort((a, b) => String(a.classCode).localeCompare(String(b.classCode)))) {
    console.log(
      `  ${String(config.classCode).padEnd(3)}: fields=${Array.isArray(config.fields) ? config.fields.length : 'n/a'} ` +
        `groups=${Array.isArray(config.groups) ? config.groups.length : 'n/a'} ` +
        `classification=${Array.isArray(config.classification?.options) ? config.classification.options.length : 'n/a'} ` +
        `tags=${Boolean(config.tags?.enabled)} extensions=${Boolean(config.extensions?.enabled)}`,
    );
  }
  console.log('');

  const result = errors > 0 ? 'FAIL' : warnings > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';
  console.log(`Result: ${result}`);
}

function main() {
  const featureText = fs.existsSync(FEATURE_FORMATS_PATH) ? fs.readFileSync(FEATURE_FORMATS_PATH, 'utf8') : '';
  if (!featureText) add('WARN', 'featureFormats.ts text was not available; legacy text checks are skipped');

  const classFiles = listClassConfigFiles(ROOT);
  const jsonClassCodes = new Set();
  const classConfigs = [];
  for (const item of classFiles) {
    if (!fs.existsSync(item.filePath)) {
      add('ERROR', `Missing class config: ${item.presetId}/classes/${item.fileName}`);
      continue;
    }
    jsonClassCodes.add(item.classCode);
    const config = readJson(item.filePath);
    if (!config) continue;
    classConfigs.push(config);
    checkClassConfig(item.fileName, config, featureText);
  }

  for (const classCode of Object.keys(EXPECTED_CLASSES)) {
    if (!jsonClassCodes.has(classCode)) add('ERROR', `Missing class config: ${classCode}.json`);
  }

  add('OK', 'preset class directories are used as the class config source');

  for (const [classCode, a, b] of findDuplicateKeys(classConfigs, (item) => item.classCode)) {
    add('ERROR', `Duplicate classCode: ${classCode} in ${a.classCode}.json and ${b.classCode}.json`);
  }
  for (const [classKey] of findDuplicateKeys(classConfigs, (item) => item.classKey)) {
    add('ERROR', `Duplicate classKey: ${classKey}`);
  }
  for (const [sourceFeatureKey] of findDuplicateKeys(classConfigs, (item) => item.sourceFeatureKey)) {
    add('WARN', `Duplicate sourceFeatureKey: ${sourceFeatureKey}`);
  }


  for (const config of classConfigs) {
    const code = String(config.classCode || '').trim() || 'UNKNOWN';
    const seenClassificationOptions = new Map();
    const options = Array.isArray(config.classification?.options) ? config.classification.options : [];
    for (const option of options) {
      const key = [String(option?.kind ?? '').trim(), String(option?.skind ?? '').trim(), String(option?.skind2 ?? '').trim()].join('::');
      const label = labelToString(option?.label) || String(option?.name ?? '').trim();
      if (!key || key === '::') continue;
      if (seenClassificationOptions.has(key)) {
        add('ERROR', `${code}.json classification option duplicate ${key} (${seenClassificationOptions.get(key)} / ${label})`);
      } else {
        seenClassificationOptions.set(key, label);
      }
    }
  }

  add('OK', `Loaded ${classConfigs.length} class config file(s)`);
  printReport(classConfigs);

  const hasErrors = messages.some((message) => message.level === 'ERROR');
  process.exit(hasErrors ? 1 : 0);
}

main();
