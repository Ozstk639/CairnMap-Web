import { getActiveConfigSnapshot, persistActiveConfig, restoreApplicationDefault } from './defaultConfigProvider';
import { prepareConfigForActivation } from './configActivation';
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react';
import { Download, FileUp, FlaskConical, Pencil, Save, X } from 'lucide-react';
import MapContainer from '@/components/Map/MapContainer';
import { buildConfigPackageArchive, downloadConfigPackage, readConfigPackage } from './package';
import { validateConfigPackage } from './runtime';
import { listConfigLabPackages } from './configLabStorage';
import type { ConfigPackageV3 } from './types';

class LabErrorBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onError(error); }
  render() { return this.state.error ? <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/60 p-4"><div className="max-w-lg rounded-xl bg-white p-5"><h2 className="font-semibold text-rose-700">配置运行实验室错误</h2><p className="mt-2 text-sm">{this.state.error.message}</p><button type="button" className="mt-4 rounded bg-slate-800 px-3 py-2 text-white" onClick={() => window.location.reload()}>重新加载</button></div></div> : this.props.children; }
}

function switchMode(mode: 'v1' | 'v3') {
  const target = new URL(window.location.href);
  target.searchParams.set('workspace', 'config-lab');
  target.searchParams.set('configMode', mode);
  // Hard navigation intentionally destroys shared map/editor state between modes.
  window.location.assign(target.toString());
}

export function ConfigLab({ onClose }: { onClose: () => void }) {
  const mode = new URLSearchParams(window.location.search).get('configMode') === 'v1' ? 'v1' : 'v3';
  const [config, setConfig] = useState<ConfigPackageV3>(() => getActiveConfigSnapshot());
  const [versions, setVersions] = useState<ConfigPackageV3[]>([]);
  const [message, setMessage] = useState('正在加载本地 V3 配置…');
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshVersions = () => void listConfigLabPackages(diagnostic => setMessage(diagnostic)).then(setVersions).catch(error => { setVersions([]); setMessage(error instanceof Error ? error.message : '无法读取历史配置。'); });
  useEffect(() => {
    if (mode === 'v1') { setMessage('V1 正式运行时：使用当前主页面相同的数据加载、渲染、图层与测绘工具。'); return; }
    refreshVersions();
    setMessage(`已加载活动 V3 配置 ${config.packageId} r${config.revision}（契约 r${config.contractRevision}），刷新保持当前选择。`);
  }, [mode]);
  const saveLocal = async () => { try { setConfig(await persistActiveConfig(config)); refreshVersions(); setMessage(`已保存本地 V3 版本 ${config.packageId} r${config.revision}。`); } catch (error) { setMessage(error instanceof Error ? error.message : '保存本地配置失败。'); } };
  const importFile = async (file?: File) => { if (!file) return; try { const next = prepareConfigForActivation(await readConfigPackage(file)); setConfig(await persistActiveConfig(next)); refreshVersions(); setMessage(`已导入并暂存 ${next.packageId} r${next.revision}。`); } catch (error) { setMessage(error instanceof Error ? error.message : '上传配置失败。'); } };
  const exportFile = async () => { const report = validateConfigPackage(config); if (!report.valid) { setMessage(`无法下载：存在 ${report.issues.filter((item) => item.severity === 'error').length} 个阻断问题。请在工作台修复。`); return; } const blob = await buildConfigPackageArchive(config, report); downloadConfigPackage(blob, config); setMessage('已下载当前本地 V3 包。'); };
  const openEditor = () => { try { sessionStorage.setItem('cairnmap-config-studio-draft', JSON.stringify(config)); sessionStorage.setItem('cairnmap-config-studio-return', new URL(window.location.href).toString()); } catch { /* editor can still begin from baseline */ } const target = new URL(window.location.href); target.searchParams.set('workspace', 'config-studio'); window.location.assign(target.toString()); };
  return <div className="app-root h-screen w-screen"><LabErrorBoundary onError={(error) => setMessage(`运行错误：${error.message}`)}><MapContainer configRuntime={mode === 'v3' ? config : undefined} configLab /></LabErrorBoundary><header className="fixed left-1/2 top-3 z-[2700] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur"><span className="inline-flex items-center gap-1 px-2 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-violet-600" />配置运行实验室</span><button type="button" className={`rounded px-2 py-1 text-sm ${mode === 'v1' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => switchMode('v1')}>V1 正式规则</button><button type="button" className={`rounded px-2 py-1 text-sm ${mode === 'v3' ? 'bg-violet-600 text-white' : 'bg-slate-100'}`} onClick={() => switchMode('v3')}>V3 本地配置</button>{mode === 'v3' ? <><button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={openEditor}><Pencil className="h-3.5 w-3.5" />编辑</button><button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={() => void saveLocal()}><Save className="h-3.5 w-3.5" />保存本地</button><button type="button" className="rounded border px-2 py-1 text-sm" onClick={()=>void restoreApplicationDefault().then(()=>location.reload()).catch(error=>setMessage(String(error)))}>恢复应用默认配置</button><button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={() => inputRef.current?.click()}><FileUp className="h-3.5 w-3.5" />上传版本</button><button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={() => void exportFile()}><Download className="h-3.5 w-3.5" />下载</button>{versions.length ? <label className="text-xs">本地版本<select className="ml-1 rounded border px-2 py-1" value={`${config.packageId}:${config.revision}`} onChange={(event) => { const next = versions.find((item) => `${item.packageId}:${item.revision}` === event.target.value); if (next) { void persistActiveConfig(next).then(active=>{setConfig(active);setMessage(`已切换活动版本 ${active.packageId} r${active.revision}。`);}).catch(error=>setMessage(String(error))); } }}><option value={`${config.packageId}:${config.revision}`}>{config.packageId} r{config.revision}（当前）</option>{versions.filter((item) => `${item.packageId}:${item.revision}` !== `${config.packageId}:${config.revision}`).map((item) => <option key={`${item.packageId}:${item.revision}`} value={`${item.packageId}:${item.revision}`}>{item.packageId} r{item.revision}</option>)}</select></label> : null}</> : null}<button type="button" className="rounded p-1.5 hover:bg-slate-100" aria-label="返回主地图" onClick={onClose}><X className="h-4 w-4" /></button><input ref={inputRef} className="hidden" type="file" accept=".zip,.json,application/json,application/zip" onChange={(event) => void importFile(event.target.files?.[0])} /><div className="basis-full px-2 text-center text-xs text-slate-600">{message}　切换 V1/V3 会硬刷新页面；本地版本和历史保存在 IndexedDB。实验室保留主图层、数据加载、渲染、图层管理与测绘，但不开放测绘包上传。</div></header></div>;
}

export default ConfigLab;
