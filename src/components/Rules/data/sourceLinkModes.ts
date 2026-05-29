import { getOpenRIAMapSourceLinkModesConfig } from '../../../core/project/openriamapRiaEnvironment';

/**
 * Rules 数据源链接模式注册表。
 *
 * 约定：rawCompatibleBaseUrl 必须提供 GitHub Raw 兼容路径前缀：
 *   {base}/{owner}/{repo}/{branch}/{path}
 * 例如：
 *   https://data.ozk639.top/OpenRIAMap/OpenRIAMap-Data/main/Data_Merge/...
 */
export type SourceLinkModeDef = {
  id: string;
  label: string;
  rawCompatibleBaseUrl: string;
  isDefault?: boolean;
};

const sourceLinkModesConfig = getOpenRIAMapSourceLinkModesConfig();

export const SOURCE_LINK_MODE_STORAGE_KEY = sourceLinkModesConfig.storageKey;

export const SOURCE_LINK_MODE_LEGACY_STORAGE_KEYS = sourceLinkModesConfig.legacyStorageKeys ?? [];

export const RAW_GITHUB_BASE_URL = 'https://raw.githubusercontent.com';

export const SOURCE_LINK_MODE_DEFS: SourceLinkModeDef[] = sourceLinkModesConfig.items.map((item) => ({
  id: item.id,
  label: item.label,
  rawCompatibleBaseUrl: item.rawCompatibleBaseUrl,
  isDefault: item.default,
}));

function trimSlash(value: string): string {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function getDefaultSourceLinkMode(): SourceLinkModeDef {
  return SOURCE_LINK_MODE_DEFS.find((item) => item.isDefault) ?? SOURCE_LINK_MODE_DEFS[0];
}

function readStoredSourceLinkModeId(): string {
  try {
    const current = localStorage.getItem(SOURCE_LINK_MODE_STORAGE_KEY) ?? '';
    if (current) return current;
    for (const key of SOURCE_LINK_MODE_LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key) ?? '';
      if (legacy) return legacy;
    }
  } catch {
    return '';
  }
  return '';
}

function writeStoredSourceLinkModeId(modeId: string): void {
  try {
    localStorage.setItem(SOURCE_LINK_MODE_STORAGE_KEY, modeId);
  } catch {}
}

export function getSourceLinkModeDefs(): SourceLinkModeDef[] {
  return SOURCE_LINK_MODE_DEFS;
}

export function getDefaultSourceLinkModeId(): string {
  return getDefaultSourceLinkMode().id;
}

export function findSourceLinkMode(modeId: string | null | undefined): SourceLinkModeDef | null {
  const id = String(modeId ?? '').trim();
  if (!id) return null;
  return SOURCE_LINK_MODE_DEFS.find((item) => item.id === id) ?? null;
}

export function getCurrentSourceLinkMode(): SourceLinkModeDef {
  const stored = readStoredSourceLinkModeId();
  const found = findSourceLinkMode(stored);
  if (found) {
    writeStoredSourceLinkModeId(found.id);
    return found;
  }

  const fallback = getDefaultSourceLinkMode();
  writeStoredSourceLinkModeId(fallback.id);
  return fallback;
}

export function getCurrentSourceLinkModeId(): string {
  return getCurrentSourceLinkMode().id;
}

export function setCurrentSourceLinkMode(modeId: string): SourceLinkModeDef {
  const found = findSourceLinkMode(modeId) ?? getDefaultSourceLinkMode();
  writeStoredSourceLinkModeId(found.id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ria:source-link-mode-change', { detail: { modeId: found.id } }));
  }
  return found;
}

export function buildRawCompatibleUrlFromParts(
  baseUrl: string,
  parts: { owner: string; repo: string; branch: string; path: string },
): string {
  return `${trimSlash(baseUrl)}/${parts.owner}/${parts.repo}/${parts.branch}/${String(parts.path ?? '').replace(/^\/+/, '')}`;
}

export function buildCurrentRawCompatibleUrl(parts: { owner: string; repo: string; branch: string; path: string }): string {
  return buildRawCompatibleUrlFromParts(getCurrentSourceLinkMode().rawCompatibleBaseUrl, parts);
}

export function resolveOpenRIAMapDataRootUrl(): string {
  return buildCurrentRawCompatibleUrl({
    owner: 'OpenRIAMap',
    repo: 'OpenRIAMap-Data',
    branch: 'main',
    path: '',
  }).replace(/\/+$/, '');
}

export function resolveOpenRIAMapDataMergeBaseUrl(): string {
  return `${resolveOpenRIAMapDataRootUrl()}/Data_Merge`;
}

export function resolveOpenRIAMapPictureBaseUrl(): string {
  return `${resolveOpenRIAMapDataRootUrl()}/Picture`;
}

export type RawCompatibleUrlParts = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
};

export function parseRawCompatibleUrl(url: string): RawCompatibleUrlParts | null {
  const source = String(url ?? '').trim();
  if (!source) return null;

  const candidates = [
    ...SOURCE_LINK_MODE_DEFS.map((item) => item.rawCompatibleBaseUrl),
    RAW_GITHUB_BASE_URL,
  ].map(trimSlash);

  for (const base of candidates) {
    const prefix = `${base}/`;
    if (!source.startsWith(prefix)) continue;
    const rest = source.slice(prefix.length);
    const parts = rest.split('/');
    if (parts.length < 4) return null;
    const [owner, repo, branch, ...pathParts] = parts;
    const path = pathParts.join('/');
    if (!owner || !repo || !branch || !path) return null;
    return { owner, repo, branch, path };
  }

  return null;
}
