import { validateConfigPackage } from './runtime';
import { isNativeConfigRevision } from './contract';
import { normalizeImportedLocalization, normalizeImportedText } from './localization';
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
  FieldDefinition,
  SearchProfile,
  SelectOption,
  WorkflowControl,
  WorkflowDefinition,
  WorkflowGroupField,
} from './types';
import { createV32EngineDefaults } from './v32Defaults';

type PackageManifestV3 = {
  schemaVersion: 'cairnmap.config-package-manifest.v3';
  contractRevision: 3 | 4 | 5 | 6 | 7 | 8 | 9;
  packageId: string;
  projectId: string;
  revision: number;
  createdAt: string;
  sourceManifestSha256?: string;
  files: Array<{ path: string; sha256: string; byteLength: number }>;
};

const textEncoder = new TextEncoder();

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item) ?? 'null').join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value as BufferSource);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function buildConfigPackageArchive(config: ConfigPackageV3, report: ConfigValidationReport): Promise<Blob> {
  report = validateConfigPackage(config);
  if (!report.valid) throw new Error('配置无效，不能归档导出。请先修复校验报告中的错误。');
  const parity = config.parity ?? {
    schemaVersion: 'cairnmap.v1-parity-report.v2' as const,
    generatedAt: new Date().toISOString(),
    entries: [],
  };
  const files = [
    { path: 'config.json', body: stableStringify(config) },
    { path: 'reports/validation-report.json', body: stableStringify(report) },
    { path: 'reports/v1-parity-report.json', body: stableStringify(parity) },
  ];
  const manifestFiles = await Promise.all(files.map(async (file) => {
    const bytes = textEncoder.encode(file.body);
    return { path: file.path, sha256: await sha256(bytes), byteLength: bytes.byteLength };
  }));
  const manifest: PackageManifestV3 = {
    schemaVersion: 'cairnmap.config-package-manifest.v3',
    contractRevision: config.contractRevision,
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
  // V1 did not have a reliable English registry.  Copying the Chinese label
  // into `en` made an untranslated value look authored and prevented an
  // editor from distinguishing "not translated" from an intentional text.
  if (isRecord(value)) return { zh: String(value.zh ?? fallback), en: String(value.en ?? value['en-US'] ?? '') };
  return { zh: fallback, en: '' };
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
      conditions: Array.isArray(oldLabel.conditions) ? oldLabel.conditions as NonNullable<GeometryProfile['label']>['conditions'] : [{ kind: 'always' }],
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
      ...(item.section === 'other' ? { section: 'other' as const } : {}),
      ...(item.hideWhenEmpty === false ? { hideWhenEmpty: false } : {}),
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
    ...(Array.isArray(value.options) ? { options: value.options.map((option) => ({ value: String(option), label: { zh: String(option), en: '' } })) } : {}),
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
  const workflows: ConfigPackageV3['workflows'] = value.workflows.filter(isRecord).map((raw, index) => {
    const target: ConfigPackageV3['nodes'][number]['path'] = isRecord(raw.target) ? raw.target as ConfigPackageV3['nodes'][number]['path'] : { class: 'UNKNOWN' };
    const steps = (Array.isArray(raw.steps) ? raw.steps.filter(isRecord).map((step, stepIndex) => ({
      ...step,
      id: String(step.id ?? `migrated-step-${stepIndex}`),
      kind: String(step.kind ?? 'form') as ConfigPackageV3['workflows'][number]['steps'][number]['kind'],
      label: localized(step.label, '步骤'),
      ...(Array.isArray(step.controls) ? { controls: step.controls.filter(isRecord).map(controlFromV2) } : {}),
    })) : []) as ConfigPackageV3['workflows'][number]['steps'];
    const firstForm = steps.find((step) => step.kind === 'form');
    if (firstForm && !firstForm.controls?.some((control) => control.kind === 'classificationPicker' && control.systemManaged)) firstForm.controls = [{ id: 'system-classification', kind: 'classificationPicker', columns: 1, label: { zh: '分类', en: 'Classification' }, classificationScope: target, systemManaged: true }, ...(firstForm.controls ?? [])];
    const geometrySteps = steps.filter((step) => step.kind === 'geometry');
    const outputId = `migrated-output-${index + 1}`;
    const output: ConfigPackageV3['workflows'][number]['outputs'][number] = {
      id: outputId,
      classification: target,
      assignments: Array.isArray(raw.assignments) ? raw.assignments.filter(isRecord).map((assignment, assignmentIndex) => ({ id: String(assignment.id ?? `migrated-assignment-${assignmentIndex}`), target: String(assignment.target ?? 'ID'), expression: String(assignment.expression ?? '') })) : [],
      geometry: (() => {
        const options = (geometrySteps[0]?.geometry?.length ? geometrySteps[0].geometry : ['Point']) as GeometryKind[];
        return { selected: options[0] ?? 'Point', allowed: options };
      })(),
    };
    const normalizedSteps = steps.map((step) => step.kind === 'geometry' ? { ...step, outputId } : step);
    return {
      id: String(raw.id ?? `migrated-workflow-${index}`),
      label: localized(raw.label, '工作流'),
      mode: 'composed' as const,
      target,
      steps: normalizedSteps,
      outputs: [output],
      ...(isRecord(raw.legacy) ? { legacy: raw.legacy as ConfigPackageV3['workflows'][number]['legacy'] } : {}),
    };
  });
  return migrateV31Package({
    ...baseline,
    contractRevision: 3,
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
  } as unknown as ConfigPackageV3);
}

function assertV3(value: unknown): asserts value is Omit<ConfigPackageV3, 'contractRevision'> & { contractRevision?: number } {
  const config = value as Partial<ConfigPackageV3> | null;
  if (!config || config.schemaVersion !== 'cairnmap.config-package.v3' || !Array.isArray(config.nodes) || !Array.isArray(config.workflows) || !isRecord(config.registries)) throw new Error('配置文件不是有效的 Config Package v3。');
}

function legacyWorkflowOutput(raw: Record<string, unknown>, index: number): ConfigPackageV3['workflows'][number]['outputs'][number] {
  const target = isRecord(raw.target) ? raw.target as ConfigPackageV3['workflows'][number]['outputs'][number]['classification'] : { class: 'UNKNOWN' };
  const steps = Array.isArray(raw.steps) ? raw.steps.filter(isRecord) : [];
  const geometry = steps.find((step) => String(step.kind) === 'geometry');
  const assignments = Array.isArray(raw.assignments) ? raw.assignments.filter(isRecord).map((assignment, assignmentIndex) => ({
    id: String(assignment.id ?? `migrated-assignment-${assignmentIndex}`),
    target: String(assignment.target ?? 'ID'),
    expression: String(assignment.expression ?? ''),
  })) : [];
  const allowed: GeometryKind[] = Array.isArray(geometry?.geometry) && geometry.geometry.length ? geometry.geometry as GeometryKind[] : ['Point'];
  return { id: `output-${index + 1}`, classification: target, assignments, geometry: { selected: allowed[0], allowed } };
}

/** Browser-only migration from the former V3.0 editor contract to revision 2. */
export function migrateV30Package(value: Omit<ConfigPackageV3, 'contractRevision'> & { contractRevision?: number }): ConfigPackageV3 {
  const nodes = value.nodes.map((node) => ({
    ...node,
    inheritDown: node.inheritDown ?? {
      fields: node.policies?.fields !== 'localOnly',
      display: node.policies?.display !== 'localOnly',
      card: node.policies?.card !== 'localOnly',
    },
  }));
  const workflows = value.workflows.map((workflow, workflowIndex) => {
    const raw = workflow as unknown as Record<string, unknown>;
    const output = legacyWorkflowOutput(raw, workflowIndex);
    const outputs = Array.isArray(workflow.outputs) && workflow.outputs.length ? workflow.outputs : [output];
    const normalizedSteps = workflow.steps.map((step, stepIndex) => step.kind === 'geometry' ? { ...step, outputId: step.outputId ?? outputs[Math.min(stepIndex, outputs.length - 1)]?.id ?? output.id } : step);
    const componentKey = workflow.legacy?.componentKey ?? workflow.legacy?.runtimeMode;
    const external = componentKey && /(?:rail|station|trp)/i.test(`${workflow.id} ${componentKey}`);
    const mode = workflow.mode ?? (external ? 'external' : 'composed');
    return {
      ...workflow,
      mode,
      target: workflow.target ?? outputs[0]?.classification,
      outputs: mode === 'external' ? [] : outputs,
      steps: mode === 'external' ? [] : normalizedSteps,
      ...(mode === 'external' ? { external: workflow.external ?? { componentKey: componentKey ?? '', reason: /trp/i.test(`${workflow.id} ${componentKey}`) ? 'trp-integrated' as const : /station/i.test(`${workflow.id} ${componentKey}`) ? 'station-integrated' as const : 'railway-integrated' as const } } : { external: undefined }),
    };
  });
  return migrateV31Package({ ...value, contractRevision: 2, nodes, workflows } as unknown as ConfigPackageV3);
}

/**
 * Revision 2 kept style, zLevel, label and click behaviour on the geometry
 * profile.  Revision 3 moves all of it into each inclusive render rule.  This
 * is deliberately a browser migration: a user sees the converted draft and
 * exports a new V3.2 package rather than relying on a server-side rewrite.
 */
export function migrateV31Package(value: Omit<ConfigPackageV3, 'contractRevision'> & { contractRevision?: number }): ConfigPackageV3 {
  const normalizeProfile = (profile: GeometryProfile, geometry: GeometryKind): GeometryProfile => {
    const globalLabel = profile.label ?? {
      visible: true,
      anchor: 'featureBbox' as const,
      conditions: [{ kind: 'always' as const }],
      collision: { role: 'optional' as const, basePriority: profile.geometryStack?.zLevel ?? 300, hideWhenColliding: true },
    };
    const globalStack = profile.geometryStack ?? { zLevel: 300 };
    const globalInteraction = profile.interaction ?? {
      triggers: geometry === 'Point' ? { point: true, label: true } : geometry === 'LineString' ? { line: true, label: true } : { boundary: true, interior: true, label: true },
    };
    const fixedColor = profile.color ?? (geometry === 'Point' ? '#e04747' : geometry === 'LineString' ? '#2563eb' : '#334155');
    const rules = profile.zoomPriority.rules.length ? profile.zoomPriority.rules : [{ id: 'migrated-default', representation: 'geometry' as const }];
    return {
      ...profile,
      geometryStack: undefined,
      label: undefined,
      interaction: undefined,
      color: undefined,
      style: undefined,
      zoomPriority: {
        rules: rules.map((old, index) => ({
          ...old,
          id: old.id || `migrated-rule-${index + 1}`,
          minZoom: old.minZoom ?? (old.minExclusive === undefined ? 0 : old.minExclusive + 1),
          maxZoom: old.maxZoom ?? (old.maxExclusive === undefined ? 8 : old.maxExclusive - 1),
          representation: old.representation ?? 'geometry',
          geometryStack: old.geometryStack ?? globalStack,
          style: old.style ?? {
            ...(geometry === 'Point' ? { pointShape: 'circle' as const, size: Math.max(6, Number(profile.style?.weight ?? 2) * 3) } : {}),
            weight: profile.style?.weight ?? (geometry === 'LineString' ? 3 : 2),
            stroke: { mode: 'fixed' as const, color: fixedColor },
            ...(geometry !== 'LineString' ? { fill: { mode: 'fixed' as const, color: fixedColor }, fillOpacity: profile.style?.fillOpacity ?? (geometry === 'Polygon' ? 0.25 : 0.88) } : {}),
            strokeOpacity: profile.style?.opacity ?? 0.9,
            dashPreset: profile.style?.dashArray ? 'dash' as const : 'solid' as const,
          },
          label: old.label ?? {
            visible: globalLabel.visible,
            font: 'whiteBlackOutline' as const,
            size: 16,
            source: 'Name',
            collision: { ...globalLabel.collision, role: old.labelRole ?? globalLabel.collision.role },
          },
          interaction: old.interaction ?? globalInteraction,
          advanced: old.advanced ?? {
            ...(globalLabel.conditions.length ? { label: { conditions: globalLabel.conditions } } : {}),
            ...(profile.legacyDisplay ? { specialLogic: profile.legacyDisplay.specialLogicKeys } : {}),
          },
          minExclusive: undefined,
          maxExclusive: undefined,
        })),
      },
    };
  };
  const nodes = value.nodes.map((node) => {
    const geometryProfiles: ConfigPackageV3['nodes'][number]['geometryProfiles'] = {};
    for (const geometry of ['Point', 'LineString', 'Polygon'] as GeometryKind[]) {
      const profile = node.geometryProfiles?.[geometry];
      if (profile) geometryProfiles[geometry] = normalizeProfile(profile, geometry);
    }
    const enabled = (['Point', 'LineString', 'Polygon'] as GeometryKind[]).filter((geometry) => geometryProfiles[geometry]?.enabled);
    return { ...node, inheritDown: node.inheritDown ?? { fields: true, display: true, card: true }, ...(node.geometryType ? {} : enabled.length === 1 ? { geometryType: enabled[0] } : {}), geometryProfiles };
  });
  const workflows = value.workflows.map((workflow) => ({
    ...workflow,
    outputs: workflow.outputs.map((output) => ({
      ...output,
      geometry: {
        selected: output.geometry.selected ?? output.geometry.allowed?.[0] ?? 'Point',
      },
    })),
    ...(workflow.mode === 'external' && workflow.external ? {
      external: {
        ...workflow.external,
        coveredClassifications: workflow.external.coveredClassifications ?? (workflow.target ? [workflow.target] : []),
      },
    } : {}),
  }));
  return { ...value, contractRevision: 3, nodes, workflows } as ConfigPackageV3;
}

/**
 * Revision 5 removes the ambiguous shortcuts that made authored V3 values
 * diverge from the runtime: field paths retain their namespace, choices have
 * a display label plus a stored value, and every controlled search has one
 * target/query/display/return contract.  It is deliberately lossless for
 * r4 imports: old values are normalized into the new fields rather than
 * discarded.
 */
function migrationText(value: unknown, fallback = ''): LocalizedText {
  if (isRecord(value)) return normalizeImportedText(value.zh ?? fallback, value.en);
  return { zh: fallback, en: '' };
}

function migrationOptions(value: unknown): SelectOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    if (isRecord(entry)) {
      const stored = String(entry.value ?? entry.id ?? entry.key ?? '');
      const label = isRecord(entry.label) ? entry.label : undefined;
      const shown = String(entry.label ?? entry.name ?? stored);
      return { value: stored, label: { zh: String(label?.zh ?? label?.['zh-CN'] ?? shown), en: String(label?.en ?? '') } };
    }
    const stored = String(entry ?? '');
    return { value: stored, label: { zh: stored, en: '' } };
  }).filter((entry) => Boolean(entry.value));
}

function migrationSearch(value: SearchProfile | undefined): SearchProfile | undefined {
  if (!value) return undefined;
  const legacy = value.coarse;
  const queryFields = value.queryFields?.filter(Boolean) ?? value.searchFields?.filter(Boolean) ?? [];
  const displayFields = value.displayFields?.filter(Boolean) ?? [];
  const returnField = value.returnField?.trim() || value.returnFields?.find(Boolean) || 'ID';
  return {
    target: value.target,
    queryFields,
    displayTemplate: value.displayTemplate?.trim() || (displayFields.length ? displayFields.map((field) => `{{${field}}}`).join(' ') : '{{ID}} ({{Name}})'),
    returnField,
    matcher: value.matcher ?? legacy?.matcher ?? 'contains',
    minQueryLength: value.minQueryLength ?? legacy?.minQueryLength ?? 1,
    maxResults: value.maxResults ?? legacy?.maxResults ?? 30,
    ...(value.debounceMs ?? legacy?.debounceMs ? { debounceMs: value.debounceMs ?? legacy?.debounceMs } : {}),
    cacheScope: value.cacheScope ?? 'loadedWorlds',
  };
}

function migrationGroupField(field: WorkflowGroupField): WorkflowGroupField {
  return {
    ...field,
    kind: field.kind === 'coarseSearch' ? 'featureSearch' : field.kind,
    ...(migrationOptions(field.options) ? { options: migrationOptions(field.options) } : {}),
    ...(migrationSearch(field.search) ? { search: migrationSearch(field.search) } : {}),
  };
}

function migrationControl(control: WorkflowControl): WorkflowControl {
  const search = migrationSearch(control.search);
  const options = migrationOptions(control.options);
  const group = control.group ? {
    ...control.group,
    storage: control.group.storage ?? 'object' as const,
    itemFields: control.group.itemFields.map(migrationGroupField),
  } : undefined;
  return {
    ...control,
    kind: control.kind === 'coarseSearch' ? 'featureSearch' : control.kind,
    ...(options ? { options } : {}),
    ...(search ? { search } : {}),
    ...(group ? { group } : {}),
  };
}

function migrationField(field: FieldDefinition): FieldDefinition | undefined {
  const legacyKey = String(field.key ?? '').trim();
  // r4 accidentally materialised the optional namespaces themselves as text
  // fields.  They are headings, not values, so remove only those two exact
  // synthetic declarations while retaining every real dotted child path.
  if (legacyKey === 'tags' || legacyKey === 'extensions') return undefined;
  const scope = field.scope ?? (legacyKey.startsWith('tags.') ? 'tags' : legacyKey.startsWith('extensions.') ? 'extensions' : 'root');
  const key = scope === 'tags' && !legacyKey.startsWith('tags.') ? `tags.${legacyKey}`
    : scope === 'extensions' && !legacyKey.startsWith('extensions.') ? `extensions.${legacyKey}`
      : legacyKey;
  return { ...field, key, scope, labels: migrationText(field.labels, legacyKey), description: migrationText(field.description), ...(migrationOptions(field.options) ? { options: migrationOptions(field.options) } : {}) };
}

export function migrateV4Package(value: Omit<ConfigPackageV3, 'contractRevision'> & { contractRevision?: number }): ConfigPackageV3 {
  const nodes = value.nodes.map((node) => ({
    ...node,
    fields: (node.fields ?? []).map(migrationField).filter((field): field is FieldDefinition => Boolean(field)),
  }));
  const workflows = value.workflows.map((workflow): WorkflowDefinition => ({
    ...workflow,
    steps: (workflow.steps ?? []).map((step) => ({ ...step, controls: step.controls?.map(migrationControl) })),
  }));
  return {
    ...value,
    contractRevision: 5,
    engine: value.engine ?? createV32EngineDefaults(),
    nodes,
    workflows,
  } as ConfigPackageV3;
}

/** Preserve authored r5 visuals when separating collision and display priority. */
export function migrateV5Package(value: ConfigPackageV3): ConfigPackageV3 {
  if (value.contractRevision !== 5) return normalizeImportedLocalization(value);
  const config = normalizeImportedLocalization(structuredClone(value));
  config.contractRevision = 6;
  const sources = new Map(createConfigPackageFromCurrentProject().registries.optionSets?.map(set => [set.id,set]) ?? []);
  const sets = new Map(config.registries.optionSets?.map(set => [set.id,set]) ?? []);
  for (const field of config.nodes.flatMap(node => node.fields)) if (field.optionSource && !sets.has(field.optionSource.registryKey)) {
    const id = field.optionSource.registryKey; const known = sources.get(id);
    if (field.options?.length) sets.set(id, { id, label: field.labels, options: structuredClone(field.options) });
    else if (known) sets.set(id, structuredClone(known));
  }
  for (const control of config.workflows.flatMap(workflow => workflow.steps.flatMap(step => step.controls ?? []))) if (control.optionSource && control.options?.length) {
    // r5 executed the explicit options. Preserve those authored choices;
    // the source identifier remains in the auditable migration report.
    config.parity?.entries.push({ kind: 'shared', id: `r5-options-${control.id}`, source: control.optionSource.registryKey, status: 'registryReference', details: 'r5 使用本地静态选项；升级保留该列表，避免新选项来源覆盖用户修改。' });
    delete control.optionSource;
  }
  config.registries.optionSets = [...sets.values()];
  for (const node of config.nodes) for (const profile of Object.values(node.geometryProfiles)) {
    for (const rule of profile?.zoomPriority.rules ?? []) {
      if (!rule.label) continue;
      rule.label.withDot = false;
      if (rule.conditionalOverrides?.some(override => override.priority || override.label)) {
        rule.label.collision.compatibility = 'r5DisplayPriority';
        for (const override of rule.conditionalOverrides) if (override.label) { override.label.collision.compatibility = 'r5DisplayPriority'; override.label.withDot = false; }
      } else {
        rule.label.collision.basePriority += rule.priority?.metric && rule.priority.mode === 'replace' ? 0 : Number(rule.priority?.base ?? 0);
        if (rule.priority?.metric) rule.label.collision.metric = structuredClone(rule.priority.metric);
      }
    }
  }
  if (config.engine) for (const visual of Object.values(config.engine.interactionBaselines.Point)) {
    if (typeof visual === 'object' && !visual.symbol) visual.symbol = { kind: 'circle', radius: Math.max(5, visual.strokeWidth * 2.5) };
  }
  return config;
}

function asConfig(value: unknown): ConfigPackageV3 {
  assertV3(value);
  if (isNativeConfigRevision(value.contractRevision)) return migrateV5Package(value as ConfigPackageV3);
  if (value.contractRevision === 4) return migrateV5Package(migrateV4Package(value));
  if (value.contractRevision === 3) return migrateV5Package(migrateV4Package(migrateV31Package(value)));
  throw new Error('该配置包属于无法读取的旧 V3 契约。请先使用兼容版本导出后再导入。');
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
