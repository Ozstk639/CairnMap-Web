import JSZip from 'jszip';
import { createConfigPackageFromCurrentProject } from './legacyProjectAdapter';
import type {
  CardConfiguration,
  CardItem,
  ConfigPackageV2Import,
  ConfigPackageV3,
  ConfigValidationReport,
  GeometryKind,
  GeometryProfile,
  LocalizedText,
  WorkflowControl,
} from './types';

type PackageManifestV3 = {
  schemaVersion: 'cairnmap.config-package-manifest.v3';
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

export async function buildConfigPackageArchive(config: ConfigPackageV3, report: ConfigValidationReport): Promise<Blob> {
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
  const manifest: PackageManifestV3 = {
    schemaVersion: 'cairnmap.config-package-manifest.v3',
    packageId: config.packageId,
    projectId: config.projectId,
    revision: config.revision,
    createdAt: new Date().toISOString(),
    ...(config.sourceManifestSha256 ? { sourceManifestSha256: config.sourceManifestSha256 } : {}),
    files: manifestFiles,
  };
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.body);
  zip.file('manifest.json', stableStringify(manifest));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function localized(value: unknown, fallback: string): LocalizedText {
  if (isRecord(value)) return { zh: String(value.zh ?? fallback), en: String(value.en ?? value.zh ?? fallback) };
  return { zh: fallback, en: fallback };
}

function profileFromV2(raw: Record<string, unknown>, geometry: GeometryKind): GeometryProfile {
  const oldLabel = isRecord(raw.label) ? raw.label : {};
  const oldInteraction = isRecord(raw.interaction) ? raw.interaction : {};
  const oldAggregate = isRecord(raw.aggregatePriority) ? raw.aggregatePriority : null;
  const mode = String(oldInteraction.mode ?? 'standard');
  const triggers = geometry === 'Point' ? { point: true, label: true } : geometry === 'LineString' ? { line: true, label: true } : { boundary: true, interior: true, label: true };
  const zLevel = Number(raw.zLevel ?? 300);
  const rules = oldAggregate?.enabled ? [{
    id: 'migrated-v2-priority', minExclusive: 0, representation: 'geometry' as const,
    priority: {
      mode: 'replace' as const,
      base: Number(isRecord(oldAggregate.priorityRange) ? oldAggregate.priorityRange.min : zLevel),
      metric: {
        kind: String(oldAggregate.metric ?? 'area') as 'area' | 'length' | 'partCount' | 'field',
        ...(oldAggregate.field ? { field: String(oldAggregate.field) } : {}),
        multiplier: Number(oldAggregate.multiplier ?? 1),
        rounding: String(oldAggregate.curve ?? 'linear') === 'step' ? 'floor' as const : 'none' as const,
        ...(isRecord(oldAggregate.inputRange) ? { min: Number(oldAggregate.inputRange.min), max: Number(oldAggregate.inputRange.max) } : {}),
      },
    },
  }] : [{ id: 'migrated-v2-default', minExclusive: 0, representation: 'geometry' as const, priority: { mode: 'replace' as const, base: zLevel } }];
  return {
    enabled: raw.enabled !== false,
    allowMultipleParts: raw.allowMultipleParts !== false,
    color: String(raw.color ?? (geometry === 'Point' ? '#e04747' : '#334155')),
    geometryStack: { zLevel: Number.isFinite(zLevel) ? zLevel : 300 },
    label: {
      visible: oldLabel.visible !== false,
      anchor: raw.allowMultipleParts === false ? 'featureBbox' : String(oldLabel.scope ?? 'featureBbox') === 'part' ? 'perPart' : 'featureBbox',
      conditions: Array.isArray(oldLabel.conditions) ? oldLabel.conditions as GeometryProfile['label']['conditions'] : [{ kind: 'always' }],
      collision: { role: mode === 'building' || mode === 'floor' ? 'important' : 'optional', basePriority: Number(raw.interactionPriority ?? zLevel), hideWhenColliding: true },
    },
    zoomPriority: { rules },
    interaction: { triggers },
    ...(isRecord(raw.legacyDisplay) ? { legacyDisplay: raw.legacyDisplay as GeometryProfile['legacyDisplay'] } : {}),
  };
}

function cardFromV2(value: unknown): CardConfiguration {
  if (!Array.isArray(value)) return { mode: 'fields', items: [] };
  const special = value.map((item) => isRecord(item) ? item : {}).find((item) => item.renderer === 'specialCard');
  if (special) {
    const key = isRecord(special.options) ? String(special.options.specialCardKey ?? '') : '';
    if (key.startsWith('layout:')) return { mode: 'layout', layoutId: key.slice('layout:'.length) };
    if (key) return { mode: 'component', componentKey: key };
  }
  return {
    mode: 'fields',
    items: value.filter(isRecord).filter((item) => item.renderer !== 'specialCard').map((item, index) => ({
      id: String(item.id ?? `migrated-card-${index}`),
      source: String(item.source ?? 'Name'),
      visible: item.visible !== false,
      renderer: String(item.renderer ?? 'text') as CardItem['renderer'],
      ...(item.label ? { label: localized(item.label, String(item.source ?? '字段')) } : {}),
      ...(isRecord(item.options) ? { options: item.options as CardItem['options'] } : {}),
      ...(isRecord(item.relation) ? { relation: item.relation as CardItem['relation'] } : {}),
    })),
  };
}

function controlFromV2(value: Record<string, unknown>, index: number): WorkflowControl {
  const kind = String(value.kind ?? 'text') as WorkflowControl['kind'];
  const oldSearch = isRecord(value.search) ? value.search : null;
  return {
    id: String(value.id ?? `migrated-control-${index}`),
    ...(value.slot ? { slot: String(value.slot) } : {}),
    kind,
    columns: Number(value.columns) === 2 || Number(value.columns) === 3 ? Number(value.columns) as 2 | 3 : 1,
    label: localized(value.label, '输入项'),
    ...(Array.isArray(value.options) ? { options: value.options.map(String) } : {}),
    ...(isRecord(value.optionSource) ? { optionSource: value.optionSource as WorkflowControl['optionSource'] } : {}),
    ...(oldSearch ? { search: {
      mode: String(oldSearch.mode ?? (kind === 'coarseSearch' ? 'coarse' : 'feature')) === 'coarse' ? 'coarse' as const : 'feature' as const,
      target: {
        class: String(Array.isArray(oldSearch.targetClassScope) ? oldSearch.targetClassScope[0] ?? '' : ''),
        ...(Array.isArray(oldSearch.kindScope) && oldSearch.kindScope[0] ? { kind: String(oldSearch.kindScope[0]) } : {}),
        ...(Array.isArray(oldSearch.skindScope) && oldSearch.skindScope[0] ? { skind: String(oldSearch.skindScope[0]) } : {}),
        ...(Array.isArray(oldSearch.skind2Scope) && oldSearch.skind2Scope[0] ? { skind2: String(oldSearch.skind2Scope[0]) } : {}),
      },
      searchFields: Array.isArray(oldSearch.searchFields) ? oldSearch.searchFields.map(String) : [],
      displayFields: Array.isArray(oldSearch.displayFields) ? oldSearch.displayFields.map(String) : [],
      returnFields: Array.isArray(oldSearch.returnFields) ? oldSearch.returnFields.map(String) : [],
      cacheScope: String(oldSearch.cacheScope) === 'world' ? 'world' as const : 'loadedWorlds' as const,
      ...(kind === 'coarseSearch' ? { coarse: { matcher: 'contains' as const, minQueryLength: 1, maxResults: 30 } } : {}),
    } } : {}),
  };
}

/**
 * V2 imports are deliberately migrated rather than interpreted in place. It
 * retains their user data while replacing the ambiguous display/card/workflow
 * structures with the V3 contracts.
 */
export function migrateV2Package(value: ConfigPackageV2Import): ConfigPackageV3 {
  const baseline = createConfigPackageFromCurrentProject();
  const nodes: ConfigPackageV3['nodes'] = value.nodes.filter(isRecord).map((raw, index) => {
    const path = isRecord(raw.path) ? raw.path as ConfigPackageV3['nodes'][number]['path'] : { class: 'UNKNOWN' };
    const profiles = isRecord(raw.geometryProfiles) ? raw.geometryProfiles : {};
    const geometryProfiles: ConfigPackageV3['nodes'][number]['geometryProfiles'] = {};
    (['Point', 'LineString', 'Polygon'] as GeometryKind[]).forEach((geometry) => {
      if (isRecord(profiles[geometry])) geometryProfiles[geometry] = profileFromV2(profiles[geometry] as Record<string, unknown>, geometry);
    });
    return {
      nodeId: String(raw.nodeId ?? `migrated-node-${index}`),
      path,
      children: Array.isArray(raw.children) ? raw.children.map(String) : [],
      policies: isRecord(raw.policies) ? raw.policies as ConfigPackageV3['nodes'][number]['policies'] : { fields: 'overridable', display: 'overridable', card: 'overridable', workflow: 'overridable' } as ConfigPackageV3['nodes'][number]['policies'],
      fields: Array.isArray(raw.fields) ? raw.fields as ConfigPackageV3['nodes'][number]['fields'] : [],
      geometryProfiles,
      ...(isRecord(raw.containment) ? { containment: raw.containment as ConfigPackageV3['nodes'][number]['containment'] } : {}),
      card: cardFromV2(raw.card),
      ...(isRecord(raw.legacy) ? { legacy: raw.legacy as ConfigPackageV3['nodes'][number]['legacy'] } : {}),
    };
  });
  const workflows = value.workflows.filter(isRecord).map((raw, index) => {
    const target = isRecord(raw.target) ? raw.target as ConfigPackageV3['workflows'][number]['target'] : { class: 'UNKNOWN' };
    const steps = Array.isArray(raw.steps) ? raw.steps.filter(isRecord).map((step, stepIndex) => ({
      ...step,
      id: String(step.id ?? `migrated-step-${stepIndex}`),
      kind: String(step.kind ?? 'form') as ConfigPackageV3['workflows'][number]['steps'][number]['kind'],
      label: localized(step.label, '步骤'),
      ...(Array.isArray(step.controls) ? { controls: step.controls.filter(isRecord).map(controlFromV2) } : {}),
    })) : [];
    const firstForm = steps.find((step) => step.kind === 'form');
    if (firstForm && !firstForm.controls?.some((control) => control.kind === 'classificationPicker' && control.systemManaged)) firstForm.controls = [{ id: 'system-classification', kind: 'classificationPicker', columns: 1, label: { zh: '分类', en: 'Classification' }, classificationScope: target, systemManaged: true }, ...(firstForm.controls ?? [])];
    return {
      id: String(raw.id ?? `migrated-workflow-${index}`),
      label: localized(raw.label, '工作流'),
      target,
      steps,
      assignments: Array.isArray(raw.assignments) ? raw.assignments.filter(isRecord).map((assignment, assignmentIndex) => ({ id: String(assignment.id ?? `migrated-assignment-${assignmentIndex}`), target: String(assignment.target ?? 'ID'), expression: String(assignment.expression ?? '') })) : [],
      ...(isRecord(raw.legacy) ? { legacy: raw.legacy as ConfigPackageV3['workflows'][number]['legacy'] } : {}),
    };
  });
  return {
    ...baseline,
    packageId: value.packageId,
    projectId: value.projectId,
    revision: value.revision,
    displayName: value.displayName,
    nodes,
    workflows,
    parity: {
      schemaVersion: 'cairnmap.v1-parity-report.v2',
      generatedAt: new Date().toISOString(),
      entries: Array.isArray(value.parity?.entries) ? (value.parity.entries as Array<Record<string, unknown>>).map((entry) => ({
        kind: String(entry.kind ?? 'shared') as 'class' | 'workflow' | 'shared',
        id: String(entry.id ?? 'migrated'),
        source: String(entry.source ?? 'v2 import'),
        status: entry.status === 'unsupported' ? 'unsupported' as const : entry.status === 'registryReference' ? 'registryReference' as const : 'resolved' as const,
        ...(entry.details ? { details: String(entry.details) } : {}),
      })) : [],
    },
  };
}

function assertV3(value: unknown): asserts value is ConfigPackageV3 {
  const config = value as Partial<ConfigPackageV3> | null;
  if (!config || config.schemaVersion !== 'cairnmap.config-package.v3' || !Array.isArray(config.nodes) || !Array.isArray(config.workflows) || !isRecord(config.registries)) throw new Error('配置文件不是有效的 Config Package v3。');
}

function asConfig(value: unknown): ConfigPackageV3 {
  if (isRecord(value) && value.schemaVersion === 'cairnmap.config-package.v2') return migrateV2Package(value as ConfigPackageV2Import);
  assertV3(value);
  return value;
}

export async function readConfigPackage(file: File): Promise<ConfigPackageV3> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return asConfig(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  const zip = await JSZip.loadAsync(bytes);
  const manifestRaw = await zip.file('manifest.json')?.async('string');
  const configRaw = await zip.file('config.json')?.async('string');
  if (!manifestRaw || !configRaw) throw new Error('配置包缺少 manifest.json 或 config.json。');
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  const config = asConfig(JSON.parse(configRaw) as unknown);
  if (manifest.schemaVersion === 'cairnmap.config-package-manifest.v3') {
    const v3 = manifest as unknown as PackageManifestV3;
    const configEntry = v3.files.find((item) => item.path === 'config.json');
    if (!configEntry || await sha256(textEncoder.encode(configRaw)) !== configEntry.sha256) throw new Error('配置包 config.json 哈希校验失败。');
  }
  return config;
}

export function downloadConfigPackage(blob: Blob, config: ConfigPackageV3): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${config.packageId}-r${config.revision}.cairn-config-v3.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
