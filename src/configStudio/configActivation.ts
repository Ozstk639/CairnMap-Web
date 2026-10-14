import type { ConfigPackageV3 } from './types';
import { migrateV31Package, migrateV4Package, migrateV5Package } from './package';
import { compileConfigRuntime, validateConfigPackage } from './runtime';
/** One validation boundary for persisted packages and runtime activation.
 * Import/edit may retain a diagnostic draft, but never bypass this boundary. */
export function prepareConfigForActivation(value: ConfigPackageV3): ConfigPackageV3 {
  if (!value || value.schemaVersion !== 'cairnmap.config-package.v3') throw new Error('无法启用：配置包结构或 schemaVersion 无效。');
  let config = structuredClone(value);
  if (config.contractRevision === 3) config = migrateV31Package(config);
  if (config.contractRevision === 4) config = migrateV4Package(config);
  if (config.contractRevision === 5) config = migrateV5Package(config);
  if (config.contractRevision !== 6 && config.contractRevision !== 7 && config.contractRevision !== 8 && config.contractRevision !== 9) throw new Error(`无法启用：未知的原生契约 revision ${config.contractRevision}。`);
  const report = validateConfigPackage(config);
  if (!report.valid) throw new Error(`无法保存或启用无效配置：${report.issues.filter(issue => issue.severity === 'error').slice(0,5).map(issue => `${issue.path}：${issue.message}`).join('；')}`);
  return compileConfigRuntime(config, true);
}
