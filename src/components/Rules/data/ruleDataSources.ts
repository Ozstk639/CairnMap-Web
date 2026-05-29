import { getOpenRIAMapDataSourcesConfig } from '../../../core/project/openriamapRiaEnvironment';
import { readRuleWorldCache } from '@/components/Rules/data/worldRuleCache';
import { loadWorldRuleDataset } from '@/components/Rules/data/worldRuleDatasetLoader';

/**
 * 规则驱动图层的数据源清单（按 worldId 管理）。
 *
 * 兼容目标：
 * - 旧链路：继续使用 baseUrl + files 从 public 目录读取 JSON
 * - 新链路：通过 sourceMode 标记该 world 的主显示来源（pub/dat）
 *
 * 说明：
 * - 当前 Navigation / 工作流搜索等旧模块仍依赖 baseUrl + files，因此这些字段继续保留。
 * - RuleDrivenLayer / 新 Rules 主显示链路会优先按 sourceMode 走新的 world 级数据集加载。
 */

export type WorldRuleDataSource = {
  /** 旧 public JSON 数据根目录（兼容旧模块） */
  baseUrl: string;
  /** 旧 public JSON 文件列表（兼容旧模块） */
  files: string[];
  /** 新链路主来源：pub=public，dat=Data 仓库 */
  sourceMode?: 'pub' | 'dat';
  /** 图片主来源：默认与 sourceMode 一致 */
  pictureSourceMode?: 'pub' | 'dat';
};

function buildRuleDataSources(): Record<string, WorldRuleDataSource> {
  const config = getOpenRIAMapDataSourcesConfig();
  const out: Record<string, WorldRuleDataSource> = {};
  for (const item of config.items) {
    const worldId = String(item.worldId ?? '').trim();
    if (!worldId) continue;
    out[worldId] = {
      baseUrl: item.baseUrl,
      files: Array.isArray(item.files) ? item.files : [],
      sourceMode: item.sourceMode,
      pictureSourceMode: item.pictureSourceMode,
    };
  }
  return out;
}

export const RULE_DATA_SOURCES: Record<string, WorldRuleDataSource> = buildRuleDataSources();


export function normalizeRuleSourceWorldId(worldId: string): string {
  const wid = String(worldId ?? '').trim();
  if (!wid) return 'zth';
  if ((RULE_DATA_SOURCES as any)[wid]) return wid;
  if (/^\d+$/.test(wid)) {
    const n = parseInt(wid, 10);
    if (n === 0) return 'zth';
    if (n === 1) return 'naraku';
    if (n === 2) return 'houtu';
    if (n === 3) return 'eden';
    if (n === 4) return 'laputa';
    if (n === 5) return 'yunduan';
  }
  const map: Record<string, string> = {
    零洲: 'zth',
    奈落: 'naraku',
    后土: 'houtu',
    伊甸: 'eden',
    拉普塔: 'laputa',
    云端: 'yunduan',
  };
  return map[wid] ?? wid;
}

async function fetchPublicJsonArray(url: string, fetcher?: (url: string) => Promise<any[]>): Promise<any[]> {
  if (fetcher) return fetcher(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * 统一获取某个 world 的规则要素集合。
 * - dat：优先读取 world 级缓存；若缓存缺失则触发 world 数据集加载
 * - pub：沿用旧 public JSON 文件清单读取
 */
export async function loadRuleItemsForWorld(worldId: string, opt?: { fetcher?: (url: string) => Promise<any[]> }): Promise<any[]> {
  const wid = normalizeRuleSourceWorldId(worldId);
  const ds = RULE_DATA_SOURCES[wid];
  if (!ds) return [];

  if ((ds.sourceMode ?? 'pub') === 'dat') {
    const cached = readRuleWorldCache(wid);
    if (cached?.features && Array.isArray(cached.features)) return cached.features as any[];
    try {
      const dataset = await loadWorldRuleDataset(wid);
      if (Array.isArray(dataset?.features)) return dataset.features as any[];
    } catch {
      // 若 Data 仓库链路失败，继续向下尝试旧 public 清单（若存在）
    }
  }

  const files = Array.isArray(ds.files) ? ds.files : [];
  if (!ds.baseUrl || files.length === 0) return [];
  const out: any[] = [];
  const results = await Promise.all(files.map(async (file) => {
    const url = `${ds.baseUrl.replace(/\/$/, '')}/${file}`;
    try {
      return await fetchPublicJsonArray(url, opt?.fetcher);
    } catch {
      return [];
    }
  }));
  for (const arr of results) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) out.push(item);
  }
  return out;
}
