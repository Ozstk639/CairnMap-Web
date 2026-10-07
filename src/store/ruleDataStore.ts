import { create } from 'zustand';
import { useLoadingStore } from '@/store/loadingStore';
import { loadWorldRuleDataset } from '@/components/Rules/data/worldRuleDatasetLoader';
import { normalizeRuleSourceWorldId } from '@/components/Rules/data/ruleDataSources';
import { loadMapSettings } from '@/lib/cookies';
import type { RuleWorldDataset } from '@/components/Rules/data/sourceTypes';
import type { LoadingProgress } from '@/lib/fetchWithMirror';

interface RuleDataState {
  datasets: Record<string, RuleWorldDataset>;
  loadingWorld: string | null;
  pending: Record<string, Promise<RuleWorldDataset> | undefined>;
  ensureWorldLoaded: (worldId: string) => Promise<RuleWorldDataset>;
  refreshWorlds: (worldIds: string[]) => Promise<void>;
}

const WORLD_LOADING_STAGES = [
  { name: 'world-version', label: '正在检查世界版本' },
  { name: 'world-cache-check', label: '正在检查缓存' },
  { name: 'world-index-scan', label: '正在扫描数据目录' },
  { name: 'world-chunk-load', label: '正在读取区块数据' },
  { name: 'world-cache-write', label: '正在更新缓存' },
  { name: 'world-ready', label: '当前世界数据已就绪' },
  { name: 'world-record-build', label: '正在构建要素记录' },
  { name: 'world-filter-apply', label: '正在应用渲染筛选' },
  { name: 'world-layer-render', label: '正在生成地图图层' },
  { name: 'world-first-paint', label: '正在等待首帧显示' },
];

export const useRuleDataStore = create<RuleDataState>((set, get) => ({
  datasets: {},
  loadingWorld: null,
  pending: {},
  ensureWorldLoaded: async (worldId: string) => {
    const normalizedWorldId = normalizeRuleSourceWorldId(worldId);
    const pending = get().pending[normalizedWorldId];
    if (pending) return pending;

    const ruleFlowId = `rule-world:${normalizedWorldId}`;
    const { startLoading, updateStage, finishLoadingByFlow } = useLoadingStore.getState();
    startLoading(WORLD_LOADING_STAGES, { flowId: ruleFlowId, ruleWorldId: normalizedWorldId });
    const onProgress = (progress: LoadingProgress) => updateStage(progress.stage, progress.status, progress.message);

    const promise = loadWorldRuleDataset(normalizedWorldId, onProgress)
      .then((dataset) => {
        set((state) => ({
          datasets: { ...state.datasets, [normalizedWorldId]: dataset },
          loadingWorld: null,
          pending: { ...state.pending, [normalizedWorldId]: undefined },
        }));
        updateStage('world-ready', 'success', '等待地图首帧显示');
        return dataset;
      })
      .catch((err) => {
        updateStage('world-ready', 'error', String((err as Error)?.message ?? err));
        set((state) => ({ loadingWorld: null, pending: { ...state.pending, [normalizedWorldId]: undefined } }));
        setTimeout(() => finishLoadingByFlow(ruleFlowId), 300);
        throw err;
      });

    set((state) => ({ loadingWorld: normalizedWorldId, pending: { ...state.pending, [normalizedWorldId]: promise } }));
    return promise;
  },
  refreshWorlds: async (worldIds: string[]) => {
    const ids = Array.from(new Set((worldIds ?? []).map((id) => normalizeRuleSourceWorldId(String(id ?? '')).trim()).filter(Boolean)));
    if (ids.length === 0) return;

    const currentWorld = normalizeRuleSourceWorldId(String(loadMapSettings()?.currentWorld ?? ''));
    const activeWorldId = ids.includes(currentWorld) ? currentWorld : null;
    const orderedIds = activeWorldId ? [activeWorldId, ...ids.filter((id) => id !== activeWorldId)] : ids;

    const loading = useLoadingStore.getState();
    const activeFlowId = activeWorldId ? `rule-refresh:${activeWorldId}:${Date.now()}` : null;

    if (activeWorldId) {
      loading.startLoading(WORLD_LOADING_STAGES, {
        flowId: activeFlowId,
        ruleWorldId: activeWorldId,
      });
      loading.updateStage('world-version', 'loading');
      loading.updateStage('world-version', 'success', '正在刷新当前世界数据');
    }

    for (const worldId of orderedIds) {
      const onProgress =
        worldId === activeWorldId
          ? (progress: LoadingProgress) => {
              const state = useLoadingStore.getState();
              if (!state.isLoading || state.activeFlowId !== activeFlowId || state.activeRuleWorldId !== activeWorldId) return;
              state.updateStage(progress.stage, progress.status, progress.message);
            }
          : undefined;

      try {
        const dataset = await loadWorldRuleDataset(worldId, onProgress);
        set((state) => ({
          datasets: { ...state.datasets, [worldId]: dataset },
          pending: { ...state.pending, [worldId]: undefined },
          loadingWorld: state.loadingWorld === worldId ? null : state.loadingWorld,
        }));

        if (worldId === activeWorldId) {
          const state = useLoadingStore.getState();
          if (state.isLoading && state.activeFlowId === activeFlowId && state.activeRuleWorldId === activeWorldId) {
            state.updateStage('world-ready', 'success', '等待地图首帧显示');
          }
        }
      } catch (err) {
        if (worldId === activeWorldId) {
          const state = useLoadingStore.getState();
          if (state.isLoading && state.activeFlowId === activeFlowId && state.activeRuleWorldId === activeWorldId) {
            state.updateStage('world-ready', 'error', String((err as Error)?.message ?? err));
            setTimeout(() => {
              const latest = useLoadingStore.getState();
              if (latest.isLoading && latest.activeFlowId === activeFlowId && latest.activeRuleWorldId === activeWorldId) {
                latest.finishLoadingByFlow(activeFlowId);
              }
            }, 300);
          }
        }
        throw err;
      }
    }
  },
}));
