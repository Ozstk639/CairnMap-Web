#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildConfigIndex } from './config-tools/config-index.mjs';
import { readJson, resolveProjectRoot, writeJson } from './config-tools/config-loader.mjs';
import { allowedGeometryTypes, createClassConfig } from './config-tools/class-template-generator.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (['dry-run', 'force', 'no-register', 'help'].includes(key)) {
      args[key] = true;
    } else {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

function printHelp() {
  console.log(`CairnMap Class Config Template Generator\n\nUsage:\n  npm run create:class -- --preset <preset> --classCode <CODE> --classKey <key> --geometry <type> --labelZh <中文名> [options]\n\nRequired:\n  --preset        Target preset id, for example rail, road, building\n  --classCode     Uppercase feature class code, for example MET\n  --classKey      Stable class key, for example metroLine\n  --geometry      ${allowedGeometryTypes.join(' | ')}\n  --labelZh       Chinese display label\n\nOptions:\n  --labelEn       English display label\n  --description   Class description\n  --idField       Identity field, default ID\n  --nameField     Name field, default Name\n  --displayProfile Display profile id from shared/display/displayProfiles.json\n  --labelStyle    Label style id from shared/display/labelStyles.json\n  --cardLayout    Card layout id from shared/card/cardLayouts.json\n  --dry-run       Print generated JSON without writing files\n  --force         Overwrite an existing class file\n  --no-register   Do not append classCode to preset.json providedClasses\n`);
}

function fail(message) {
  console.error(`[create:class] ERROR: ${message}`);
  process.exitCode = 1;
}

function validateInput(args, index) {
  const required = ['preset', 'classCode', 'classKey', 'geometry', 'labelZh'];
  for (const key of required) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  const classCode = String(args.classCode).toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,15}$/.test(classCode)) throw new Error('--classCode must be 2-16 uppercase letters/numbers and start with a letter');
  if (!/^[a-z][A-Za-z0-9_-]*$/.test(args.classKey)) throw new Error('--classKey must start with a lowercase letter and contain letters, numbers, _ or -');
  if (!allowedGeometryTypes.includes(args.geometry)) throw new Error(`--geometry must be one of: ${allowedGeometryTypes.join(', ')}`);
  if (!index.presets.has(args.preset)) throw new Error(`Preset not found: ${args.preset}`);
  if (index.classes.has(classCode) && !args.force) {
    throw new Error(`Class ${classCode} already exists at ${path.relative(index.root, index.classFiles.get(classCode))}. Use --force to overwrite.`);
  }
  if (args.displayProfile && !index.shared.displayProfiles.has(args.displayProfile)) throw new Error(`displayProfile not found: ${args.displayProfile}`);
  if (args.labelStyle && !index.shared.labelStyles.has(args.labelStyle)) throw new Error(`labelStyle not found: ${args.labelStyle}`);
  if (args.cardLayout && !index.shared.cardLayouts.has(args.cardLayout)) throw new Error(`cardLayout not found: ${args.cardLayout}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const root = resolveProjectRoot();
  const index = buildConfigIndex(root);
  validateInput(args, index);

  const classCode = String(args.classCode).toUpperCase();
  const presetEntry = index.presets.get(args.preset);
  const classesDir = path.join(presetEntry.dir, 'classes');
  const targetFile = path.join(classesDir, `${classCode}.json`);
  const config = createClassConfig({
    classCode,
    classKey: args.classKey,
    geometry: args.geometry,
    labelZh: args.labelZh,
    labelEn: args.labelEn,
    description: args.description,
    idField: args.idField,
    nameField: args.nameField,
    displayProfile: args.displayProfile,
    labelStyle: args.labelStyle,
    cardLayout: args.cardLayout,
  });

  if (args['dry-run']) {
    console.log(JSON.stringify(config, null, 2));
    console.log(`\nDry run only. Target file would be: ${path.relative(root, targetFile).replaceAll(path.sep, '/')}`);
    process.exit(0);
  }

  fs.mkdirSync(classesDir, { recursive: true });
  writeJson(targetFile, config);

  if (!args['no-register']) {
    const preset = readJson(presetEntry.file);
    const providedClasses = Array.isArray(preset.providedClasses) ? preset.providedClasses : [];
    if (!providedClasses.includes(classCode)) {
      preset.providedClasses = [...providedClasses, classCode].sort();
      writeJson(presetEntry.file, preset);
    }
  }

  console.log('CairnMap Class Config Template Generator');
  console.log(`  Created: ${path.relative(root, targetFile).replaceAll(path.sep, '/')}`);
  if (!args['no-register']) console.log(`  Registered in: ${path.relative(root, presetEntry.file).replaceAll(path.sep, '/')}`);
  console.log('');
  console.log('Next checks:');
  console.log('  npm run validate:project-config');
  console.log('  npm run audit:project-config');
} catch (error) {
  fail(error.message);
}
