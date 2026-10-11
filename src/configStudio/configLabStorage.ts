import { isNativeConfigRevision } from './contract';
import type { ConfigPackageV3 } from './types';
import { prepareConfigForActivation } from './configActivation';

// V32 deliberately uses a separate store so a partial V3.1 adapter package
// can never silently become the active native renderer configuration.
const DB_NAME = 'cairnmap-config-lab-v32';
const STORE = 'packages';
const LATEST = 'latest';
const HISTORY_PREFIX = 'revision:';
const RECOVERY_PREFIX = 'recovery:';
export type ConfigRecovery = { key: string; source: string; raw: string; createdAt: string; packageId?: string; revision?: number };
export type ActiveConfigChoice = {kind:'default'|'custom';fingerprint?:string};

function packageKey(config: ConfigPackageV3): string {
  return `${HISTORY_PREFIX}${config.packageId}:${config.revision}`;
}

function db(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error ?? new Error('无法打开本地配置仓库。'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadLatestConfigLabPackage(): Promise<ConfigPackageV3 | undefined> {
  const database = await db();
  return new Promise<ConfigPackageV3 | undefined>((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(LATEST);
    request.onerror = () => reject(request.error ?? new Error('无法读取本地配置。'));
    request.onsuccess = () => {
      const value = request.result as ConfigPackageV3 | undefined;
      try { resolve(value ? prepareConfigForActivation(value) : undefined); }
      catch (error) { reject(error); }
    };
  }).finally(() => database.close());
}

/** Lists locally saved versions without mutating the currently loaded lab package. */
export async function listConfigLabPackages(onRejected?: (diagnostic: string) => void): Promise<ConfigPackageV3[]> {
  const database = await db();
  return new Promise<ConfigPackageV3[]>((resolve, reject) => {
    const values: ConfigPackageV3[] = [];
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    request.onerror = () => reject(request.error ?? new Error('无法列出本地配置版本。'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(values.sort((left, right) => right.revision - left.revision || left.packageId.localeCompare(right.packageId)));
        return;
      }
      if (String(cursor.key).startsWith(HISTORY_PREFIX)) {
        const value = cursor.value as ConfigPackageV3;
        if (value?.schemaVersion === 'cairnmap.config-package.v3' && isNativeConfigRevision(value.contractRevision)) {
          try { values.push(prepareConfigForActivation(value)); } catch (error) { onRejected?.(`${String(cursor.key)}：${error instanceof Error ? error.message : '无效历史包'}（已保留原始记录）`); }
        } else onRejected?.(`${String(cursor.key)}：未知配置契约，不能启用（已保留原始记录）`);
      }
      cursor.continue();
    };
  }).finally(() => database.close());
}

export async function saveConfigLabPackage(config: ConfigPackageV3, selection?:ActiveConfigChoice): Promise<void> {
  config = prepareConfigForActivation(config);
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const existing = store.get(packageKey(config));
    existing.onsuccess = () => {
      if (existing.result) {
        try {
          const previous = prepareConfigForActivation(existing.result);
          const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
          if (stable(previous) !== stable(config)) { transaction.abort(); reject(new Error('此包 ID/revision 已保存不同内容。请在工作台增加 revision 后保存，历史版本不会被覆盖。')); return; }
        } catch (error) { transaction.abort(); reject(error); return; }
      }
      store.put(config, packageKey(config)); store.put(config, LATEST);
      if(selection)store.put(selection,'active-choice');
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('无法保存本地配置。'));
    transaction.oncomplete = () => resolve();
  }).finally(() => database.close());
}

export async function readActiveConfigChoice():Promise<ActiveConfigChoice|undefined> {
  const database=await db();return new Promise<ActiveConfigChoice|undefined>((resolve,reject)=>{const request=database.transaction(STORE,'readonly').objectStore(STORE).get('active-choice');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).finally(()=>database.close());
}
export async function saveActiveConfigChoice(choice:ActiveConfigChoice):Promise<void> {
  const database=await db();return new Promise<void>((resolve,reject)=>{const transaction=database.transaction(STORE,'readwrite');transaction.objectStore(STORE).put(choice,'active-choice');transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);}).finally(()=>database.close());
}

export async function readRawConfigLatest(): Promise<string | undefined> {
  const database=await db();
  return new Promise<string|undefined>((resolve,reject)=>{const request=database.transaction(STORE,'readonly').objectStore(STORE).get(LATEST);request.onsuccess=()=>resolve(request.result===undefined?undefined:JSON.stringify(request.result));request.onerror=()=>reject(request.error);}).finally(()=>database.close());
}
/** Preserve exact old content without activating it or changing latest. */
export async function archiveConfigRecovery(source:string,raw:string):Promise<void> {
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  let parsed:Partial<ConfigPackageV3>={};try {parsed=JSON.parse(raw);}catch{/* malformed drafts also remain recoverable */}
  const key=RECOVERY_PREFIX+source+':'+digest,database=await db();
  return new Promise<void>((resolve,reject)=>{const transaction=database.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE),request=store.get(key);request.onsuccess=()=>{if(!request.result)store.put({key,source,raw,createdAt:new Date().toISOString(),packageId:parsed?.packageId,revision:parsed?.revision} satisfies ConfigRecovery,key);};transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);}).finally(()=>database.close());
}
export async function listConfigRecoveries():Promise<ConfigRecovery[]> {
  const database=await db();
  return new Promise<ConfigRecovery[]>((resolve,reject)=>{const values:ConfigRecovery[]=[];const request=database.transaction(STORE,'readonly').objectStore(STORE).openCursor();request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(values.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));return;}if(String(cursor.key).startsWith(RECOVERY_PREFIX))values.push({...cursor.value,raw:''});cursor.continue();};}).finally(()=>database.close());
}
export async function readConfigRecovery(key:string):Promise<ConfigRecovery|undefined> {
  if(!key.startsWith(RECOVERY_PREFIX))throw Error('不是配置恢复副本。');const database=await db();
  return new Promise<ConfigRecovery|undefined>((resolve,reject)=>{const request=database.transaction(STORE,'readonly').objectStore(STORE).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).finally(()=>database.close());
}
