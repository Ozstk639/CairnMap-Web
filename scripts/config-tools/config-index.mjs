import path from 'node:path';
import { loadProjectConfig, readItems, readJson } from './config-loader.mjs';

function addById(target, items, fields) {
  for (const item of items) {
    for (const field of fields) {
      const value = item?.[field];
      if (typeof value === 'string' && value) target.add(value);
    }
  }
}

export function buildConfigIndex(root) {
  const config = loadProjectConfig(root);
  const presets = new Map();
  const classes = new Map();
  const classFiles = new Map();
  const workflows = new Map();
  const workflowFiles = new Map();

  for (const file of config.presetFiles) {
    const preset = readJson(file);
    if (preset?.presetId) presets.set(preset.presetId, { file, preset, dir: path.dirname(file) });
  }

  for (const file of config.classFiles) {
    const classConfig = readJson(file);
    if (classConfig?.classCode) {
      const code = String(classConfig.classCode).toUpperCase();
      classes.set(code, classConfig);
      classFiles.set(code, file);
    }
  }

  for (const file of config.workflowFiles) {
    const workflow = readJson(file);
    const id = workflow?.id || workflow?.workflowId;
    if (id) {
      workflows.set(id, workflow);
      workflowFiles.set(id, file);
    }
  }

  const shared = {
    displayProfiles: new Set(),
    labelStyles: new Set(),
    cardLayouts: new Set(),
    workflowComponents: new Set(),
    workflowTemplates: new Set(),
    iconKeys: new Set(),
  };

  addById(shared.displayProfiles, readItems(path.join(config.sharedRoot, 'display', 'displayProfiles.json')), ['id']);
  addById(shared.labelStyles, readItems(path.join(config.sharedRoot, 'display', 'labelStyles.json')), ['id']);
  addById(shared.cardLayouts, readItems(path.join(config.sharedRoot, 'card', 'cardLayouts.json')), ['id']);
  addById(shared.workflowComponents, readItems(path.join(config.sharedRoot, 'workflow', 'workflowComponents.json')), ['id', 'componentKey']);
  addById(shared.workflowTemplates, readItems(path.join(config.sharedRoot, 'workflow', 'workflowTemplates.json')), ['id']);
  addById(shared.iconKeys, readItems(path.join(config.sharedRoot, 'common', 'iconRegistry.json')), ['id']);

  return {
    ...config,
    presets,
    classes,
    classFiles,
    workflows,
    workflowFiles,
    shared,
  };
}
