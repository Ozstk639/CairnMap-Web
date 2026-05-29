import fs from 'node:fs';
import path from 'node:path';
import { classConfigPath, coreSharedDir } from './lib/audit-config-paths.mjs';

const ROOT = process.cwd();
const sharedRoot = coreSharedDir(ROOT);
const sharedCardDir = path.join(sharedRoot, 'card');

const expectedClasses = ['BUD','FLR','ISG','ISL','ISP','PFB','PLF','RLE','ROD','SBP','STA','STB','STF','TPP','TRP','WRP'];
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (file) => fs.existsSync(file);

const errors = [];
const warnings = [];
const info = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const note = (m) => info.push(m);

function normalize(v) { return String(v ?? '').trim(); }

const classConfigs = new Map();
for (const code of expectedClasses) {
  const file = classConfigPath(ROOT, code);
  if (!exists(file)) { err(`Missing class config: ${code}.json`); continue; }
  const cfg = readJson(file);
  classConfigs.set(code, cfg);
}

const cardLayoutsFile = path.join(sharedCardDir, 'cardLayouts.json');
const cardEnhancementsFile = path.join(sharedCardDir, 'cardEnhancements.json');
const cardContractsFile = path.join(sharedCardDir, 'cardRuntimeContracts.json');
if (!exists(cardLayoutsFile)) err('Missing shared/card/cardLayouts.json');
if (!exists(cardEnhancementsFile)) err('Missing shared/card/cardEnhancements.json');
if (!exists(cardContractsFile)) err('Missing shared/card/cardRuntimeContracts.json');

const layouts = exists(cardLayoutsFile) ? readJson(cardLayoutsFile).items ?? [] : [];
const enhancements = exists(cardEnhancementsFile) ? readJson(cardEnhancementsFile).items ?? [] : [];
const contracts = exists(cardContractsFile) ? readJson(cardContractsFile).items ?? [] : [];
const relationActionsFile = path.join(sharedRoot, 'relation', 'relationActions.json');
const relationActions = exists(relationActionsFile) ? readJson(relationActionsFile).items ?? [] : [];
const relationActionKeys = new Set(relationActions.map((item) => normalize(item.key ?? item.id)));
const layoutIds = new Set(layouts.map((item) => normalize(item.id)));
const enhancementIds = new Set(enhancements.map((item) => normalize(item.id)));
const contractClasses = new Set(contracts.map((item) => normalize(item.classCode).toUpperCase()));
const contractByClass = new Map(contracts.map((item) => [normalize(item.classCode).toUpperCase(), item]));
const ordinaryConfigPrimaryClasses = new Set(['ISP','ISL','ISG','ROD','TPP','WRP','BUD','FLR']);
const specialCardPrimaryClasses = new Set(['TRP','STA','PLF','RLE','STB','SBP','STF','PFB']);

const finalAllowedModes = new Set(['configPrimary', 'specialCardPrimary']);

for (const code of expectedClasses) {
  const cfg = classConfigs.get(code);
  if (!cfg) continue;
  const card = cfg.card ?? {};
  const layoutId = normalize(card.layoutId);
  if (!layoutId) err(`${code}: card.layoutId missing`);
  else if (!layoutIds.has(layoutId)) err(`${code}: unknown card.layoutId "${layoutId}"`);
  if (!Array.isArray(card.sections)) warn(`${code}: card.sections should be an array`);
  if (!Array.isArray(card.fields)) warn(`${code}: card.fields should be an array`);
  if (!Array.isArray(card.relations)) warn(`${code}: card.relations should be an array`);
  if (!Array.isArray(card.enhancements)) warn(`${code}: card.enhancements should be an array`);
  for (const rel of card.relations ?? []) {
    const actionKey = normalize(rel.relationActionKey ?? rel.key);
    if (actionKey && relationActionKeys.size && !relationActionKeys.has(actionKey)) {
      err(`${code}: unknown card relation action key "${actionKey}"`);
    }
  }
  for (const enh of card.enhancements ?? []) {
    const key = normalize(enh.key);
    if (key && !enhancementIds.has(key)) err(`${code}: unknown card enhancement key "${key}"`);
  }
  if (!contractClasses.has(code)) err(`${code}: missing card runtime contract`);
  const contract = contractByClass.get(code);
  if (ordinaryConfigPrimaryClasses.has(code) && contract?.runtimeMode !== 'configPrimary') {
    err(`${code}: expected card runtimeMode configPrimary`);
  }
  if (specialCardPrimaryClasses.has(code) && contract?.runtimeMode !== 'specialCardPrimary') {
    err(`${code}: expected card runtimeMode specialCardPrimary`);
  }
  if (contract && !finalAllowedModes.has(contract.runtimeMode)) {
    warn(`${code}: card runtimeMode is not final primary mode: ${contract.runtimeMode}`);
  }
}

for (const layout of layouts) {
  const id = normalize(layout.id);
  if (!id) err('cardLayouts: item without id');
  if (!Array.isArray(layout.items)) err(`cardLayouts/${id}: items should be array`);
  for (const item of layout.items ?? []) {
    if (item.kind === 'enhancement') {
      const key = normalize(item.key);
      if (!enhancementIds.has(key)) err(`cardLayouts/${id}: unknown enhancement key "${key}"`);
    }
  }
}

console.log('CairnMap Card Config Audit');
console.log('Summary');
console.log(`  Classes checked: ${classConfigs.size}`);
console.log(`  Layouts: ${layouts.length}`);
console.log(`  Enhancements: ${enhancements.length}`);
console.log(`  Contracts: ${contracts.length}`);
for (const m of info) console.log(`  [INFO] ${m}`);
for (const m of warnings) console.log(`  [WARN] ${m}`);
for (const m of errors) console.log(`  [ERROR] ${m}`);
const result = errors.length ? 'FAIL' : warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS';
console.log(`Result: ${result}`);
process.exit(errors.length ? 1 : 0);
