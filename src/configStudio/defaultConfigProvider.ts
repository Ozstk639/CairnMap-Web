import manifest from './defaults/manifest.json';
import type { ConfigPackageV3 } from './types';
import type { StudioEditingSession } from './studioSession';
import { readStudioEditingSession } from './configLabStorage';
import { prepareConfigForActivation } from './configActivation';
import { highestConfigLabRevision, readRawConfigLatest, saveConfigLabPackage, archiveConfigRecovery, listConfigRecoveries, readConfigRecovery, readActiveConfigChoice, saveActiveConfigChoice, type ConfigRecovery } from './configLabStorage';

const CHOICE = 'cairnmap-config-active-choice-v1';
const SAVED = 'cairnmap-config-studio-saved';
const LEGACY_DRAFT = 'cairnmap-config-studio-draft';
type ProviderState={active?:ConfigPackageV3;editingSession?:StudioEditingSession;seedHash?:string;seedPromise?:Promise<ConfigPackageV3>;activePromise?:Promise<ConfigPackageV3>;writes:Promise<unknown>};
const slot=Symbol.for('cairnmap.config.active-provider');
const providers=globalThis as unknown as Record<symbol,ProviderState>;
const state=providers[slot]??={writes:Promise.resolve()};
if(state.seedHash!==manifest.sha256){state.seedPromise=undefined;state.activePromise=undefined;state.seedHash=manifest.sha256;}

export function stableConfigText(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(item=>stableConfigText(item)??'null').join(',')+']';
  if (value && typeof value==='object') {const record=value as Record<string,unknown>;return '{'+Object.keys(record).sort().filter(key=>record[key]!==undefined).map(key=>JSON.stringify(key)+':'+stableConfigText(record[key])).join(',')+'}';}
  return JSON.stringify(value);
}
async function hash(text: string): Promise<string> {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function fingerprint(config: ConfigPackageV3): Promise<string> {const {parity:_parity,...content}=config;return hash(stableConfigText(content));}
function choice(): {kind:'default'|'custom';fingerprint?:string} | undefined {try {return JSON.parse(localStorage.getItem(CHOICE)??'null')??undefined;}catch{return undefined;}}
function mirror(config: ConfigPackageV3) {try {const json=JSON.stringify(config);sessionStorage.setItem(SAVED,json);sessionStorage.setItem(LEGACY_DRAFT,json);}catch{/* Persistence is handled by IndexedDB, not the mirror. */}}
async function preserveSessionDrafts(candidate:ConfigPackageV3) {
  const selected=await fingerprint(candidate);
  for(const key of [SAVED,LEGACY_DRAFT]) {const raw=sessionStorage.getItem(key);if(!raw)continue;let matches=false;try{matches=await fingerprint(JSON.parse(raw))===selected;}catch{/* Preserve malformed content too. */}if(!matches)await archiveConfigRecovery(key,raw);}
}

export function loadDefaultConfig(): Promise<ConfigPackageV3> {
  return state.seedPromise??=fetch(new URL('./defaults/r9-r5.config.json',import.meta.url).href).then(async response=>{
    if(!response.ok)throw Error('无法加载应用默认配置。');
    const text=await response.text();if(await hash(text)!==manifest.sha256)throw Error('应用默认配置摘要不一致，未启用。');
    return prepareConfigForActivation(JSON.parse(text));
  });
}
export function getActiveConfigSnapshot(): ConfigPackageV3 {if(!state.active)throw Error('活动配置尚未加载。');return state.active;}
export function getStudioSessionSnapshot():StudioEditingSession|undefined{return state.editingSession;}

export function loadActiveConfig(): Promise<ConfigPackageV3> {
  return state.activePromise??=(async()=>{
    const selected=await readActiveConfigChoice()??choice();
    state.editingSession=await readStudioEditingSession();
    let latest:ConfigPackageV3|undefined;
    const latestRaw=await readRawConfigLatest();
    try {if(latestRaw)latest=prepareConfigForActivation(JSON.parse(latestRaw));}catch{if(latestRaw)await archiveConfigRecovery('rejected-local-latest',latestRaw);}
    const latestFingerprint=latest?await fingerprint(latest):undefined;
    const untouchedPreviousDefault=latestFingerprint!==undefined&&manifest.legacyDefaultFingerprints.includes(latestFingerprint);
    if(selected?.kind==='custom'&&latest&&(!selected.fingerprint||latestFingerprint===selected.fingerprint)) {await preserveSessionDrafts(latest);state.active=latest;mirror(state.active);return state.active;}
    const seed=await loadDefaultConfig();
    if(selected?.kind!=='default') {
      if(latest&&latestFingerprint!==manifest.semanticFingerprint)await archiveConfigRecovery(untouchedPreviousDefault?'previous-default-seed':'previous-local-latest',JSON.stringify(latest));
    }
    await preserveSessionDrafts(seed);await saveActiveConfigChoice({kind:'default'});state.active=seed;try{localStorage.setItem(CHOICE,JSON.stringify({kind:'default'}));}catch{/* durable pointer is in IndexedDB */}mirror(state.active);return state.active;
  })();
}

/** User save/import/selection is one serial durable operation for Studio and Lab. */
export function persistActiveConfig(value: ConfigPackageV3, increment=false, expected?:{config:ConfigPackageV3;kind:'default'|'custom'}): Promise<ConfigPackageV3> {
  const task=state.writes.catch(()=>undefined).then(async()=>{
    let candidate=value;
    if(increment&&state.active?.packageId===value.packageId&&stableConfigText(state.active)!==stableConfigText(value))candidate={...value,revision:Math.max(value.revision,state.active.revision+1)};
    let config=prepareConfigForActivation(candidate);
    for(let attempt=0;;attempt++) {
      try {await saveConfigLabPackage(config,{kind:'custom',fingerprint:await fingerprint(config)},true,expected);break;}catch(error){const savingSeed=await fingerprint(value)===manifest.semanticFingerprint;if((!increment&&!savingSeed)||attempt>=3||!(error instanceof Error)||!error.message.includes('ID/revision'))throw error;config=prepareConfigForActivation({...config,revision:Math.max(config.revision+1,(await highestConfigLabRevision(config.packageId))+1)});}
    }
    try{localStorage.setItem(CHOICE,JSON.stringify({kind:'custom',fingerprint:await fingerprint(config)}));}catch{/* durable pointer is in IndexedDB */}state.active=config;state.editingSession=undefined;mirror(config);return config;
  });
  state.writes=task;return task;
}
export async function restoreApplicationDefault():Promise<void> {await state.writes.catch(()=>undefined);const seed=await loadDefaultConfig();if(state.active&&await fingerprint(state.active)!==await fingerprint(seed))await archiveConfigRecovery('before-restore-default',JSON.stringify(state.active));await saveActiveConfigChoice({kind:'default'});state.active=seed;try{localStorage.setItem(CHOICE,JSON.stringify({kind:'default'}));}catch{/* durable pointer is in IndexedDB */}mirror(seed);}
export async function restoreConfigRecovery(key:string):Promise<void> {const raw=await readConfigRecovery(key);if(!raw)throw Error('恢复副本不存在。');await persistActiveConfig(JSON.parse(raw.raw),true);}
export async function downloadConfigRecovery(key:string):Promise<void> {const entry=await readConfigRecovery(key);if(!entry)throw Error('恢复副本不存在。');const url=URL.createObjectURL(new Blob([entry.raw],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='cairnmap-recovery-'+entry.source+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const getConfigRecoveries=():Promise<ConfigRecovery[]>=>listConfigRecoveries();

export async function readDurableActiveConfig():Promise<{config:ConfigPackageV3;kind:'default'|'custom'}> {
  const selected=await readActiveConfigChoice();if(selected?.kind!=='custom')return {config:await loadDefaultConfig(),kind:'default'};
  const raw=await readRawConfigLatest();if(!raw)throw Error('当前活动配置记录不存在。');return {config:prepareConfigForActivation(JSON.parse(raw)),kind:'custom'};
}
