import { Download, FileUp, FolderOpen, Plus, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConfigPackageV3, ConfigValidationReport, MountedFeatureRecord, WorkflowDefinition } from './types';
import { validateConfigPackage, validateWorkflowDefinition } from './runtime';
import { canonicalizeWorkflow, V3WorkflowEditor } from './V3WorkflowEditor';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const blankWorkflow = (): WorkflowDefinition => ({
  id: `workflow-${Date.now().toString(36)}`,
  label: { zh: '新工作流', en: '' },
  mode: 'composed',
  target: { class: '' },
  steps: [],
  outputs: [{ id: `output-${Date.now().toString(36)}`, classification: { class: '' }, assignments: [], geometry: { selected: 'Point' } }],
});

type WorkflowArtifact = {
  schemaVersion: 'cairnmap.workflow-design.v3';
  contractRevision: 5 | 6 | 7 | 8 | 9;
  exportedAt: string;
  projectId: string;
  workflow: WorkflowDefinition;
};

export interface WorkflowWorkbenchProps {
  config: ConfigPackageV3;
  /** Called only after a workflow has passed its own validation and is saved. */
  onChange: (config: ConfigPackageV3) => boolean | void | Promise<boolean | void>;
  onDraftStateChange?: (active: boolean) => void;
  records?: MountedFeatureRecord[];
}

function downloadArtifact(artifact: WorkflowArtifact): void {
  const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${artifact.workflow.id}.cairn-workflow-v3.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function WorkflowWorkbench({ config, onChange, onDraftStateChange, records = [] }: WorkflowWorkbenchProps) {
  const [selectedId, setSelectedId] = useState(config.workflows[0]?.id ?? '');
  const [draft, setDraft] = useState<WorkflowDefinition | null>(null);
  const [report, setReport] = useState<ConfigValidationReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => config.workflows.find((workflow) => workflow.id === selectedId), [config.workflows, selectedId]);

  useEffect(() => { onDraftStateChange?.(draft !== null); }, [draft, onDraftStateChange]);

  useEffect(() => {
    if (selectedId && config.workflows.some((workflow) => workflow.id === selectedId)) return;
    setSelectedId(config.workflows[0]?.id ?? '');
  }, [config.workflows, selectedId]);

  const confirmDiscardDraft = (purpose: string): boolean => !draft || window.confirm(`当前工作流草稿尚未保存。${purpose}将放弃该草稿，是否继续？`);
  const clearDraft = () => { setDraft(null); setReport(null); };

  const load = () => {
    if (!selected || !confirmDiscardDraft('读取已保存工作流')) return;
    setDraft(canonicalizeWorkflow(clone(selected), config));
    setReport(null);
  };
  const create = () => {
    if (!confirmDiscardDraft('新建工作流')) return;
    const next = canonicalizeWorkflow(blankWorkflow(), config);
    setSelectedId('');
    setDraft(next);
    setReport(null);
  };
  const validate = () => {
    if (!draft) return;
    setReport(validateWorkflowDefinition(canonicalizeWorkflow(draft, config), config));
  };
  const save = async () => {
    if (!draft) return;
    const next = canonicalizeWorkflow(draft, config);
    const nextReport = validateWorkflowDefinition(next, config);
    setReport(nextReport);
    if (!nextReport.valid) return;
    const existing = config.workflows.find((workflow) => workflow.id === next.id);
    if (existing && !window.confirm(`工作流“${existing.label.zh}”已存在。保存将覆盖该工作流，是否继续？`)) return;
    const nextPackage = {
      ...config,
      workflows: existing
        ? config.workflows.map((workflow) => workflow.id === next.id ? next : workflow)
        : [...config.workflows, next],
    };
    const packageReport = validateConfigPackage(nextPackage, records);
    setReport(packageReport);
    if (!packageReport.valid || await onChange(nextPackage) === false) return;
    setSelectedId(next.id);
    setDraft(null);
  };
  const exportDraft = () => {
    if (!draft) return;
    downloadArtifact({
      schemaVersion: 'cairnmap.workflow-design.v3',
      contractRevision: config.contractRevision as 5 | 6 | 7 | 8 | 9,
      exportedAt: new Date().toISOString(),
      projectId: config.projectId,
      workflow: canonicalizeWorkflow(draft, config),
    });
  };
  const importFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as Partial<WorkflowArtifact>;
      if (raw.schemaVersion !== 'cairnmap.workflow-design.v3' || !raw.workflow) throw new Error('文件不是标准 V3 工作流设计稿。');
      if (raw.contractRevision !== 5 && raw.contractRevision !== 6 && raw.contractRevision !== 7 && raw.contractRevision !== 8 && raw.contractRevision !== 9) throw new Error('未知工作流契约版本。');
      if (!confirmDiscardDraft('导入工作流设计稿')) return;
      setDraft(canonicalizeWorkflow(raw.workflow, config));
      setSelectedId('');
      setReport(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '无法导入工作流设计稿。');
    }
  };

  return <section aria-label="工作流编辑区域" className="h-full max-h-full min-h-0 overflow-y-auto overscroll-contain rounded-xl border bg-white p-4">
    <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) void importFile(file);
      event.currentTarget.value = '';
    }} />
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-auto text-lg font-semibold">工作流设计</h2>
      <select className="max-w-xs rounded border px-2 py-1" value={selectedId} onChange={(event) => {
        if (!confirmDiscardDraft('切换工作流')) return;
        setSelectedId(event.target.value);
        clearDraft();
      }}>
        <option value="">选择已保存工作流</option>
        {config.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.label.zh}（{workflow.id}）</option>)}
      </select>
      <button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" disabled={!selected} onClick={load}><FolderOpen className="h-4 w-4" />读取</button>
      <button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={create}><Plus className="h-4 w-4" />新建</button>
      <button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" disabled={!draft} onClick={validate}><ShieldCheck className="h-4 w-4" />核验</button>
      <button type="button" className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-sm text-white disabled:opacity-40" disabled={!draft} onClick={save}><Save className="h-4 w-4" />保存</button>
      <button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" disabled={!draft} onClick={exportDraft}><Download className="h-4 w-4" />导出</button>
      <button type="button" className="rounded border px-2 py-1 text-sm disabled:opacity-40" disabled={!draft} onClick={() => { if (confirmDiscardDraft('放弃编辑')) clearDraft(); }}>放弃草稿</button>
      <button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" />导入</button>
    </div>
    <p className="mt-2 text-sm text-slate-500">先选择后读取，或新建/导入为独立草稿；核验通过后才能保存到当前配置包。保存或放弃草稿后，才能切回要素设计。</p>
    {report ? <section className={`mt-3 rounded border p-3 text-sm ${report.valid ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
      <strong>{report.valid ? '工作流核验通过' : `发现 ${report.issues.length} 项问题`}</strong>
      {report.issues.length ? <ul className="mt-2 list-disc pl-5 text-xs">{report.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}：{issue.message}</li>)}</ul> : null}
    </section> : null}
    {draft
      ? <div className="mt-4"><V3WorkflowEditor config={config} workflow={draft} records={records} onChange={(next) => { setDraft(next); setReport(null); }} /></div>
      : <div className="mt-4 rounded border border-dashed p-6 text-sm text-slate-500">选择一个工作流后点击“读取”，或点击“新建/导入”开始独立编辑。</div>}
  </section>;
}

export default WorkflowWorkbench;
