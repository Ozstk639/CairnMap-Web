import fs from 'node:fs';
import path from 'node:path';

export const PRESET_IDS = ['core-structures', 'building', 'rail', 'road', 'teleport', 'warp', 'trade'];
export const EXPECTED_CLASS_CODES = ['STA','PLF','RLE','PFB','STB','SBP','STF','ROD','TPP','WRP','TRP','ISP','ISL','ISG','BUD','FLR'];
export const CLASS_PRESET_BY_CODE = {
  ISP: 'core-structures',
  ISL: 'core-structures',
  ISG: 'core-structures',
  BUD: 'building',
  FLR: 'building',
  STA: 'rail',
  PLF: 'rail',
  RLE: 'rail',
  PFB: 'rail',
  STB: 'rail',
  SBP: 'rail',
  STF: 'rail',
  ROD: 'road',
  TPP: 'teleport',
  WRP: 'warp',
  TRP: 'trade',
};
export const WORKFLOW_PRESET_BY_ID = {
  'generic-point-workflow': 'core-structures',
  'generic-line-workflow': 'core-structures',
  'generic-polygon-workflow': 'core-structures',
  'building-workflow': 'building',
  'floor-workflow': 'building',
  'rail-station-workflow': 'rail',
  'rail-platform-workflow': 'rail',
  'rail-line-workflow': 'rail',
  'rail-platform-boundary-workflow': 'rail',
  'rail-station-building-workflow': 'rail',
  'rail-station-building-point-workflow': 'rail',
  'rail-station-building-floor-workflow': 'rail',
  'road-workflow': 'road',
  'teleport-workflow': 'teleport',
  'warp-workflow': 'warp',
  'trade-point-workflow': 'trade',
};

export function presetsRoot(root) {
  return path.join(root, 'project-config', 'presets');
}
export function coreSharedDir(root) {
  return path.join(presetsRoot(root), 'core-structures', 'shared');
}
export function classConfigPath(root, classCode) {
  const code = String(classCode ?? '').trim().toUpperCase();
  const presetId = CLASS_PRESET_BY_CODE[code];
  if (!presetId) return path.join(presetsRoot(root), '__unknown__', 'classes', `${code}.json`);
  return path.join(presetsRoot(root), presetId, 'classes', `${code}.json`);
}
export function listClassConfigFiles(root) {
  return EXPECTED_CLASS_CODES.map((classCode) => ({
    classCode,
    fileName: `${classCode}.json`,
    filePath: classConfigPath(root, classCode),
    presetId: CLASS_PRESET_BY_CODE[classCode],
  }));
}
export function workflowConfigPath(root, workflowId) {
  const id = String(workflowId ?? '').trim();
  const presetId = WORKFLOW_PRESET_BY_ID[id];
  if (!presetId) return path.join(presetsRoot(root), '__unknown__', 'workflows', `${id}.json`);
  return path.join(presetsRoot(root), presetId, 'workflows', `${id}.json`);
}
export function listWorkflowConfigFiles(root) {
  return Object.keys(WORKFLOW_PRESET_BY_ID).sort().map((workflowId) => ({
    workflowId,
    fileName: `${workflowId}.json`,
    filePath: workflowConfigPath(root, workflowId),
    presetId: WORKFLOW_PRESET_BY_ID[workflowId],
  }));
}
export function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}
export function oldProjectSharedRoot(root) {
  return path.join(root, 'project-config', 'packages', 'openriamap-ria', 'shared');
}
export function oldProjectClassesDir(root) {
  return path.join(root, 'project-config', 'packages', 'openriamap-ria', 'classes');
}
export function oldProjectWorkflowsDir(root) {
  return path.join(root, 'project-config', 'packages', 'openriamap-ria', 'workflows');
}
