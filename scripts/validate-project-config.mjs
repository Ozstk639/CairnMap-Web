#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const configRoot = path.join(root, 'project-config');
const errors = [];
const warnings = [];

const rel = (p) => path.relative(root, p).replaceAll(path.sep, '/');
const exists = (p) => fs.existsSync(p);

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function readJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    addError(`[parse-json] ${rel(filePath)}: ${error.message}`);
    return null;
  }
}

function walkJsonFiles(dir, predicate = () => true) {
  const result = [];
  if (!exists(dir)) return result;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (full.includes(`${path.sep}schemas${path.sep}`)) continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.json') && predicate(full)) {
        result.push(full);
      }
    }
  }
  return result.sort();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function labelOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value['zh-CN'] || value.en || value.label || '';
  return '';
}

function getItems(filePath, expectedVersion, idField = 'id') {
  const json = readJson(filePath);
  if (!json) return { json: null, items: [] };
  if (expectedVersion && json.schemaVersion !== expectedVersion) {
    addError(`[schema-version] ${rel(filePath)} expected ${expectedVersion}, got ${json.schemaVersion || '(missing)'}`);
  }
  if (!Array.isArray(json.items)) {
    addError(`[items] ${rel(filePath)} must contain an items array`);
    return { json, items: [] };
  }
  const seen = new Map();
  for (const item of json.items) {
    const id = item?.[idField];
    if (!id) continue;
    if (seen.has(id)) addError(`[duplicate-id] ${rel(filePath)} duplicate ${idField} "${id}"`);
    seen.set(id, item);
  }
  return { json, items: json.items };
}

function indexBy(items, fields) {
  const set = new Set();
  for (const item of items) {
    for (const field of fields) {
      const value = item?.[field];
      if (typeof value === 'string' && value) set.add(value);
    }
  }
  return set;
}

function readMaybeItems(filePath, expectedVersion) {
  if (!exists(filePath)) return [];
  return getItems(filePath, expectedVersion).items;
}

function requireValue(condition, message) {
  if (!condition) addError(message);
}

const jsonFiles = walkJsonFiles(configRoot);
const parsed = new Map();
for (const file of jsonFiles) parsed.set(file, readJson(file));

const schemaVersionByBasename = new Map([
  ['openriamap-ria.json', 'cairnmap.assembly.v1'],
  ['dataSources.json', 'cairnmap.data-sources.v1'],
  ['ruleButtons.json', 'cairnmap.rule-buttons.v1'],
  ['searchProfiles.json', 'cairnmap.search-profiles.v1'],
  ['sourceLinkModes.json', 'cairnmap.source-link-modes.v1'],
  ['worlds.json', 'cairnmap.worlds.v1'],
  ['package.json', 'cairnmap.config-package.v1'],
  ['project.json', 'cairnmap.project-package.v1'],
  ['preset.json', 'cairnmap.preset.v1'],
  ['cardEnhancements.json', 'cairnmap.card-enhancements.v1'],
  ['cardLayouts.json', 'cairnmap.card-layouts.v1'],
  ['cardRuntimeContracts.json', 'cairnmap.card-runtime-contracts.v1'],
  ['iconRegistry.json', 'cairnmap.icon-registry.v1'],
  ['renderFormatFinalContracts.json', 'cairnmap.render-format-final-contracts.v1'],
  ['displayAlgorithms.json', 'cairnmap.display-algorithms.v1'],
  ['displayProfiles.json', 'cairnmap.display-profiles.v1'],
  ['displayRuntimeContracts.json', 'cairnmap.display-runtime-contracts.v1'],
  ['labelStyles.json', 'cairnmap.label-styles.v1'],
  ['specialDisplayLogic.json', 'cairnmap.special-display-logic.v1'],
  ['formatRuntimeContracts.json', 'cairnmap.format-runtime-contracts.v1'],
  ['formatSpecialFormatters.json', 'cairnmap.format-special-formatters.v1'],
  ['schemaRuntimeContracts.json', 'cairnmap.schema-runtime-contracts.v1'],
  ['relationActions.json', 'cairnmap.relation-actions.v1'],
  ['relationBindings.json', 'cairnmap.relation-bindings.v1'],
  ['relationViewProfiles.json', 'cairnmap.relation-view-profiles.v1'],
  ['fieldControls.json', 'cairnmap.field-controls.v1'],
  ['workflowBlocks.json', 'cairnmap.workflow-blocks.v1'],
  ['workflowComponents.json', 'cairnmap.workflow-components.v1'],
  ['workflowFinalContracts.json', 'cairnmap.workflow-final-contracts.v1'],
  ['workflowLegacyExecutors.json', 'cairnmap.workflow-legacy-executors.v1'],
  ['workflowParityProfiles.json', 'cairnmap.workflow-parity-profiles.v1'],
  ['workflowRuntimeContracts.json', 'cairnmap.workflow-runtime-contracts.v1'],
  ['workflowTemplates.json', 'cairnmap.workflow-templates.v1'],
]);

function auditSchemaVersions() {
  for (const [file, json] of parsed) {
    if (!json) continue;
    const base = path.basename(file);
    const inClasses = rel(file).includes('/classes/');
    const inWorkflows = rel(file).includes('/workflows/');
    const expected = inClasses
      ? 'cairnmap.class.v1'
      : inWorkflows
        ? 'cairnmap.workflow.v1'
        : schemaVersionByBasename.get(base);
    if (expected && json.schemaVersion !== expected) {
      addError(`[schema-version] ${rel(file)} expected ${expected}, got ${json.schemaVersion || '(missing)'}`);
    }
  }
}

const assembliesDir = path.join(configRoot, 'assemblies');
const presetsDir = path.join(configRoot, 'presets');
const projectPackageDir = path.join(configRoot, 'packages', 'openriamap-ria');
const environmentDir = path.join(projectPackageDir, 'environment');
const sharedDir = path.join(presetsDir, 'core-structures', 'shared');

const worldsFile = path.join(environmentDir, 'worlds.json');
const dataSourcesFile = path.join(environmentDir, 'dataSources.json');
const ruleButtonsFile = path.join(environmentDir, 'ruleButtons.json');
const searchProfilesFile = path.join(environmentDir, 'searchProfiles.json');
const sourceLinkModesFile = path.join(environmentDir, 'sourceLinkModes.json');

const displayProfilesFile = path.join(sharedDir, 'display', 'displayProfiles.json');
const labelStylesFile = path.join(sharedDir, 'display', 'labelStyles.json');
const displayAlgorithmsFile = path.join(sharedDir, 'display', 'displayAlgorithms.json');
const specialDisplayLogicFile = path.join(sharedDir, 'display', 'specialDisplayLogic.json');
const cardLayoutsFile = path.join(sharedDir, 'card', 'cardLayouts.json');
const cardEnhancementsFile = path.join(sharedDir, 'card', 'cardEnhancements.json');
const workflowComponentsFile = path.join(sharedDir, 'workflow', 'workflowComponents.json');
const workflowLegacyExecutorsFile = path.join(sharedDir, 'workflow', 'workflowLegacyExecutors.json');
const workflowTemplatesFile = path.join(sharedDir, 'workflow', 'workflowTemplates.json');
const iconRegistryFile = path.join(sharedDir, 'common', 'iconRegistry.json');

const classFiles = walkJsonFiles(presetsDir, (p) => rel(p).includes('/classes/'));
const workflowFiles = walkJsonFiles(presetsDir, (p) => rel(p).includes('/workflows/'));
const presetFiles = walkJsonFiles(presetsDir, (p) => path.basename(p) === 'preset.json');
const assemblyFiles = walkJsonFiles(assembliesDir);

const classByCode = new Map();
const classFields = new Map();
const workflowById = new Map();

const worlds = readMaybeItems(worldsFile, 'cairnmap.worlds.v1');
const worldIds = new Set(worlds.map((item) => item.id).filter(Boolean));
const dataSources = readMaybeItems(dataSourcesFile, 'cairnmap.data-sources.v1');
const ruleButtons = readMaybeItems(ruleButtonsFile, 'cairnmap.rule-buttons.v1');
const searchProfiles = readMaybeItems(searchProfilesFile, 'cairnmap.search-profiles.v1');
const sourceLinkModes = readMaybeItems(sourceLinkModesFile, 'cairnmap.source-link-modes.v1');

const displayProfileIds = indexBy(readMaybeItems(displayProfilesFile, 'cairnmap.display-profiles.v1'), ['id']);
const labelStyleIds = indexBy(readMaybeItems(labelStylesFile, 'cairnmap.label-styles.v1'), ['id']);
const displayLogicIds = new Set([
  ...indexBy(readMaybeItems(displayAlgorithmsFile, 'cairnmap.display-algorithms.v1'), ['id']),
  ...indexBy(readMaybeItems(specialDisplayLogicFile, 'cairnmap.special-display-logic.v1'), ['id']),
]);
const cardLayoutIds = indexBy(readMaybeItems(cardLayoutsFile, 'cairnmap.card-layouts.v1'), ['id']);
const cardEnhancementIds = indexBy(readMaybeItems(cardEnhancementsFile, 'cairnmap.card-enhancements.v1'), ['id', 'componentKey']);
const workflowComponentIds = indexBy(readMaybeItems(workflowComponentsFile, 'cairnmap.workflow-components.v1'), ['id', 'componentKey']);
const workflowLegacyIds = indexBy(readMaybeItems(workflowLegacyExecutorsFile, 'cairnmap.workflow-legacy-executors.v1'), ['workflowKey', 'componentKey', 'label']);
const workflowTemplateIds = indexBy(readMaybeItems(workflowTemplatesFile, 'cairnmap.workflow-templates.v1'), ['id']);
const iconIds = indexBy(readMaybeItems(iconRegistryFile, 'cairnmap.icon-registry.v1'), ['id']);

function validateAssemblies() {
  for (const file of assemblyFiles) {
    const assembly = parsed.get(file);
    if (!assembly) continue;
    requireValue(Array.isArray(assembly.loadOrder), `[assembly] ${rel(file)} loadOrder must be an array`);
    for (const [index, entry] of toArray(assembly.loadOrder).entries()) {
      requireValue(typeof entry.path === 'string' && entry.path.length > 0, `[assembly] ${rel(file)} loadOrder[${index}].path is required`);
      requireValue(typeof entry.enabled === 'boolean', `[assembly] ${rel(file)} loadOrder[${index}].enabled must be boolean`);
      if (entry.path) {
        const resolved = path.resolve(path.dirname(file), entry.path);
        if (!exists(resolved)) addError(`[assembly] ${rel(file)} loadOrder[${index}] path does not exist: ${entry.path}`);
        const hasPackage = exists(path.join(resolved, 'package.json')) || exists(path.join(resolved, 'preset.json'));
        if (exists(resolved) && !hasPackage) addError(`[assembly] ${rel(file)} loadOrder[${index}] target has no package.json or preset.json: ${entry.path}`);
      }
    }
    const runtime = assembly.runtime || {};
    if (runtime.defaultPackagePath) {
      const resolved = path.resolve(path.dirname(file), runtime.defaultPackagePath);
      if (!exists(resolved)) addError(`[assembly] ${rel(file)} runtime.defaultPackagePath does not exist: ${runtime.defaultPackagePath}`);
    }
    if (runtime.defaultWorldId && !worldIds.has(runtime.defaultWorldId)) {
      addError(`[assembly] ${rel(file)} runtime.defaultWorldId "${runtime.defaultWorldId}" not found in worlds.json`);
    }
    const merge = assembly.mergePolicy || {};
    for (const key of ['presetPriority', 'classConflict', 'sharedConflict', 'workflowConflict', 'environmentConflict']) {
      if (!merge[key]) addError(`[assembly] ${rel(file)} mergePolicy.${key} is required`);
    }
  }
}

function validatePackages() {
  const projectPackage = readJson(path.join(projectPackageDir, 'package.json'));
  if (projectPackage) {
    requireValue(projectPackage.schemaVersion === 'cairnmap.config-package.v1', '[package] project package schemaVersion must be cairnmap.config-package.v1');
    requireValue(projectPackage.packageType === 'project', '[package] openriamap-ria packageType must be project');
    const contains = projectPackage.contains || {};
    requireValue(contains.environment === true, '[package] openriamap-ria contains.environment should be true');
    for (const key of ['shared', 'classes', 'workflows']) {
      if (contains[key] === true && !exists(path.join(projectPackageDir, key))) {
        addError(`[package] openriamap-ria declares contains.${key}=true but ${key}/ is missing`);
      }
    }
  }

  const presetIds = new Set();
  for (const file of presetFiles) {
    const preset = parsed.get(file);
    if (!preset) continue;
    requireValue(preset.schemaVersion === 'cairnmap.preset.v1', `[preset] ${rel(file)} schemaVersion must be cairnmap.preset.v1`);
    requireValue(!!preset.presetId, `[preset] ${rel(file)} presetId is required`);
    if (preset.presetId) {
      if (presetIds.has(preset.presetId)) addError(`[preset] duplicate presetId "${preset.presetId}"`);
      presetIds.add(preset.presetId);
    }
    if (exists(path.join(path.dirname(file), 'environment'))) {
      addError(`[preset] ${rel(file)} preset packages should not contain environment/ by default`);
    }
  }
}

function validateClasses() {
  for (const file of classFiles) {
    const klass = parsed.get(file);
    if (!klass) continue;
    const code = klass.classCode;
    requireValue(klass.schemaVersion === 'cairnmap.class.v1', `[class:${code || rel(file)}] schemaVersion must be cairnmap.class.v1`);
    requireValue(klass.runtimeStatus === 'active', `[class:${code || rel(file)}] runtimeStatus must be active`);
    requireValue(!!code, `[class] ${rel(file)} classCode is required`);
    requireValue(!!klass.classKey, `[class:${code}] classKey is required`);
    requireValue(!!labelOf(klass.label), `[class:${code}] label.zh-CN or label.en is required`);
    if (code) {
      if (classByCode.has(code)) addError(`[class:${code}] duplicate classCode in ${rel(file)} and ${rel(classByCode.get(code).__file)}`);
      klass.__file = file;
      classByCode.set(code, klass);
    }
    if (klass.data?.defaultClass && code && klass.data.defaultClass !== code) {
      addError(`[class:${code}] data.defaultClass must match classCode`);
    }
    const allowedGeometry = new Set(['Point', 'LineString', 'Polygon', 'MultiPolygon', 'MultiLineString']);
    requireValue(allowedGeometry.has(klass.geometry?.type), `[class:${code}] geometry.type must be one of ${Array.from(allowedGeometry).join(', ')}`);
    requireValue(!!klass.identity?.idField, `[class:${code}] identity.idField is required`);
    requireValue(Array.isArray(klass.fields), `[class:${code}] fields must be an array`);
    const fieldKeys = new Set();
    for (const [index, field] of toArray(klass.fields).entries()) {
      if (!field.key) addError(`[class:${code}] fields[${index}].key is required`);
      if (field.key && fieldKeys.has(field.key)) addError(`[class:${code}] duplicate field key "${field.key}"`);
      if (field.key) fieldKeys.add(field.key);
      if (!field.label) addError(`[class:${code}] field "${field.key || index}" label is required`);
      if (!field.type) addError(`[class:${code}] field "${field.key || index}" type is required`);
      if (field.scenes && typeof field.scenes !== 'object') addError(`[class:${code}] field "${field.key || index}" scenes must be an object`);
    }
    classFields.set(code, fieldKeys);
    if (klass.classification && !Array.isArray(klass.classification.options)) {
      addError(`[class:${code}] classification.options must be an array when classification is present`);
    }
    const ruleIds = new Set();
    for (const [index, rule] of toArray(klass.display?.rules).entries()) {
      if (!rule.id) addError(`[class:${code}] display.rules[${index}].id is required`);
      if (rule.id && ruleIds.has(rule.id)) addError(`[class:${code}] duplicate display rule id "${rule.id}"`);
      if (rule.id) ruleIds.add(rule.id);
      if (rule.runtimeStatus && rule.runtimeStatus !== 'active') addError(`[class:${code}] display rule "${rule.id}" runtimeStatus must be active`);
      if (rule.profile && !displayProfileIds.has(rule.profile)) addError(`[class:${code}] display rule "${rule.id}" profile "${rule.profile}" not found in displayProfiles.json`);
      const styleKey = rule.label?.styleKey;
      if (styleKey && !labelStyleIds.has(styleKey)) addError(`[class:${code}] display rule "${rule.id}" label.styleKey "${styleKey}" not found in labelStyles.json`);
      for (const item of [...toArray(rule.specialLogic), ...toArray(rule.algorithms)]) {
        if (item.key && !displayLogicIds.has(item.key)) addError(`[class:${code}] display rule "${rule.id}" display logic key "${item.key}" not declared in shared/display`);
      }
    }
    if (klass.card?.layoutId && !cardLayoutIds.has(klass.card.layoutId)) {
      addError(`[class:${code}] card.layoutId "${klass.card.layoutId}" not found in cardLayouts.json`);
    }
  }
}

function validateWorkflows() {
  for (const file of workflowFiles) {
    const workflow = parsed.get(file);
    if (!workflow) continue;
    const id = workflow.id || workflow.workflowId;
    requireValue(workflow.schemaVersion === 'cairnmap.workflow.v1', `[workflow:${id || rel(file)}] schemaVersion must be cairnmap.workflow.v1`);
    requireValue(!!id, `[workflow] ${rel(file)} id is required`);
    if (id) {
      if (workflowById.has(id)) addError(`[workflow:${id}] duplicate workflow id in ${rel(file)} and ${rel(workflowById.get(id).__file)}`);
      workflow.__file = file;
      workflowById.set(id, workflow);
    }
    requireValue(workflow.runtimeStatus === 'active', `[workflow:${id}] runtimeStatus must be active`);
    requireValue(!!workflow.targetClass, `[workflow:${id}] targetClass is required`);
    if (workflow.targetClass && !classByCode.has(workflow.targetClass)) {
      addError(`[workflow:${id}] targetClass "${workflow.targetClass}" not found in Class config`);
    }
    const targetClass = classByCode.get(workflow.targetClass);
    if (targetClass?.geometry?.type && workflow.targetGeometry && workflow.targetGeometry !== targetClass.geometry.type) {
      addError(`[workflow:${id}] targetGeometry "${workflow.targetGeometry}" does not match class ${workflow.targetClass} geometry "${targetClass.geometry.type}"`);
    }
    requireValue(workflow.runtimeMode === 'componentExecutor', `[workflow:${id}] runtimeMode must be componentExecutor`);
    if (workflow.componentKey && !workflowComponentIds.has(workflow.componentKey)) {
      addError(`[workflow:${id}] componentKey "${workflow.componentKey}" not declared in workflowComponents.json`);
    }
    // legacyWorkflowKey may be a human-facing legacy label; componentKey is the executable dispatch key.
    if (workflow.futureBlockTemplateRef && !workflowTemplateIds.has(workflow.futureBlockTemplateRef)) {
      addError(`[workflow:${id}] futureBlockTemplateRef "${workflow.futureBlockTemplateRef}" not found in workflowTemplates.json`);
    }
    if (workflow.blockRunnerReady !== false) {
      addError(`[workflow:${id}] blockRunnerReady should remain false for current componentExecutor workflows`);
    }
    for (const forbidden of ['pages', 'blocks', 'output']) {
      if (Object.prototype.hasOwnProperty.call(workflow, forbidden)) {
        addError(`[workflow:${id}] must not contain ${forbidden} in current componentExecutor workflow JSON`);
      }
    }
  }

  for (const [code, klass] of classByCode) {
    for (const binding of toArray(klass.workflowBindings)) {
      const workflowId = binding.workflowId || binding.id;
      if (workflowId && !workflowById.has(workflowId)) {
        addError(`[class:${code}] workflowBindings references missing workflowId "${workflowId}"`);
      }
    }
  }
}

function validateCardReferences() {
  const { items: layouts } = getItems(cardLayoutsFile, 'cairnmap.card-layouts.v1');
  for (const layout of layouts) {
    for (const [index, item] of toArray(layout.items).entries()) {
      if (item.kind === 'enhancement' && item.key && !cardEnhancementIds.has(item.key)) {
        addError(`[card:${layout.id}] items[${index}] enhancement key "${item.key}" not found in cardEnhancements.json`);
      }
      if (item.linkTarget?.classCode && !classByCode.has(item.linkTarget.classCode)) {
        addError(`[card:${layout.id}] items[${index}] linkTarget.classCode "${item.linkTarget.classCode}" not found in Class config`);
      }
    }
  }
}

function validateEnvironment() {
  const defaultWorlds = worlds.filter((world) => world.default === true);
  if (defaultWorlds.length > 1) addError(`[environment] worlds.json has multiple default worlds: ${defaultWorlds.map((w) => w.id).join(', ')}`);
  for (const source of dataSources) {
    if (!source.worldId) addError('[environment] dataSources item missing worldId');
    if (source.worldId && !worldIds.has(source.worldId)) addError(`[environment] dataSources worldId "${source.worldId}" not found in worlds.json`);
    if (source.files && !Array.isArray(source.files)) addError(`[environment] dataSources for world "${source.worldId}" files must be an array`);
  }
  const defaultSourceLinks = sourceLinkModes.filter((mode) => mode.default === true);
  if (defaultSourceLinks.length > 1) addError(`[environment] sourceLinkModes has multiple default modes: ${defaultSourceLinks.map((m) => m.id).join(', ')}`);

  for (const button of ruleButtons) {
    if (!button.id) addError('[environment] ruleButtons item missing id');
    if (button.iconKey && !iconIds.has(button.iconKey)) addError(`[environment] ruleButton "${button.id}" iconKey "${button.iconKey}" not found in iconRegistry.json`);
    for (const code of toArray(button.criteria?.classCode)) {
      if (!classByCode.has(code)) addError(`[environment] ruleButton "${button.id}" criteria.classCode "${code}" not found in Class config`);
    }
  }

  for (const profile of searchProfiles) {
    for (const section of ['blacklist', 'priority', 'categoryOverrides']) {
      for (const item of toArray(profile[section])) {
        if (item.classCode && !classByCode.has(item.classCode)) {
          addError(`[environment] searchProfile "${profile.id}" ${section} classCode "${item.classCode}" not found in Class config`);
        }
      }
    }
    if (profile.searchFields && !Array.isArray(profile.searchFields)) {
      addError(`[environment] searchProfile "${profile.id}" searchFields must be an array`);
    }
  }
}

function validateLegacyGuards() {
  const forbiddenRootSharedFiles = walkJsonFiles(sharedDir, (p) => path.dirname(p) === sharedDir);
  for (const file of forbiddenRootSharedFiles) {
    addError(`[legacy-guard] root-level shared JSON is not allowed: ${rel(file)}`);
  }
  for (const [file, json] of parsed) {
    if (!json) continue;
    const text = JSON.stringify(json);
    if (text.includes('"runtimeStatus":"shadow"') || text.includes('"runtimeStatus": "shadow"')) {
      addError(`[legacy-guard] shadow runtimeStatus is not allowed: ${rel(file)}`);
    }
  }
}

function printSection(name, pass) {
  console.log(`--- ${name} ---`);
  console.log(pass ? 'PASS' : 'FAIL');
  console.log('');
}

const before = () => errors.length;
const sections = [];
function runSection(name, fn) {
  const countBefore = before();
  fn();
  sections.push([name, errors.length === countBefore]);
}

console.log('CairnMap Project Config Validation');
console.log('');

runSection('parse-json', () => {});
runSection('schema-version', auditSchemaVersions);
runSection('assembly', validateAssemblies);
runSection('packages', validatePackages);
runSection('class-config', validateClasses);
runSection('workflow-config', validateWorkflows);
runSection('card-references', validateCardReferences);
runSection('environment', validateEnvironment);
runSection('legacy-guards', validateLegacyGuards);

for (const [name, pass] of sections) printSection(name, pass);

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const warning of warnings) console.log(`  ${warning}`);
  console.log('');
}

if (errors.length > 0) {
  console.log('Errors:');
  for (const error of errors) console.log(`  ${error}`);
  console.log('');
  console.log('Final result: FAIL');
  process.exitCode = 1;
} else {
  console.log('Final result: PASS');
}
