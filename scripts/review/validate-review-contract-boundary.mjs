#!/usr/bin/env node
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'src/components/Review/contracts.ts', 'src/components/Review/session.ts', 'src/components/Review/adapterRegistry.ts', 'src/components/Review/index.ts', 'src/components/Review/submission.ts', 'src/components/Review/releasePreflight.ts',
  'project-config/schemas/review/cairnmap.review-workspace-extension.v1.schema.json',
  'project-config/templates/review/reviewWorkspace.extension.template.json', '.cairn/case-template-manifest.json', '.cairn/downstream-impact.json',
];
const errors = required.filter((file) => !fs.existsSync(path.join(root, file))).map((file) => `missing ${file}`);
const forbidden = /openriamap|ria_temp_rule_sources_v1|https?:|\bgithub\b|\bcos\b|\bcontrol\b|\bpipeline\b|\bscf\b|\btcr\b|\bvercel\b|\bcredential\b|\btoken\b|formal approval/i;
const genericPackageSourceFiles = [
  'src/components/Review/auth.ts',
  'src/components/Review/package/contracts.ts',
  'src/components/Review/package/digest.ts',
  'src/components/Review/package/index.ts',
  'src/components/Review/package/normalize.ts',
  'src/components/Review/package/parser.ts',
  'src/components/Review/package/serializer.ts',
  'src/components/Review/package/submissionTransport.ts',
  'src/components/Review/package/validator.ts',
  'src/components/Settings/ReviewAuthSettingsSection.tsx',
];
for (const file of [...required.filter((file) => file.startsWith('src/')), ...genericPackageSourceFiles]) {
  if (forbidden.test(fs.readFileSync(path.join(root, file), 'utf8'))) errors.push(`${file} contains a downstream or deployment dependency`);
}
const changed = childProcess.execFileSync('git', ['diff', '--name-only', 'upstream/main...HEAD'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const packageContractFiles = [
  'src/components/Review/auth.ts',
  'src/components/Review/package/contracts.ts',
  'src/components/Review/package/digest.ts',
  'src/components/Review/package/index.ts',
  'src/components/Review/package/normalize.ts',
  'src/components/Review/package/parser.ts',
  'src/components/Review/package/serializer.ts',
  'src/components/Review/package/submissionTransport.ts',
  'src/components/Review/package/validator.ts',
  'src/components/Settings/ReviewAuthSettingsSection.tsx',
  'src/components/Settings/SettingsPanel.tsx',
  'docs/ReviewPackageContract.md',
  'scripts/review/test-review-package-contract.ts',
  'Update_Log/CM_REVIEW_PACKAGE_CONTRACT_AUTH_CORE_1.md',
];
const allowed = new Set([...required, ...packageContractFiles, 'src/components/Review/workflow.ts', 'docs/ReviewWorkspaceContracts.md', 'docs/REVIEW_RELEASE_PREFLIGHT.md', 'scripts/review/validate-review-contract-boundary.mjs', 'scripts/review/validate-case-template-manifest.mjs', 'scripts/review/test-review-workspace-contracts.ts', 'Update_Log/CM_REVIEW_WORKFLOW_CONTRACTS_1.md', 'Update_Log/CM_REVIEW_WORKFLOW_CONTROL_CONTRACTS_1.md', 'Update_Log/CM_REVIEW_SUBMISSION_CONTRACTS_2.md', 'Update_Log/CM_REVIEW_RELEASE_PREFLIGHT_CORE_1.md', 'package.json']);
for (const file of changed) if (!allowed.has(file)) errors.push(`baseline-preservation violation: ${file} is outside the contract-only allowlist`);
if (changed.some((file) => (file.endsWith('.tsx') && !packageContractFiles.includes(file)) || file === 'src/components/Map/MapContainer.tsx' || file.startsWith('src/components/Mapping/'))) errors.push('baseline-preservation violation: UI or Mapping implementation changed');
if (errors.length) { console.error('Review contract boundary: FAIL'); errors.forEach((error) => console.error(`- ${error}`)); process.exitCode = 1; }
else console.log('Review contract boundary: PASS');
