import { useEffect, useState, type ReactNode } from 'react';
import { getConfigRecoveries, loadActiveConfig, restoreConfigRecovery, downloadConfigRecovery } from './defaultConfigProvider';
import type { ConfigRecovery } from './configLabStorage';

export function ConfigBootstrap({children}:{children:ReactNode}) {
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[recoveries,setRecoveries]=useState<ConfigRecovery[]>([]);
  useEffect(()=>{let live=true;void loadActiveConfig().then(()=>{if(live)setReady(true);return getConfigRecoveries();}).then(values=>{if(live)setRecoveries(values);}).catch(reason=>{if(live)setError(String(reason));});return()=>{live=false;};},[]);
  if(!ready)return <div className="flex h-screen items-center justify-center bg-slate-100"><div role="status" className="rounded border bg-white p-5">{error||'正在加载应用配置…'}{error?<button type="button" className="ml-3 rounded border px-3 py-1" onClick={()=>location.reload()}>重新加载</button>:null}</div></div>;
  return <>{children}{recoveries.length?<details className="fixed bottom-3 right-3 z-[4500] max-w-sm rounded border bg-white p-2 text-xs shadow"><summary>已保留旧配置恢复副本（{recoveries.length}）</summary>{recoveries.map(item=><div key={item.key} className="mt-2 flex flex-wrap items-center gap-2"><span>{item.source} · {item.packageId??'草稿'} r{item.revision??'?'}</span><button type="button" className="rounded border px-2 py-1" onClick={()=>void restoreConfigRecovery(item.key).then(()=>location.reload()).catch(reason=>setError(String(reason)))}>恢复为当前配置</button><button type="button" className="rounded border px-2 py-1" onClick={()=>void downloadConfigRecovery(item.key).catch(reason=>setError(String(reason)))}>下载原始副本</button></div>)}{error?<p role="alert" className="mt-2 text-rose-700">{error}</p>:null}</details>:null}</>;
}
