import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { normalizeRuleSourceWorldId } from '@/components/Rules/data/ruleDataSources';
import type { ClassificationPath, ConfigPackageV3, MountedFeatureRecord, SearchProfile, WorkflowControl, WorkflowDefinition, WorkflowGroupField, WorkflowStep } from './types';
import { listCategoryPaths, normalizeSearchProfile, optionLabel, pathMatchesScope, readRecordPath, workflowPathLabel, hasCategoryNode, resolveGeometryProfile, resolveEffectiveFields } from './runtime';

import { finalizeV3WorkflowRecord } from './workflowRecord';
import { multipartGeometryFromSinglePath, validateMultipartGeometry, type MultipartCoord } from '../core/geometry/multipartGeometry';
import { evaluateWorkflowExpression, isSafeWorkflowTarget, PROTECTED_WORKFLOW_TARGETS, workflowOutputAssemblyOrder, workflowCaptureSlots, workflowConditionMatches } from './workflowExpression';

export type V3WorkflowValueMap = Record<string, unknown>;
export type V3WorkflowRunResult = Array<{ outputId: string; classification: ClassificationPath; geometry: string; record: Record<string, unknown> }>;
export type V3WorkflowInputIssue = { stepId?: string; controlId?: string; message: string };
export type V3SearchCandidate = { id: string; display: string; returned: unknown; record: MountedFeatureRecord };
export type V3GeometryCapture = { coordinates: MultipartCoord[]; point?: { x: number; y?: number; z: number } };

export function resolveV3WorldPrefix(world: unknown): string {
  const raw = normalizeV3WorldId(world);
  const byId: Record<string, string> = { zth: 'Z', naraku: 'N', houtu: 'H', eden: 'E', laputa: 'L', yunduan: 'Y' };
  return byId[raw] ?? (/^[ZNHELY]$/i.test(raw) ? raw.toUpperCase() : 'Z');
}

/** One canonical World value is used by workflow output, search, and the
 * map executor.  Imports may still carry legacy numeric, Chinese, or prefix
 * values, but they never create a second logical world namespace. */
export function normalizeV3WorldId(world: unknown): string {
  return normalizeRuleSourceWorldId(String(world ?? ''));
}

/** The editor and runner use exactly the same safe parser/evaluator. */
export const evaluateV3Expression = evaluateWorkflowExpression;

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  if (!isSafeWorkflowTarget(path)) throw new Error(`无效组装路径：${path}`);
  const parts = String(path ?? '').split('.').filter(Boolean); if (!parts.length) return;
  let cursor = target;
  for (const key of parts.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function resolvedClassification(output: WorkflowDefinition['outputs'][number], selections: Record<string, ClassificationPath | undefined>): ClassificationPath {
  return selections[output.id] ?? output.classification;
}

function parseStructuredOutput(target: string, value: unknown): unknown {
  if (target !== 'tags' && target !== 'extensions') return value;
  if (typeof value !== 'string' || !value.trim()) return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function normalizeV3WorkflowSlots(workflow: WorkflowDefinition, raw: V3WorkflowValueMap): V3WorkflowValueMap {
  const slots = { ...raw };
  for (const control of workflow.steps.flatMap((step) => step.controls ?? [])) {
    if (!control.slot || slots[control.slot] == null) continue;
    const value = slots[control.slot];
    if (control.kind === 'json' && typeof value === 'string' && value.trim()) { try { slots[control.slot] = JSON.parse(value); } catch { /* Input validation reports incomplete JSON. */ } continue; }
    if (control.valueNormalization === 'abbr') slots[control.slot] = String(value).trim().replace(/\s+/g, '').replace(/[^A-Za-z0-9_-]/g, '');
    else if (control.valueNormalization === 'trim') slots[control.slot] = String(value).replace(/\r\n?/g, '\n').trim();
    else if ((control.valueNormalization === 'number' || control.kind === 'number') && String(value).trim()) { const number = Number(value); if (Number.isFinite(number)) slots[control.slot] = number; }
  }
  for (const point of workflow.steps.flatMap(step => step.drawing?.auxiliaryPoints ?? [])) if (!workflowConditionMatches(point.when, slots)) delete slots[point.slot];
  for (const slot of workflowCaptureSlots(workflow)) {
    const point = slots[slot] as Record<string, unknown> | undefined;
    for (const axis of ['x','y','z']) {
      const value = point?.[axis];
      slots[`${slot}_${axis.toUpperCase()}`] = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    }
  }
  return slots;
}

export function workflowOutputSystem(workflow: WorkflowDefinition, slots: V3WorkflowValueMap, options: { world?: string; classifications?: Record<string, ClassificationPath | undefined> }, outputId: string): V3WorkflowValueMap {
  const world = normalizeV3WorldId(options.world ?? slots.World ?? 'zth');
  const values = (classification: ClassificationPath) => ({ World: world, WorldPrefix: resolveV3WorldPrefix(world), Class: classification.class, Kind: classification.kind ?? '', Skind: classification.skind ?? '', Skind2: classification.skind2 ?? '', Creator: slots.actor ?? '', ID: slots.ID ?? '' });
  const selected = workflow.outputs.find((output) => output.id === outputId) ?? workflow.outputs[0];
  const system: V3WorkflowValueMap = selected ? values(resolvedClassification(selected, options.classifications ?? {})) : {};
  workflow.outputs.forEach((output, index) => Object.entries(values(resolvedClassification(output, options.classifications ?? {}))).forEach(([key, value]) => { system[`${key}_${index + 1}`] = value; }));
  return system;
}

export function evaluateV3WorkflowOutputs(workflow: WorkflowDefinition, slots: V3WorkflowValueMap, options: { world?: string; classifications?: Record<string, ClassificationPath | undefined>; config?: ConfigPackageV3; coordinates?: Record<string, MultipartCoord[]>; now?: Date } = {}): V3WorkflowRunResult {
  slots = normalizeV3WorkflowSlots(workflow, slots);
  const world = normalizeV3WorldId(options.world ?? slots.World ?? 'zth');
  const assembled = new Map<number, V3WorkflowRunResult[number]>();
  for (const index of workflowOutputAssemblyOrder(workflow)) {
    const output = workflow.outputs[index];
    const classification = resolvedClassification(output, options.classifications ?? {});
    const system = workflowOutputSystem(workflow, slots, { ...options, world }, output.id);
    for (const [otherIndex, result] of assembled) system[`ID_${otherIndex + 1}`] = result.record.ID ?? '';
    if (options.config && (!hasCategoryNode(options.config, classification) || !pathMatchesScope(classification, output.classification) || !resolveGeometryProfile(options.config, classification, output.geometry.selected)?.enabled)) throw new Error(`输出 ${output.id} 的分类或几何无效。`);
    const record: Record<string, unknown> = { World: world, Class: classification.class, ...(classification.kind ? { Kind: classification.kind } : {}), ...(classification.skind ? { SKind: classification.skind } : {}), ...(classification.skind2 ? { SKind2: classification.skind2 } : {}) };
    const actor = String(slots.actor ?? '').trim(); if (actor) record.Creator = actor;
    for (const namespace of ['tags', 'extensions'] as const) {
      const value = parseStructuredOutput(namespace, slots[namespace]);
      if (value && typeof value === 'object' && !Array.isArray(value)) record[namespace] = value;
    }
    const assignmentOrder = [...output.assignments.filter(assignment => assignment.target === 'ID'), ...output.assignments.filter(assignment => assignment.target !== 'ID')];
    for (const assignment of assignmentOrder) {
      if (!workflowConditionMatches(assignment.when, slots, system)) continue;
      if (PROTECTED_WORKFLOW_TARGETS.has(assignment.target.split('.')[0])) {
        const source = assignment.target === 'SKind' ? 'Skind' : assignment.target === 'SKind2' ? 'Skind2' : assignment.target;
        if (assignment.expression.trim() === source && source in system) continue;
        throw new Error(`系统字段 ${assignment.target} 不能由组装覆盖。`);
      }
      const value = parseStructuredOutput(assignment.target, evaluateV3Expression(assignment.expression, slots, system));
      if (value !== undefined) setPath(record, assignment.target, value);
      system.ID = record.ID ?? '';
      system[`ID_${index + 1}`] = record.ID ?? '';
    }
    record.World = world;
    const finalized = options.config && options.coordinates?.[output.id] ? finalizeV3WorkflowRecord(options.config, { ...output, classification }, record, { coords: options.coordinates[output.id], now: options.now ?? new Date() }) : record;
    assembled.set(index, { outputId: output.id, classification, geometry: output.geometry.selected, record: finalized });
  }
  return workflow.outputs.map((_, index) => assembled.get(index)!);
}

function empty(value: unknown): boolean { return value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0); }

function recordPath(record: MountedFeatureRecord): ClassificationPath {
  return { class: String(record.Class ?? ''), ...(record.Kind ? { kind: String(record.Kind) } : {}), ...(record.Skind ?? record.SKind ? { skind: String(record.Skind ?? record.SKind) } : {}), ...(record.Skind2 ?? record.SKind2 ? { skind2: String(record.Skind2 ?? record.SKind2) } : {}) };
}

function displaySearchTemplate(template: string, record: MountedFeatureRecord): string {
  return template.replace(/{{\s*([A-Za-z][A-Za-z0-9_.]*)\s*}}/g, (_all, field: string) => String(readRecordPath(record, field) ?? 'Null'));
}

/** Query actual mounted records. The returned value is deliberately one field,
 * while ID/Name are only the human-facing choice label. */
export function findV3SearchCandidates(records: MountedFeatureRecord[], profile: SearchProfile | undefined, query: string, world?: string): V3SearchCandidate[] {
  const search = normalizeSearchProfile(profile);
  const needle = query.trim().toLocaleLowerCase();
  if (!search || needle.length < (search.minQueryLength ?? 1)) return [];
  const matches = (value: string) => {
    const text = value.toLocaleLowerCase();
    if (search.matcher === 'prefix') return text.startsWith(needle);
    if (search.matcher === 'token') return text.split(/[\s_\-/.]+/).some((token) => token.startsWith(needle));
    if (search.matcher === 'fuzzy') { let index = 0; for (const char of text) if (char === needle[index]) index += 1; return index === needle.length; }
    return text.includes(needle);
  };
  return records.filter((record) => {
    if (search.cacheScope !== 'loadedWorlds' && world && String(record.World ?? '').trim() && normalizeV3WorldId(record.World) !== normalizeV3WorldId(world)) return false;
    if (!pathMatchesScope(recordPath(record), search.target)) return false;
    return (search.queryFields ?? []).some((field) => matches(String(readRecordPath(record, field) ?? '')));
  }).slice(0, search.maxResults ?? 30).map((record, index) => ({ id: String(record.ID ?? index), display: displaySearchTemplate(search.displayTemplate ?? '{{ID}} ({{Name}})', record), returned: readRecordPath(record, search.returnField ?? 'ID'), record }));
}

export function validateV3WorkflowInputs(workflow: WorkflowDefinition, slots: V3WorkflowValueMap, steps = workflow.steps): V3WorkflowInputIssue[] {
  if (workflow.mode !== 'composed') return [];
  const issues: V3WorkflowInputIssue[] = [];
  for (const step of steps) if (step.kind === 'actor' && workflow.actor?.required !== false && empty(slots.actor)) issues.push({ stepId: step.id, message: '填写人为必填项。' });
  const validateValue = (field: WorkflowControl | WorkflowGroupField, value: unknown, report: (message: string) => void) => {
    if (field.required && empty(value)) report(`${field.label.zh} 为必填项。`);
    if (empty(value)) return;
    if (field.kind === 'number' && !Number.isFinite(Number(value))) report(`${field.label.zh} 必须是有限数值。`);
    if (field.kind === 'select' && !field.options?.some((option) => option.value === value)) report(`${field.label.zh} 必须选择有效的保存值。`);
    if (field.kind === 'json') try { if (typeof value === 'string') JSON.parse(value); } catch { report(`${field.label.zh} 必须是有效 JSON。`); }
  };
  for (const step of steps) for (const control of step.controls ?? []) {
    if (!workflowConditionMatches(control.when, slots)) continue;
    const value = slots[control.slot ?? control.id];
    const report = (message: string) => issues.push({ stepId: step.id, controlId: control.id, message });
    validateValue(control, value, report);
    if (control.kind !== 'group') continue;
    const group = control.group; const scalar = group?.storage === 'scalar';
    const rows = Array.isArray(value) ? value : [];
    if (!empty(value) && !Array.isArray(value)) report(`${control.label.zh} 必须是数组。`);
    const minItems = Math.max(group?.minItems ?? 0, control.required || group?.optional === false ? 1 : 0);
    if (rows.length < minItems) report(`${control.label.zh} 至少需要 ${minItems} 项。`);
    for (const [rowIndex, row] of rows.entries()) {
      if (!scalar && (!row || typeof row !== 'object' || Array.isArray(row))) { report(`${control.label.zh} 第 ${rowIndex + 1} 项必须是字段对象。`); continue; }
      if (scalar && row !== null && typeof row === 'object') { report(`${control.label.zh} 第 ${rowIndex + 1} 项必须是纯值。`); continue; }
      for (const field of group?.itemFields ?? []) validateValue(field, scalar ? row : row[field.key], (message) => report(`第 ${rowIndex + 1} 项：${message}`));
    }
  }
  for (const step of steps) for (const point of step.drawing?.auxiliaryPoints ?? []) {
    if (!workflowConditionMatches(point.when, slots)) continue;
    const value = slots[point.slot] as { x?: number; y?: number; z?: number } | undefined;
    if (point.required && !value || value && (!Number.isFinite(value.x) || !Number.isFinite(value.z) || value.y !== undefined && !Number.isFinite(value.y))) issues.push({ stepId: step.id, controlId: point.id, message: `${point.label.zh} 必须采用有效点坐标。` });
  }
  if (steps.some((step) => step.kind === 'tagsExtensions')) for (const field of ['tags', 'extensions']) {
    if (empty(slots[field])) continue;
    try {
      const value = typeof slots[field] === 'string' ? JSON.parse(slots[field] as string) : slots[field];
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    } catch { issues.push({ message: `${field} 必须是有效 JSON 对象。` }); }
  }
  return issues;
}

/** Creation validates the assembled record, not only its form slots. */
export function validateV3WorkflowRecords(config: ConfigPackageV3, workflow: WorkflowDefinition, result: V3WorkflowRunResult): V3WorkflowInputIssue[] {
  const issues: V3WorkflowInputIssue[] = [];
  for (const output of result) {
    const definition = workflow.outputs.find(item => item.id === output.outputId);
    if (!definition || !hasCategoryNode(config, output.classification) || !pathMatchesScope(output.classification, definition.classification)) { issues.push({ message: `输出 ${output.outputId} 的分类无效。` }); continue; }
    if (!String(output.record.ID ?? '').trim()) issues.push({ message: `输出 ${output.outputId} 缺少有效 ID。` });
    for (const field of resolveEffectiveFields(config, output.classification)) {
      const value = readRecordPath(output.record, field.key);
      const required = field.required || field.requiredWhen?.some(condition => condition.kind === 'always' || condition.kind === 'fieldPresent' && !empty(readRecordPath(output.record, condition.field)) === condition.present || condition.kind === 'fieldEquals' && String(readRecordPath(output.record, condition.field) ?? '') === condition.value || condition.kind === 'fieldIn' && condition.values.includes(String(readRecordPath(output.record, condition.field) ?? '')));
      if (required && empty(value)) issues.push({ message: `输出 ${output.outputId} 的 ${field.key} 为必填项。` });
      if (empty(value)) continue;
      const values = field.cardinality === 'multiple' ? Array.isArray(value) ? value : [value] : [value];
      if (field.cardinality === 'multiple' && !Array.isArray(value)) issues.push({ message: `${field.key} 必须是数组。` });
      if (field.type === 'number' && values.some(item => typeof item !== 'number' || !Number.isFinite(item))) issues.push({ message: `${field.key} 必须是有限数值。` });
      if (field.type === 'boolean' && values.some(item => typeof item !== 'boolean')) issues.push({ message: `${field.key} 必须是布尔值。` });
      if (field.type === 'enum' && field.options?.length && values.some(item => !field.options!.some(option => option.value === String(item)))) issues.push({ message: `${field.key} 不是有效选项值。` });
    }
  }
  return issues;
}

function encodePath(path: ClassificationPath): string { return JSON.stringify(path); }
function decodePath(value: string): ClassificationPath | undefined { try { const parsed = JSON.parse(value); return parsed?.class ? parsed as ClassificationPath : undefined; } catch { return undefined; } }

function ToggleInput({ value, onChange }: { value: unknown; onChange: (value: boolean) => void }) {
  return <span className="inline-flex overflow-hidden rounded border text-sm"><button type="button" className={`px-3 py-1 ${value === true ? 'bg-blue-600 text-white' : 'bg-white'}`} onClick={() => onChange(true)}>是</button><button type="button" className={`border-l px-3 py-1 ${value === false ? 'bg-slate-700 text-white' : 'bg-white'}`} onClick={() => onChange(false)}>否</button></span>;
}

function FeatureSearchInput({ profile, records, value, onChange, placeholder, world }: { profile?: SearchProfile; records: MountedFeatureRecord[]; value: unknown; onChange: (value: unknown) => void; placeholder?: string; world?: string }) {
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setSettledQuery(query), profile?.debounceMs ?? 180); return () => window.clearTimeout(timer); }, [query, profile?.debounceMs]);
  const candidates = useMemo(() => findV3SearchCandidates(records, profile, settledQuery, world ?? String((records[0] as MountedFeatureRecord | undefined)?.World ?? '')), [records, profile, settledQuery, world]);
  const search = normalizeSearchProfile(profile);
  return <div className="space-y-1"><input className="w-full rounded border px-2 py-1 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder ?? '输入 ID 或 Name 搜索'} />
    {query && search ? <div className="max-h-32 overflow-auto rounded border bg-white text-xs shadow-sm">{candidates.length ? candidates.map((candidate) => <button type="button" key={`${candidate.id}-${String(candidate.returned)}`} className="block w-full px-2 py-1 text-left hover:bg-blue-50" onClick={() => { onChange(candidate.returned); setQuery(candidate.display); }}>{candidate.display}</button>) : <p className="px-2 py-1 text-slate-500">无匹配要素</p>}</div> : null}
    <small className="block text-slate-500">返回：{String(value ?? '') || '（尚未选择）'} · 范围：{search ? `${search.target.class}${search.target.kind ? `/${search.target.kind}` : ''}` : '未配置'}</small></div>;
}

function fieldInput(field: WorkflowGroupField, value: unknown, onChange: (value: unknown) => void, records: MountedFeatureRecord[], world?: string) {
  const common = { className: 'w-full rounded border px-2 py-1 text-sm', value: String(value ?? ''), placeholder: field.placeholder, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) };
  if (field.kind === 'textarea' || field.kind === 'json') return <textarea {...common} rows={field.rows ?? (field.kind === 'json' ? 4 : 3)} />;
  if (field.kind === 'toggle') return <ToggleInput value={value} onChange={onChange} />;
  if (field.kind === 'select') return <select {...common}><option value="">请选择</option>{(field.options ?? []).map((item) => <option key={item.value} value={item.value}>{optionLabel(item)}</option>)}</select>;
  if (field.kind === 'featureSearch' || field.kind === 'coarseSearch') return <FeatureSearchInput profile={field.search} records={records} value={value} onChange={onChange} placeholder={field.placeholder} world={world} />;
  return <input {...common} type={field.kind === 'number' ? 'number' : 'text'} />;
}

function GroupControlInput({ control, value, onChange, records, world }: { control: WorkflowControl; value: unknown; onChange: (value: unknown) => void; records: MountedFeatureRecord[]; world?: string }) {
  const group = control.group;
  if (!group) return <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">此重复字段组缺少字段定义。</div>;
  const scalar = group.storage === 'scalar';
  const rows = Array.isArray(value) ? value.map((item) => scalar ? { '': item } : item).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
  const makeRow = () => Object.fromEntries(group.itemFields.map((field) => [field.key, field.defaultValue ?? (field.kind === 'toggle' ? false : '')]));
  const serialize = (next: Array<Record<string, unknown>>) => scalar ? next.map((row) => row['']) : next;
  const updateRow = (index: number, key: string, nextValue: unknown) => onChange(serialize(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: nextValue } : row)));
  return <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2">{rows.map((row, index) => <fieldset key={`${control.id}-${index}`} className="rounded border bg-white p-2"><legend className="px-1 text-xs text-slate-500">第 {index + 1} 项</legend><div className="grid gap-2 md:grid-cols-2">{group.itemFields.map((field) => <label key={`${field.key}-${index}`} className="grid gap-1 text-xs"><span>{field.label.zh}{field.required ? ' *' : ''}</span>{fieldInput(field, row[field.key], (nextValue) => updateRow(index, field.key, nextValue), records, world)}</label>)}</div><button type="button" className="mt-2 text-xs text-rose-700" onClick={() => onChange(serialize(rows.filter((_, rowIndex) => rowIndex !== index)))}>删除此项</button></fieldset>)}<button type="button" className="rounded border bg-white px-2 py-1 text-xs" onClick={() => onChange(serialize([...rows, makeRow()]))}>{group.addLabel?.zh ?? `添加${control.label.zh}`}</button></div>;
}

function ControlInput({ control, value, onChange, config, records, world }: { control: WorkflowControl; value: unknown; onChange: (value: unknown) => void; config: ConfigPackageV3; records: MountedFeatureRecord[]; world?: string }) {
  if (control.kind === 'group') return <GroupControlInput control={control} value={value} onChange={onChange} records={records} world={world} />;
  const common = { className: 'w-full rounded border px-2 py-1 text-sm', value: String(value ?? ''), placeholder: control.placeholder, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) };
  if (control.kind === 'textarea' || control.kind === 'json') return <textarea {...common} rows={control.rows ?? (control.kind === 'json' ? 4 : 3)} placeholder={control.kind === 'json' ? '{ }' : control.placeholder} />;
  if (control.kind === 'toggle') return <ToggleInput value={value} onChange={onChange} />;
  if (control.kind === 'select') return <select {...common}><option value="">请选择</option>{(control.options ?? []).map((item) => <option key={item.value} value={item.value}>{optionLabel(item)}</option>)}</select>;
  if (control.kind === 'classificationPicker') {
    const options = listCategoryPaths(config, control.classificationScope ?? { class: '' }).filter((path) => pathMatchesScope(path, control.classificationScope ?? { class: '' }));
    return <select className="w-full rounded border px-2 py-1 text-sm" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}><option value="">请选择分类</option>{options.map((path) => <option key={encodePath(path)} value={encodePath(path)}>{workflowPathLabel(config, path)}</option>)}</select>;
  }
  if (control.kind === 'featureSearch' || control.kind === 'coarseSearch') return <FeatureSearchInput profile={control.search} records={records} value={value} onChange={onChange} placeholder={control.placeholder} world={world} />;
  return <input {...common} type={control.kind === 'number' ? 'number' : 'text'} />;
}

/** Usable generic runner. It runs V3-composed flows and performs the same
 * target-scoped search used by saved workflows; external units remain intact. */
export function V3WorkflowRunner({ config, workflow, records = [], worldId, initialActor = '', onSubmit, onRequestExternal, onRequestGeometry, onCaptureGeometry, onStepChange, onPreviewSlotsChange }: {
  config: ConfigPackageV3; workflow: WorkflowDefinition; records?: MountedFeatureRecord[]; worldId?: string; initialActor?: string;
  onSubmit?: (result: V3WorkflowRunResult) => void | Promise<void>;
  onRequestExternal?: (workflow: WorkflowDefinition) => void;
  onRequestGeometry?: (outputId: string, geometry: string) => void | MultipartCoord[] | Promise<void | MultipartCoord[]>;
  onCaptureGeometry?: (outputId: string, geometry: string) => MultipartCoord[] | V3GeometryCapture;
  onStepChange?: (step: WorkflowStep | undefined) => void;
  onPreviewSlotsChange?: (slots: V3WorkflowValueMap) => void;
}) {
  const [coordinates, setCoordinates] = useState<Record<string, MultipartCoord[]>>({});
  const [createdAt] = useState(() => new Date());
  const [geometryErrors, setGeometryErrors] = useState<Record<string, string>>({});
  const [geometryInputs, setGeometryInputs] = useState<Record<string, string>>({});
  const activeWorld = normalizeV3WorldId(worldId ?? records.find(record => String(record.World ?? '').trim())?.World ?? 'zth');
  const defaults = () => Object.fromEntries(workflow.steps.flatMap(item => item.controls ?? []).flatMap(control => control.defaultValue === undefined ? [] : [[control.slot ?? control.id, structuredClone(control.defaultValue)]]));
  const [page, setPage] = useState(0);
  const [slots, setSlots] = useState<V3WorkflowValueMap>(() => ({ ...defaults(), actor: initialActor, World: activeWorld }));
  const [classifications, setClassifications] = useState<Record<string, ClassificationPath | undefined>>({});
  const [submitted, setSubmitted] = useState<V3WorkflowRunResult | null>(null);
  const [inputIssues, setInputIssues] = useState<V3WorkflowInputIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const stepCallback = useRef(onStepChange); stepCallback.current = onStepChange;
  const steps = workflow.mode === 'composed' ? workflow.steps : [];
  const step = steps[page];
  useEffect(() => { stepCallback.current?.(step); }, [step?.id, page]);
  useEffect(() => { onPreviewSlotsChange?.(slots); }, [slots, onPreviewSlotsChange]);
  useEffect(() => { setSlots(current => ({ ...defaults(), ...current, World: activeWorld })); }, [workflow, activeWorld]);
  const previewState = useMemo(() => {
    try { return { outputs: workflow.mode === 'composed' ? evaluateV3WorkflowOutputs(workflow, slots, { world: activeWorld, classifications, config, coordinates, now: createdAt }) : [], error: '' }; }
    catch (error) { return { outputs: [], error: error instanceof Error ? error.message : '输出表达式无效。' }; }
  }, [workflow, slots, classifications, activeWorld, config, coordinates, createdAt]);
  if (workflow.mode === 'external') return <section className="rounded border bg-violet-50 p-3"><strong>外部整体工作流：{workflow.label.zh}</strong><button type="button" disabled={!onRequestExternal} className="ml-2 rounded border px-2 py-1" onClick={() => onRequestExternal?.(workflow)}>打开已受控工作流</button></section>;
  if (!step) return <p>工作流没有页面。</p>;
  const currentIssues = inputIssues.filter(issue => !issue.stepId || issue.stepId === step.id);
  const acceptGeometry = (outputId: string, geometry: string, capture: MultipartCoord[] | V3GeometryCapture) => {
    const coords = Array.isArray(capture) ? capture : capture.coordinates;
    const error = validateMultipartGeometry(multipartGeometryFromSinglePath(geometry as WorkflowDefinition['outputs'][number]['geometry']['selected'], coords));
    if (error) throw new Error(error);
    setCoordinates(current => ({ ...current, [outputId]: coords }));
    setGeometryInputs(current => ({ ...current, [outputId]: JSON.stringify(coords) }));
    setGeometryErrors(current => ({ ...current, [outputId]: '' }));
    const pointSlot = workflow.steps.find(item => item.kind === 'geometry' && item.outputId === outputId)?.drawing?.pointSlot;
    if (pointSlot) setSlots(current => ({ ...current, [pointSlot]: Array.isArray(capture) ? coords[0] : capture.point }));
  };
  const captureGeometry = () => {
    const outputId = step.outputId!; const geometry = step.geometry![0];
    try { acceptGeometry(outputId, geometry, onCaptureGeometry!(outputId, geometry)); }
    catch (error) { setGeometryErrors(current => ({ ...current, [outputId]: error instanceof Error ? error.message : '几何无效。' })); }
  };
  const next = () => {
    const issues = validateV3WorkflowInputs(workflow, slots, [step]);
    if (step.kind === 'geometry') {
      const error = geometryErrors[step.outputId!] || validateMultipartGeometry(multipartGeometryFromSinglePath(step.geometry![0], coordinates[step.outputId!] ?? []));
      if (error) issues.push({ stepId: step.id, message: error });
    }
    setInputIssues(issues);
    if (!issues.length) setPage(value => Math.min(steps.length - 1, value + 1));
  };
  const submit = async () => {
    if (savingRef.current || submitted) return;
    const geometryIssues = workflow.outputs.flatMap(output => {
      const error = geometryErrors[output.id] || validateMultipartGeometry(multipartGeometryFromSinglePath(output.geometry.selected, coordinates[output.id] ?? []));
      return error ? [{ message: `输出 ${output.id}：${error}` }] : [];
    });
    const issues = [...validateV3WorkflowInputs(workflow, slots), ...geometryIssues, ...(previewState.error ? [{ message: previewState.error }] : []), ...validateV3WorkflowRecords(config, workflow, previewState.outputs)];
    setInputIssues(issues);
    if (issues.length) return;
    savingRef.current = true; setSaving(true);
    try { await onSubmit?.(previewState.outputs); setSubmitted(previewState.outputs); }
    catch (error) { setInputIssues([{ message: error instanceof Error ? error.message : '保存失败，请重试。' }]); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <section className="rounded-lg border bg-white p-3">
    <div className="mb-3 flex justify-between"><strong>{step.label.zh}</strong><span className="text-xs">世界：{activeWorld} · 第 {page + 1} / {steps.length} 页</span></div>
    {step.kind === 'actor' ? <label className="block text-sm">填写人<input aria-label="填写人" className="mt-1 w-full rounded border px-2 py-1" value={String(slots.actor ?? '')} onChange={event => setSlots(current => ({ ...current, actor: event.target.value }))} /></label> : null}
    {step.kind === 'tagsExtensions' ? <div className="grid gap-2 sm:grid-cols-2">{(['tags', 'extensions'] as const).filter(key => step.tagsExtensions?.[key === 'tags' ? 'tagsEnabled' : 'extensionsEnabled'] !== false).map(key => <textarea key={key} className="rounded border p-2 text-sm" rows={3} placeholder={`${key} JSON（可选）`} value={typeof slots[key] === 'object' ? JSON.stringify(slots[key]) : String(slots[key] ?? '')} onChange={event => setSlots(current => ({ ...current, [key]: event.target.value }))} />)}</div> : null}
    {step.kind === 'geometry' ? <div className="rounded border border-dashed p-3 text-sm">
      <p>固定绘制类型：{step.geometry?.[0]} · 已采用 {coordinates[step.outputId!]?.length ?? 0} 个坐标</p>
      <button type="button" className="mt-2 rounded border px-2 py-1" onClick={() => {
        const outputId = step.outputId!; const geometry = step.geometry![0];
        if (onRequestGeometry) void Promise.resolve(onRequestGeometry(outputId, geometry)).then(coords => { if (Array.isArray(coords)) acceptGeometry(outputId, geometry, coords); }).catch(error => setGeometryErrors(current => ({ ...current, [outputId]: error.message })));
        else { const coords = geometry === 'Point' ? [{ x: 0, y: -64, z: 0 }] : geometry === 'LineString' ? [{ x: 0, y: -64, z: 0 }, { x: 20, y: -64, z: 10 }] : [{ x: 0, y: -64, z: 0 }, { x: 20, y: -64, z: 0 }, { x: 20, y: -64, z: 20 }, { x: 0, y: -64, z: 0 }]; acceptGeometry(outputId, geometry, coords); }
      }}>{onRequestGeometry ? '进入绘制' : '使用预览样例几何'}</button>
      {onCaptureGeometry ? <button type="button" className="ml-2 rounded bg-blue-600 px-2 py-1 text-white" onClick={captureGeometry}>采用当前绘制</button> : <label className="mt-2 grid gap-1 text-xs">预览坐标（x / y / z）<textarea className="w-full rounded border p-2 font-mono" rows={3} value={geometryInputs[step.outputId!] ?? '[]'} onChange={event => {
        const outputId = step.outputId!; setGeometryInputs(current => ({ ...current, [outputId]: event.target.value }));
        try { const coords = JSON.parse(event.target.value); if (!Array.isArray(coords)) throw new Error('坐标必须是数组。'); acceptGeometry(outputId, step.geometry![0], coords); }
        catch (error) { setGeometryErrors(current => ({ ...current, [outputId]: error instanceof Error ? error.message : '几何无效。' })); }
      }} /></label>}
      {geometryErrors[step.outputId!] ? <p role="alert" className="text-rose-700">{geometryErrors[step.outputId!]}</p> : null}
    </div> : null}
    {(step.drawing?.auxiliaryPoints ?? []).filter(point => workflowConditionMatches(point.when, slots)).map(point => {
      const value = slots[point.slot] as { x?: number; y?: number; z?: number } | undefined;
      const update = (next: { x?: number; y?: number; z?: number }) => setSlots(current => ({ ...current, [point.slot]: next }));
      return <fieldset key={point.id} className="mt-3 rounded border p-2 text-sm"><legend>{point.label.zh}{point.required ? ' *' : ''}</legend>{onCaptureGeometry ? <><button type="button" className="rounded border px-2 py-1" disabled={!coordinates[step.outputId!]?.length} onClick={() => { void onRequestGeometry?.(`auxiliary:${point.id}`, 'Point'); }}>进入{point.label.zh}绘制</button><button type="button" className="ml-2 rounded border px-2 py-1" onClick={() => { try { const capture = onCaptureGeometry(`auxiliary:${point.id}`, 'Point'); const raw = Array.isArray(capture) ? capture[0] : capture.point; if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) throw new Error('请先绘制目标点。'); update(raw); setInputIssues([]); } catch (error) { setInputIssues([{ stepId: step.id, message: error instanceof Error ? error.message : '辅助点无效。' }]); } }}>采用{point.label.zh}</button></> : <div className="grid grid-cols-3 gap-2">{(['x','y','z'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" className="w-full rounded border" value={value?.[axis] ?? ''} onChange={event => update({ ...value, [axis]: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>)}</div>}<p className="mt-1 text-xs">{value ? `已采用：X=${value.x}，Z=${value.z}${value.y === undefined ? '' : `，Y=${value.y}`}` : '尚未采用坐标'}</p></fieldset>;
    })}
    {step.controls?.length ? <div className="grid gap-2 md:grid-cols-6">{step.controls.filter(control => workflowConditionMatches(control.when, slots)).map(control => <div key={control.id} className={`grid min-w-0 gap-1 text-sm ${control.columns === 1 ? 'md:col-span-6' : control.columns === 2 ? 'md:col-span-3' : 'md:col-span-2'}`}>
      <span>{control.label.zh}{control.required ? ' *' : ''}</span><ControlInput control={control} value={slots[control.slot ?? control.id]} config={config} records={records} world={activeWorld} onChange={value => {
        if (control.kind === 'classificationPicker') { const classification = decodePath(String(value)); if (classification && control.outputId) setClassifications(current => ({ ...current, [control.outputId!]: classification })); }
        setSlots(current => ({ ...current, [control.slot ?? control.id]: value })); setInputIssues([]);
      }} />
    </div>)}</div> : null}
    {currentIssues.length ? <ul role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{currentIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
    <div className="mt-3 flex justify-between"><button type="button" disabled={page === 0 || saving || step.kind === 'geometry' && step.drawing?.allowBack === false} className="rounded border px-3 py-1 disabled:opacity-40" onClick={() => { setInputIssues([]); if (step.kind === 'geometry' && step.drawing?.keepDrawingWhenBack === false) { setCoordinates(current => ({ ...current, [step.outputId!]: [] })); setSlots(current => { const next = { ...current }; for (const key of [step.drawing?.pointSlot, ...(step.drawing?.auxiliaryPoints ?? []).map(point => point.slot)]) if (key) delete next[key]; return next; }); } setPage(value => Math.max(0, value - 1)); }}>上一页</button>
      {page === steps.length - 1 ? <button type="button" disabled={saving || Boolean(submitted)} className="rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-40" onClick={() => void submit()}>{saving ? '保存中…' : onSubmit ? '确认保存输出' : '生成预览输出'}</button> : <button type="button" className="rounded bg-blue-600 px-3 py-1 text-white" onClick={next}>下一页</button>}
    </div>
    {!onSubmit ? <details className="mt-3 rounded border p-2"><summary>最终 record 预览</summary>{previewState.error ? <p role="alert">{previewState.error}</p> : <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(previewState.outputs, null, 2)}</pre>}</details> : null}
    {submitted && !onSubmit ? <pre className="mt-3 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-xs text-emerald-100">{JSON.stringify(submitted, null, 2)}</pre> : null}
  </section>;
}

export default V3WorkflowRunner;
