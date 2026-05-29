#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
import { listClassConfigFiles, coreSharedDir } from './lib/audit-config-paths.mjs';
const sharedDir = coreSharedDir(root);
const classesLabel = 'project-config/presets/*/classes';
const featureRenderRulesPath = path.join(root, 'src', 'components', 'Rules', 'rendering', 'featureRenderRules.ts');
const displayProfilesPath = path.join(sharedDir, 'display', 'displayProfiles.json');
const labelStylesPath = path.join(sharedDir, 'display', 'labelStyles.json');
const specialDisplayLogicPath = path.join(sharedDir, 'display', 'specialDisplayLogic.json');
const relationBindingsPath = path.join(sharedDir, 'relation', 'relationBindings.json');
const displayRuntimeContractsPath = path.join(sharedDir, 'display', 'displayRuntimeContracts.json');

const overlayGroups = {
  point: new Set(['TPP', 'WRP', 'TRP', 'ISP', 'SBP', 'PLF', 'STA']),
  line: new Set(['RLE', 'ROD', 'ISL']),
  surface: new Set(['ISG', 'BUD', 'FLR', 'STB', 'STF', 'PFB']),
};


let runtimeContractModeByClass = new Map();

function getRuntimeMode(classCode) {
  const normalized = normalizeClassCode(classCode);
  const contractMode = runtimeContractModeByClass.get(normalized);
  if (contractMode) return contractMode;
  if (overlayWhitelist.has(normalized)) return 'configOverlay';
  return 'legacyPrimary';
}

const overlayWhitelist = new Set([
  ...overlayGroups.point,
  ...overlayGroups.line,
  ...overlayGroups.surface,
]);


const runtimeProfileIds = new Set([
  'largeGeoSurface',
  'networkLine',
  'buildingStructure',
  'stationStructure',
  'transportNode',
  'poiPoint',
  'indoorUnit',
  'geometryOnlyFallback',
]);

function getOverlayGroup(classCode) {
  const normalized = String(classCode ?? '').trim().toUpperCase();
  if (overlayGroups.point.has(normalized)) return 'point';
  if (overlayGroups.line.has(normalized)) return 'line';
  if (overlayGroups.surface.has(normalized)) return 'surface';
  return 'none';
}

const messages = [];
let errors = 0;
let warnings = 0;
let infos = 0;

function log(level, message) {
  messages.push({ level, message });
  if (level === 'ERROR') errors += 1;
  else if (level === 'WARN') warnings += 1;
  else if (level === 'INFO') infos += 1;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    log('ERROR', `Unable to read JSON ${path.relative(root, filePath)}: ${error.message}`);
    return fallback;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    log('ERROR', `Unable to read text ${path.relative(root, filePath)}: ${error.message}`);
    return '';
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value ?? '').trim();
}

function normalizeClassCode(value) {
  return normalize(value).toUpperCase();
}

function stylePatternToRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\\{size\\}', '\\d+');
  return new RegExp(`^${escaped}$`);
}

function buildLabelStyleResolver(labelStylesConfig) {
  const items = asArray(labelStylesConfig?.items);
  const byId = new Map();
  const byRuntimeKey = new Map();
  const patterns = [];

  for (const item of items) {
    if (item?.id) byId.set(String(item.id), item);
    if (item?.sourceRuntimeKey) byRuntimeKey.set(String(item.sourceRuntimeKey), item);
    if (item?.sourceRuntimePattern) patterns.push({ item, pattern: stylePatternToRegExp(item.sourceRuntimePattern) });
  }

  return (styleKey) => {
    const key = normalize(styleKey);
    if (!key) return { item: null, resolvedBy: 'none' };
    if (byId.has(key)) return { item: byId.get(key), resolvedBy: 'id' };
    if (byRuntimeKey.has(key)) return { item: byRuntimeKey.get(key), resolvedBy: 'sourceRuntimeKey' };
    const patternMatch = patterns.find(({ pattern }) => pattern.test(key));
    if (patternMatch) return { item: patternMatch.item, resolvedBy: 'sourceRuntimePattern' };
    return { item: null, resolvedBy: 'missing' };
  };
}

function hasClassRuntimeReference(classCode, rule, featureRenderRulesText) {
  const code = normalize(classCode);
  if (!code) return false;
  if (featureRenderRulesText.includes(`"${code}"`) || featureRenderRulesText.includes(`'${code}'`)) return true;
  const alias = normalize(rule?.sourceRuntimeMatchText);
  if (alias && featureRenderRulesText.includes(alias)) return true;
  return false;
}

function buildClassFieldIndex(loadedClasses) {
  const index = new Map();


  // CM_LABEL_STYLE_PARITY_FIX_1: prevent ambiguous bare bubble-dark in Class display rules.
  for (const { config } of loadedClasses) {
    const code = normalizeClassCode(config?.classCode);
    for (const rule of asArray(config?.display?.rules)) {
      const styleKey = normalize(rule?.label?.styleKey);
      if (styleKey === 'bubble-dark') log('ERROR', `${code}: bare bubble-dark styleKey must use bubble-dark-label-13 or bubble-dark-label-14`);
    }
  }

  for (const { fileName, config } of loadedClasses) {
    const classCode = normalizeClassCode(config?.classCode ?? path.basename(fileName, '.json'));
    if (!classCode) continue;

    const fields = new Set();
    const groups = new Map();

    const identity = config?.identity && typeof config.identity === 'object' ? config.identity : {};
    for (const key of ['idField', 'nameField', 'displayNameField']) {
      const value = normalize(identity[key]);
      if (value) fields.add(value);
    }

    for (const field of asArray(config?.fields)) {
      const key = normalize(field?.key);
      if (key) fields.add(key);
      const runtimeKey = normalize(field?.sourceRuntimeField);
      if (runtimeKey) fields.add(runtimeKey);
    }

    for (const group of asArray(config?.groups)) {
      const groupKey = normalize(group?.key);
      if (!groupKey) continue;
      const groupFields = new Set();
      for (const field of asArray(group?.fields)) {
        const key = normalize(field?.key);
        if (key) groupFields.add(key);
        const runtimeKey = normalize(field?.sourceRuntimeField);
        if (runtimeKey) groupFields.add(runtimeKey);
      }
      groups.set(groupKey, groupFields);
    }

    index.set(classCode, { fields, groups });
  }

  return index;
}

function hasFieldPath(classFieldIndex, classCode, fieldPath) {
  const code = normalizeClassCode(classCode);
  const field = normalize(fieldPath);
  if (!code || !field) return false;
  const classFields = classFieldIndex.get(code);
  if (!classFields) return false;

  if (classFields.fields.has(field)) return true;

  const parts = field.split('.').map((item) => item.trim()).filter(Boolean);
  if (parts.length === 2) {
    const [groupKey, groupField] = parts;
    return classFields.groups.get(groupKey)?.has(groupField) ?? false;
  }

  return false;
}

function validateSpecialLogic(rule, classCode, specialLogicMap) {
  const items = asArray(rule?.specialLogic);
  const keys = new Set();
  for (const item of items) {
    const key = normalize(item?.key);
    if (!key) {
      log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} has a specialLogic item without key.`);
      continue;
    }
    if (keys.has(key)) {
      log('WARN', `${classCode} rule ${rule?.id ?? '<unknown>'} repeats specialLogic key: ${key}`);
    }
    keys.add(key);
    if (key.includes('=>') || key.includes('function') || key.includes('(') || key.includes(')')) {
      log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} specialLogic key appears to contain executable code: ${key}`);
    }
    const definition = specialLogicMap.get(key);
    if (!definition) {
      log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} references unregistered specialLogic key: ${key}`);
      continue;
    }
    const allowed = new Set(asArray(definition.allowedClasses).map(normalizeClassCode).filter(Boolean));
    if (allowed.size && !allowed.has(normalizeClassCode(classCode))) {
      log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} uses specialLogic key ${key}, but ${classCode} is not listed in allowedClasses.`);
    }
  }
}

function validateBindings(rule, classCode, knownClassCodes) {
  const bindings = asArray(rule?.bindings);
  const keys = new Set();
  for (const binding of bindings) {
    const key = normalize(binding?.key);
    if (!key) {
      log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} has a binding without key.`);
      continue;
    }
    if (keys.has(key)) {
      log('WARN', `${classCode} rule ${rule?.id ?? '<unknown>'} repeats binding key: ${key}`);
    }
    keys.add(key);

    const targetClass = normalizeClassCode(binding?.targetClass);
    if (targetClass && !knownClassCodes.has(targetClass)) {
      log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} binding ${key} references unknown targetClass: ${targetClass}`);
    }
  }
}

function validateRelationBindings(relationBindingsConfig, specialLogicMap, knownClassCodes, classFieldIndex) {
  const seen = new Set();
  for (const binding of asArray(relationBindingsConfig?.items)) {
    const id = normalize(binding?.id);
    if (!id) {
      log('ERROR', `relationBindings contains an item without id.`);
      continue;
    }
    if (seen.has(id)) {
      log('ERROR', `relationBindings contains duplicate id: ${id}`);
    }
    seen.add(id);

    const bindingKey = normalize(binding?.bindingKey);
    const sourceClass = normalizeClassCode(binding?.sourceClass);
    const targetClass = normalizeClassCode(binding?.targetClass);
    const sourceField = normalize(binding?.sourceField);
    const targetField = normalize(binding?.targetField);

    if (!bindingKey) log('ERROR', `relationBinding ${id} is missing bindingKey.`);
    else if (!specialLogicMap.has(bindingKey)) log('ERROR', `relationBinding ${id} references unregistered bindingKey: ${bindingKey}`);

    if (!sourceClass) log('ERROR', `relationBinding ${id} is missing sourceClass.`);
    else if (!knownClassCodes.has(sourceClass)) log('ERROR', `relationBinding ${id} references unknown sourceClass: ${sourceClass}`);

    if (!targetClass) log('ERROR', `relationBinding ${id} is missing targetClass.`);
    else if (!knownClassCodes.has(targetClass)) log('ERROR', `relationBinding ${id} references unknown targetClass: ${targetClass}`);

    if (!sourceField) log('ERROR', `relationBinding ${id} is missing sourceField.`);
    else if (sourceClass && !hasFieldPath(classFieldIndex, sourceClass, sourceField)) {
      log('WARN', `relationBinding ${id} sourceField ${sourceClass}.${sourceField} was not found in Class config fields/groups/identity.`);
    }

    if (!targetField) log('ERROR', `relationBinding ${id} is missing targetField.`);
    else if (targetClass && !hasFieldPath(classFieldIndex, targetClass, targetField)) {
      log('WARN', `relationBinding ${id} targetField ${targetClass}.${targetField} was not found in Class config fields/groups/identity.`);
    }
  }
}


function validateDisplayRuntimeContracts(displayRuntimeContractsConfig, knownClassCodes) {
  const seen = new Set();
  const allowedModes = new Set(['legacyPrimary', 'configOverlay', 'configPrimary', 'legacyAlgorithmFallback']);
  const contractedCoreClasses = new Set();

  for (const item of asArray(displayRuntimeContractsConfig?.items)) {
    const classCode = normalizeClassCode(item?.classCode);
    const mode = normalize(item?.mode);
    if (!classCode) {
      log('ERROR', 'displayRuntimeContracts contains an item without classCode.');
      continue;
    }
    if (seen.has(classCode)) log('ERROR', `displayRuntimeContracts contains duplicate classCode: ${classCode}`);
    seen.add(classCode);

    if (!knownClassCodes.has(classCode)) log('ERROR', `displayRuntimeContracts references unknown classCode: ${classCode}`);
    if (!allowedModes.has(mode)) log('ERROR', `displayRuntimeContracts ${classCode} has invalid mode: ${mode || '<empty>'}`);
    if (overlayWhitelist.has(classCode)) contractedCoreClasses.add(classCode);

    const staticMode = getRuntimeMode(classCode);
    if (mode && staticMode !== mode) {
      log('WARN', `displayRuntimeContracts ${classCode} mode ${mode} differs from audit runtime mode ${staticMode}.`);
    }
    if (mode === 'legacyAlgorithmFallback' && !normalize(item?.fallbackReason)) {
      log('ERROR', `displayRuntimeContracts ${classCode} uses legacyAlgorithmFallback but is missing fallbackReason.`);
    }
  }

  for (const classCode of overlayWhitelist) {
    if (!contractedCoreClasses.has(classCode)) {
      log('ERROR', `displayRuntimeContracts is missing core overlay Class: ${classCode}`);
    }
  }
}

function validateMatchShape(rule, classCode) {
  const match = rule?.match;
  if (!match || typeof match !== 'object') {
    log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} must contain a match object.`);
    return;
  }
  for (const key of ['kind', 'skind', 'skind2']) {
    const value = match[key];
    if (value == null) continue;
    if (typeof value === 'string') continue;
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) continue;
    log('ERROR', `${classCode} rule ${rule?.id ?? '<unknown>'} match.${key} must be a string or string array.`);
  }
}

function resolvePrimaryRule(rules) {
  if (!rules.length) return null;
  return rules.find((rule) => rule?.primary === true) ?? rules[0];
}

function main() {
  console.log('CairnMap Display Config Audit');
  console.log(`Assembly source: presets + openriamap-ria project`);
  console.log(`Classes source: ${classesLabel}`);
  console.log('');


  if (!fs.existsSync(displayProfilesPath)) log('ERROR', `Missing display profiles config: ${path.relative(root, displayProfilesPath)}`);
  if (!fs.existsSync(labelStylesPath)) log('ERROR', `Missing label styles config: ${path.relative(root, labelStylesPath)}`);
  if (!fs.existsSync(specialDisplayLogicPath)) log('ERROR', `Missing special display logic config: ${path.relative(root, specialDisplayLogicPath)}`);
  if (!fs.existsSync(relationBindingsPath)) log('ERROR', `Missing relation bindings config: ${path.relative(root, relationBindingsPath)}`);
  if (!fs.existsSync(displayRuntimeContractsPath)) log('ERROR', `Missing display runtime contracts config: ${path.relative(root, displayRuntimeContractsPath)}`);
  if (!fs.existsSync(featureRenderRulesPath)) log('WARN', `Missing runtime reference file: ${path.relative(root, featureRenderRulesPath)}`);

  const displayProfilesConfig = readJson(displayProfilesPath, { items: [] }) ?? { items: [] };
  const labelStylesConfig = readJson(labelStylesPath, { items: [] }) ?? { items: [] };
  const specialDisplayLogicConfig = readJson(specialDisplayLogicPath, { items: [] }) ?? { items: [] };
  const relationBindingsConfig = readJson(relationBindingsPath, { items: [] }) ?? { items: [] };
  const displayRuntimeContractsConfig = readJson(displayRuntimeContractsPath, { items: [] }) ?? { items: [] };
  runtimeContractModeByClass = new Map(asArray(displayRuntimeContractsConfig.items).map((item) => [normalizeClassCode(item?.classCode), normalize(item?.mode)]));
  const featureRenderRulesText = readText(featureRenderRulesPath);

  const profileIds = new Set(asArray(displayProfilesConfig.items).map((item) => normalize(item?.id)).filter(Boolean));
  const runtimeProfileMappings = [];
  for (const profile of asArray(displayProfilesConfig.items)) {
    const id = normalize(profile?.id);
    if (!id) continue;
    const sourceRuntimeProfile = normalize(profile?.sourceRuntimeProfile) || id;
    runtimeProfileMappings.push(`${id}->${sourceRuntimeProfile}`);
    if (!runtimeProfileIds.has(sourceRuntimeProfile)) {
      log('ERROR', `display profile ${id} maps to unknown runtime profile: ${sourceRuntimeProfile}`);
    }
  }
  const resolveLabelStyle = buildLabelStyleResolver(labelStylesConfig);
  const specialLogicMap = new Map();

  for (const item of asArray(specialDisplayLogicConfig.items)) {
    const logicKey = normalize(item?.logicKey || item?.id);
    if (!logicKey) {
      log('ERROR', 'specialDisplayLogic contains an item without id/logicKey.');
      continue;
    }
    if (specialLogicMap.has(logicKey)) log('ERROR', `specialDisplayLogic contains duplicate logicKey: ${logicKey}`);
    specialLogicMap.set(logicKey, item);
  }

  const loadedClasses = listClassConfigFiles(root)
    .map((item) => ({ fileName: item.fileName, filePath: item.filePath, config: readJson(item.filePath, null) }))
    .filter((item) => Boolean(item.config));
  const knownClassCodes = new Set(
    loadedClasses.map(({ fileName, config }) => normalizeClassCode(config?.classCode ?? path.basename(fileName, '.json')))
  );
  const classFieldIndex = buildClassFieldIndex(loadedClasses);

  let classCount = 0;
  let ruleCount = 0;
  const perClass = [];

  for (const { fileName, config } of loadedClasses) {
    classCount += 1;
    const expectedCode = path.basename(fileName, '.json');
    const classCode = normalize(config.classCode ?? expectedCode);
    const display = config.display;

    if (!display || typeof display !== 'object') {
      log('ERROR', `${fileName} is missing display object.`);
      perClass.push({ classCode, overlayGroup: getOverlayGroup(classCode), rules: 0, profiles: [], styles: [], primaryRule: '-' });
      continue;
    }

    if (!['active', 'configPrimary'].includes(display.runtimeStatus)) {
      log('ERROR', `${fileName} display.runtimeStatus must be active/configPrimary after final cleanup.`);
    }

    const rules = asArray(display.rules);
    const primaryRule = resolvePrimaryRule(rules);
    ruleCount += rules.length;
    if (!Array.isArray(display.rules)) {
      log('ERROR', `${fileName} display.rules must be an array.`);
    }
    if (rules.length === 0) {
      log('WARN', `${fileName} has no display rules and cannot resolve a primary display rule.`);
    }
    if (rules.length > 0 && !primaryRule) {
      log('ERROR', `${fileName} has display rules but no primary display rule could be resolved.`);
    }

    const isOverlayClass = overlayWhitelist.has(normalizeClassCode(classCode));
    if (isOverlayClass && rules.length === 0) {
      log('ERROR', `${fileName} is in the display overlay whitelist but has no display rules.`);
    }
    if (isOverlayClass && !primaryRule) {
      log('ERROR', `${fileName} is in the display overlay whitelist but has no primary display rule.`);
    }

    const seenRuleIds = new Set();
    const profiles = new Set();
    const styles = new Set();

    for (const rule of rules) {
      const ruleId = normalize(rule?.id);
      if (!ruleId) log('ERROR', `${fileName} contains a display rule without id.`);
      else if (seenRuleIds.has(ruleId)) log('ERROR', `${fileName} contains duplicate display rule id: ${ruleId}`);
      seenRuleIds.add(ruleId);

      if (!['active', 'configPrimary'].includes(rule?.runtimeStatus)) log('ERROR', `${classCode} rule ${ruleId || '<unknown>'} runtimeStatus must be active/configPrimary.`);

      validateMatchShape(rule, classCode);
      const matchClass = normalize(rule?.match?.classCode);
      if (!matchClass) log('ERROR', `${classCode} rule ${ruleId || '<unknown>'} is missing match.classCode.`);
      else if (matchClass !== classCode) log('ERROR', `${classCode} rule ${ruleId || '<unknown>'} match.classCode mismatch: ${matchClass}`);

      const profile = normalize(rule?.profile);
      if (!profile) log('ERROR', `${classCode} rule ${ruleId || '<unknown>'} is missing profile.`);
      else if (!profileIds.has(profile)) log('ERROR', `${classCode} rule ${ruleId || '<unknown>'} references unknown display profile: ${profile}`);
      else profiles.add(profile);

      const render = normalize(rule?.geometry?.render);
      if (!render) log('WARN', `${classCode} rule ${ruleId || '<unknown>'} is missing geometry.render.`);

      const label = rule?.label;
      if (label && label.enabled !== false) {
        const styleKey = normalize(label?.styleKey);
        if (!styleKey) {
          log('WARN', `${classCode} rule ${ruleId || '<unknown>'} has label enabled without label.styleKey.`);
        } else {
          const resolvedStyle = resolveLabelStyle(styleKey);
          if (!resolvedStyle.item) log('WARN', `${classCode} rule ${ruleId || '<unknown>'} references label style not indexed by shared/labelStyles.json: ${styleKey}`);
          else styles.add(`${styleKey}(${resolvedStyle.resolvedBy})`);
        }
      } else if (label?.styleKey) {
        const resolvedStyle = resolveLabelStyle(label.styleKey);
        if (resolvedStyle.item) styles.add(`${String(label.styleKey)}(${resolvedStyle.resolvedBy})`);
      }

      if (isOverlayClass && rule === primaryRule) {
        if (!profile || !profileIds.has(profile)) {
          log('ERROR', `${classCode} is in the display overlay whitelist but its primary rule does not resolve a valid profile.`);
        }
        if (getRuntimeMode(classCode) === 'configPrimary') {
          const displayProfile = asArray(displayProfilesConfig.items).find((item) => normalize(item?.id) === profile);
          const sourceRuntimeProfile = normalize(displayProfile?.sourceRuntimeProfile) || profile;
          if (!runtimeProfileIds.has(sourceRuntimeProfile)) {
            log('ERROR', `${classCode} is configPrimary but profile ${profile} does not map to a runtime display profile.`);
          }
        }
        const primaryLabel = rule?.label;
        if (!primaryLabel) {
          log('ERROR', `${classCode} is in the display overlay whitelist but its primary rule is missing label metadata. Set label.enabled=false if this rule intentionally has no label overlay.`);
        } else if (primaryLabel.enabled !== false) {
          const labelSource = normalize(primaryLabel.source);
          const labelStyleKey = normalize(primaryLabel.styleKey);
          if (!labelSource) log('ERROR', `${classCode} is in the display overlay whitelist but its primary rule is missing label.source.`);
          if (!labelStyleKey) log('ERROR', `${classCode} is in the display overlay whitelist but its primary rule is missing label.styleKey.`);
          else if (!resolveLabelStyle(labelStyleKey).item) log('ERROR', `${classCode} is in the display overlay whitelist but label.styleKey cannot be resolved: ${labelStyleKey}`);
        }
      }

      if (!hasClassRuntimeReference(classCode, rule, featureRenderRulesText)) {
        log('WARN', `${classCode} rule ${ruleId || '<unknown>'} has no obvious class reference in featureRenderRules.ts.`);
      }
      if (profile && !featureRenderRulesText.includes(profile)) {
        log('WARN', `${classCode} rule ${ruleId || '<unknown>'} profile ${profile} not found in featureRenderRules.ts text.`);
      }

      validateSpecialLogic(rule, classCode, specialLogicMap);
      validateBindings(rule, classCode, knownClassCodes);
    }

    perClass.push({
      classCode,
      overlayGroup: getOverlayGroup(classCode),
      runtimeMode: getRuntimeMode(classCode),
      rules: rules.length,
      profiles: Array.from(profiles).sort(),
      styles: Array.from(styles).sort(),
      primaryRule: primaryRule?.id ?? '-',
    });
  }

  validateRelationBindings(relationBindingsConfig, specialLogicMap, knownClassCodes, classFieldIndex);

  console.log('Summary');
  console.log(`  Classes checked: ${classCount}`);
  console.log(`  Display rules found: ${ruleCount}`);
  console.log(`  Special logic keys registered: ${specialLogicMap.size}`);
  console.log(`  Relation bindings registered: ${asArray(relationBindingsConfig.items).length}`);
  console.log(`  Display runtime contracts registered: ${asArray(displayRuntimeContractsConfig.items).length}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Warnings: ${warnings}`);
  console.log(`  Info: ${infos}`);
  console.log(`  Overlay whitelist: ${Array.from(overlayWhitelist).sort().join(', ')}`);
  console.log(`  Runtime profile mappings: ${runtimeProfileMappings.sort().join(', ')}`);
  const configPrimaryRuntimeClasses = asArray(displayRuntimeContractsConfig.items).filter((item) => item?.mode === 'configPrimary').map((item) => normalizeClassCode(item?.classCode)).sort();
  const legacyAlgorithmRuntimeClasses = asArray(displayRuntimeContractsConfig.items).filter((item) => item?.mode === 'legacyAlgorithmFallback').map((item) => normalizeClassCode(item?.classCode)).sort();
  console.log(`  Runtime configPrimary classes: ${configPrimaryRuntimeClasses.join(', ') || '-'}`);
  console.log(`  Runtime legacyAlgorithmFallback classes: ${legacyAlgorithmRuntimeClasses.join(', ') || '-'}`);
  console.log('');

  console.log('Overlay Groups');
  console.log(`  point: ${Array.from(overlayGroups.point).sort().join(', ')}`);
  console.log(`  line: ${Array.from(overlayGroups.line).sort().join(', ')}`);
  console.log(`  surface: ${Array.from(overlayGroups.surface).sort().join(', ')}`);
  console.log('');

  console.log('Per-Class Summary');
  for (const item of perClass.sort((a, b) => a.classCode.localeCompare(b.classCode))) {
    const profileText = item.profiles.length ? item.profiles.join(',') : '-';
    const styleText = item.styles.length ? item.styles.join(',') : '-';
    console.log(`  ${item.classCode}: group=${item.overlayGroup} mode=${item.runtimeMode} rules=${item.rules} primary=${item.primaryRule} profiles=${profileText} labelStyles=${styleText}`);
  }
  console.log('');

  if (messages.length) {
    console.log('Checks');
    for (const message of messages) {
      console.log(`  [${message.level}] ${message.message}`);
    }
    console.log('');
  }

  const result = errors > 0 ? 'FAIL' : warnings > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';
  console.log(`Result: ${result}`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
