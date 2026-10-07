import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createConfigPackageFromCurrentProject } from './legacyProjectAdapter';
import { migrateV4Package } from './package';
import { WorkflowWorkbench } from './WorkflowWorkbench';
import type { ConfigPackageV3 } from './types';

function readDraft(): ConfigPackageV3 {
  try {
    const raw = JSON.parse(sessionStorage.getItem('cairnmap-config-studio-draft') ?? 'null') as ConfigPackageV3 | null;
    if (raw?.schemaVersion === 'cairnmap.config-package.v3') return raw.contractRevision === 5 ? raw : raw.contractRevision === 4 ? migrateV4Package(raw) : createConfigPackageFromCurrentProject();
  } catch { /* Semantic V1 migration below is a safe native fallback. */ }
  return createConfigPackageFromCurrentProject();
}

/** A genuine workflow-only workspace.  It purposely shares the package draft
 * with ConfigStudio but does not mount category fields/cards/rendering, so a
 * workflow can be read, validated, imported, exported and saved on its own. */
export function WorkflowStudioPage({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<ConfigPackageV3>(readDraft);
  const records = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('cairnmap-config-studio-mounted-records') ?? '[]'); }
    catch { return []; }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem('cairnmap-config-studio-draft', JSON.stringify(config)); }
    catch { /* Browser storage is a convenience, not the source of truth. */ }
  }, [config]);
  return <main className="fixed inset-0 z-[3000] flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-800"><header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-white px-5 py-3"><div className="min-w-0 flex-1"><h1 className="font-bold">工作流设计 · V3.2 原生配置</h1><p className="text-xs text-slate-500">独立草稿页：读取/新建、核验、保存、导入与导出只作用于单个工作流；保存后写回当前浏览器配置草稿。</p></div><button type="button" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm" onClick={() => { try { sessionStorage.setItem('cairnmap-config-studio-draft', JSON.stringify(config)); } catch { /* ignored */ } onClose(); }}><Save className="h-4 w-4" />返回要素设计</button><button type="button" className="rounded p-2 hover:bg-slate-100" onClick={onClose} aria-label="关闭"><ArrowLeft className="h-5 w-5" /></button></header><div className="min-h-0 flex-1 overflow-hidden p-3"><WorkflowWorkbench config={config} onChange={setConfig} records={records} /></div></main>;
}

export default WorkflowStudioPage;
