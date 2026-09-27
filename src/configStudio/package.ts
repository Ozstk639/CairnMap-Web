import JSZip from 'jszip';
import type { ConfigPackageV2, ConfigValidationReport, ParityReport } from './types';

type PackageManifest = {
  schemaVersion: 'cairnmap.config-package-manifest.v2';
  packageId: string;
  projectId: string;
  revision: number;
  createdAt: string;
  sourceManifestSha256?: string;
  files: Array<{ path: string; sha256: string; byteLength: number }>;
};

const textEncoder = new TextEncoder();

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value as BufferSource);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function buildConfigPackageArchive(config: ConfigPackageV2, report: ConfigValidationReport): Promise<Blob> {
  if (!config.parity) throw new Error('配置包缺少 V1 顺承报告。');
  const files = [
    { path: 'config.json', body: stableStringify(config) },
    { path: 'reports/validation-report.json', body: stableStringify(report) },
    { path: 'reports/v1-parity-report.json', body: stableStringify(config.parity) },
  ];
  const manifestFiles = await Promise.all(files.map(async (file) => {
    const bytes = textEncoder.encode(file.body);
    return { path: file.path, sha256: await sha256(bytes), byteLength: bytes.byteLength };
  }));
  const manifest: PackageManifest = {
    schemaVersion: 'cairnmap.config-package-manifest.v2', packageId: config.packageId, projectId: config.projectId,
    revision: config.revision, createdAt: new Date().toISOString(), ...(config.sourceManifestSha256 ? { sourceManifestSha256: config.sourceManifestSha256 } : {}), files: manifestFiles,
  };
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.body);
  zip.file('manifest.json', stableStringify(manifest));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

function assertConfig(value: unknown): asserts value is ConfigPackageV2 {
  const config = value as Partial<ConfigPackageV2> | null;
  if (!config || config.schemaVersion !== 'cairnmap.config-package.v2' || !Array.isArray(config.nodes) || !Array.isArray(config.workflows)) throw new Error('配置文件不是有效的 Config Package v2。');
}

export async function readConfigPackage(file: File): Promise<ConfigPackageV2> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    assertConfig(value);
    return value;
  }
  const zip = await JSZip.loadAsync(bytes);
  const manifestRaw = await zip.file('manifest.json')?.async('string');
  const configRaw = await zip.file('config.json')?.async('string');
  const reportRaw = await zip.file('reports/validation-report.json')?.async('string');
  const parityRaw = await zip.file('reports/v1-parity-report.json')?.async('string');
  if (!manifestRaw || !configRaw || !reportRaw || !parityRaw) throw new Error('配置包缺少 manifest.json、config.json、验证报告或 V1 顺承报告。');
  const manifest = JSON.parse(manifestRaw) as PackageManifest;
  if (manifest.schemaVersion !== 'cairnmap.config-package-manifest.v2') throw new Error('配置包清单版本不受支持。');
  const config: unknown = JSON.parse(configRaw);
  assertConfig(config);
  const configEntry = manifest.files.find((item) => item.path === 'config.json');
  const reportEntry = manifest.files.find((item) => item.path === 'reports/validation-report.json');
  const parityEntry = manifest.files.find((item) => item.path === 'reports/v1-parity-report.json');
  if (!configEntry || !reportEntry || !parityEntry || await sha256(textEncoder.encode(configRaw)) !== configEntry.sha256 || await sha256(textEncoder.encode(reportRaw)) !== reportEntry.sha256 || await sha256(textEncoder.encode(parityRaw)) !== parityEntry.sha256) throw new Error('配置包文件哈希校验失败。');
  const report = JSON.parse(reportRaw) as ConfigValidationReport;
  if (report.schemaVersion !== 'cairnmap.config-validation-report.v2' || !report.valid || report.issues.some((item) => item.severity === 'error')) throw new Error('配置包内验证报告未通过，不能载入编辑。');
  const parity = JSON.parse(parityRaw) as ParityReport;
  if (parity.schemaVersion !== 'cairnmap.v1-parity-report.v1' || parity.entries.some((item) => item.status === 'unsupported')) throw new Error('配置包的 V1 顺承报告未通过。');
  return config;
}

export function downloadConfigPackage(blob: Blob, config: ConfigPackageV2): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${config.packageId}-r${config.revision}.cairn-config.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
