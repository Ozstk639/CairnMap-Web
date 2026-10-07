import type { ConfigPackageV3 } from './types';

// V32 deliberately uses a separate store so a partial V3.1 adapter package
// can never silently become the active native renderer configuration.
const DB_NAME = 'cairnmap-config-lab-v32';
const STORE = 'packages';
const LATEST = 'latest';
const HISTORY_PREFIX = 'revision:';

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
      resolve(value?.contractRevision === 5 ? value : undefined);
    };
  }).finally(() => database.close());
}

/** Lists locally saved versions without mutating the currently loaded lab package. */
export async function listConfigLabPackages(): Promise<ConfigPackageV3[]> {
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
        if (value?.schemaVersion === 'cairnmap.config-package.v3' && value.contractRevision === 5) values.push(value);
      }
      cursor.continue();
    };
  }).finally(() => database.close());
}

export async function saveConfigLabPackage(config: ConfigPackageV3): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    store.put(config, packageKey(config));
    store.put(config, LATEST);
    transaction.onerror = () => reject(transaction.error ?? new Error('无法保存本地配置。'));
    transaction.oncomplete = () => resolve();
  }).finally(() => database.close());
}
