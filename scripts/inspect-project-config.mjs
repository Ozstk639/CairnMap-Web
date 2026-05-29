#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { buildConfigIndex } from './config-tools/config-index.mjs';
import { readItems, resolveProjectRoot } from './config-tools/config-loader.mjs';

function parseArgs(argv) {
  const args = { details: false };
  for (const token of argv) {
    if (token === '--details') args.details = true;
    if (token === '--json') args.json = true;
    if (token === '--help') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`CairnMap Project Config Inspector\n\nUsage:\n  npm run inspect:project-config\n  npm run inspect:project-config -- --details\n  npm run inspect:project-config -- --json\n\nOptions:\n  --details  Print fields, display, card and workflow bindings per Class\n  --json     Print machine-readable summary JSON\n`);
}

function labelOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value['zh-CN'] || value.en || value.label || '';
  return '';
}

function rel(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function groupClassesByPreset(index) {
  const groups = new Map();
  for (const [code, file] of index.classFiles) {
    const parts = rel(index.root, file).split('/');
    const preset = parts[2] || '(unknown)';
    if (!groups.has(preset)) groups.set(preset, []);
    groups.get(preset).push(code);
  }
  for (const list of groups.values()) list.sort();
  return groups;
}

function groupWorkflowsByPreset(index) {
  const groups = new Map();
  for (const [id, file] of index.workflowFiles) {
    const parts = rel(index.root, file).split('/');
    const preset = parts[2] || '(unknown)';
    if (!groups.has(preset)) groups.set(preset, []);
    groups.get(preset).push(id);
  }
  for (const list of groups.values()) list.sort();
  return groups;
}

function buildSummary(index) {
  const environmentRoot = path.join(index.projectConfigRoot, 'packages', 'openriamap-ria', 'environment');
  const worlds = readItems(path.join(environmentRoot, 'worlds.json'));
  const dataSources = readItems(path.join(environmentRoot, 'dataSources.json'));
  const ruleButtons = readItems(path.join(environmentRoot, 'ruleButtons.json'));
  return {
    presets: [...index.presets.keys()].sort(),
    classCount: index.classes.size,
    workflowCount: index.workflows.size,
    classesByPreset: Object.fromEntries([...groupClassesByPreset(index).entries()].sort()),
    workflowsByPreset: Object.fromEntries([...groupWorkflowsByPreset(index).entries()].sort()),
    shared: {
      displayProfiles: index.shared.displayProfiles.size,
      labelStyles: index.shared.labelStyles.size,
      cardLayouts: index.shared.cardLayouts.size,
      workflowComponents: index.shared.workflowComponents.size,
      workflowTemplates: index.shared.workflowTemplates.size,
      iconKeys: index.shared.iconKeys.size,
    },
    environment: {
      worlds: worlds.map((item) => item.id).filter(Boolean),
      dataSources: dataSources.map((item) => item.id).filter(Boolean),
      ruleButtons: ruleButtons.map((item) => item.id).filter(Boolean),
    },
  };
}

function printClassDetails(index) {
  const entries = [...index.classes.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [code, classConfig] of entries) {
    const file = index.classFiles.get(code);
    console.log(`\n  ${code} — ${labelOf(classConfig.label) || classConfig.classKey}`);
    console.log(`    file: ${rel(index.root, file)}`);
    console.log(`    classKey: ${classConfig.classKey || '(missing)'}`);
    console.log(`    geometry: ${classConfig.geometry?.type || '(missing)'}`);
    console.log(`    fields: ${Array.isArray(classConfig.fields) ? classConfig.fields.length : 0}`);
    const displayRules = classConfig.display?.rules || [];
    console.log(`    displayRules: ${displayRules.map((rule) => rule.id).filter(Boolean).join(', ') || '(none)'}`);
    console.log(`    cardLayout: ${classConfig.card?.layoutId || '(none)'}`);
    const bindings = classConfig.workflowBindings || [];
    console.log(`    workflows: ${bindings.map((binding) => binding.workflowId).filter(Boolean).join(', ') || '(none)'}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const root = resolveProjectRoot();
  const index = buildConfigIndex(root);
  const summary = buildSummary(index);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  console.log('CairnMap Project Config Inspector');
  console.log('Sources');
  console.log('  Class source: presets/classes');
  console.log('  Display source: presets/shared/display + classes/*.json');
  console.log('  Workflow source: config -> component executor');
  console.log('');
  console.log('Summary');
  console.log(`  Presets: ${summary.presets.length} (${summary.presets.join(', ')})`);
  console.log(`  Classes: ${summary.classCount}`);
  console.log(`  Workflows: ${summary.workflowCount}`);
  console.log(`  Worlds: ${summary.environment.worlds.join(', ') || '(none)'}`);
  console.log('');
  console.log('Classes by preset');
  for (const [preset, classes] of Object.entries(summary.classesByPreset)) {
    console.log(`  ${preset}: ${classes.join(', ')}`);
  }
  console.log('');
  console.log('Workflows by preset');
  for (const [preset, workflows] of Object.entries(summary.workflowsByPreset)) {
    console.log(`  ${preset}: ${workflows.join(', ')}`);
  }
  console.log('');
  console.log('Shared indexes');
  for (const [key, value] of Object.entries(summary.shared)) {
    console.log(`  ${key}: ${value}`);
  }
  if (args.details) printClassDetails(index);
} catch (error) {
  console.error(`[inspect:project-config] ERROR: ${error.message}`);
  process.exitCode = 1;
}
