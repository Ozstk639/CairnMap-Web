#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const audits = [
  {
    name: 'audit:class-config',
    file: './scripts/audit-class-config.mjs',
    label: 'Class source: presets/classes',
  },
  {
    name: 'audit:display-config',
    file: './scripts/audit-display-config.mjs',
    label: 'Display source: presets/shared/display + classes/*.json',
  },
  {
    name: 'audit:schema-format',
    file: './scripts/audit-schema-format.mjs',
    label: 'Format source: presets/shared/format + classes/*.json',
  },
  {
    name: 'audit:render-format-final',
    file: './scripts/audit-render-format-final.mjs',
    label: 'Render final source: presets/shared/common + executor bridge',
  },
  {
    name: 'audit:card-config',
    file: './scripts/audit-card-config.mjs',
    label: 'Card source: presets/shared/card + TS enhancement executor',
  },
  {
    name: 'audit:workflow-config',
    file: './scripts/audit-workflow-config.mjs',
    label: 'Workflow source: config -> component executor',
  },
  {
    name: 'audit:package-assembly',
    file: './scripts/audit-package-assembly.mjs',
    label: 'Package source: assembly loadOrder + presets',
  },
  {
    name: 'audit:legacy-definition',
    file: './scripts/audit-legacy-definition.mjs',
    label: 'Legacy TS role: executor/facade only',
  },
];

let failed = false;
console.log('CairnMap Final Project Config Audit');
console.log('Sources');
console.log('  Class source: presets/classes');
console.log('  Display source: presets/shared/display + classes/*.json');
console.log('  Format source: presets/shared/format');
console.log('  Card source: presets/shared/card + TS enhancement executor');
console.log('  Workflow source: config -> component executor');
console.log('  Data schema source: config runtime');
console.log('  Legacy TS role: executor/facade only');
console.log('');

for (const audit of audits) {
  console.log(`--- ${audit.name} ---`);
  console.log(`  ${audit.label}`);

  const result = spawnSync(process.execPath, [audit.file], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    failed = true;
    console.error(`[FAIL] Could not run ${audit.name}: ${result.error.message}`);
  } else if (result.status !== 0) {
    failed = true;
    console.error(`[FAIL] ${audit.name} exited with code ${result.status}`);
  }
  console.log('');
}

console.log(`Final result: ${failed ? 'FAIL' : 'PASS'}`);
process.exitCode = failed ? 1 : 0;
