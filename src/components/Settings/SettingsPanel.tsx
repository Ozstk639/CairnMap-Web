/**
 * 设置面板组件
 * 显示 Rules 世界版本、缓存状态、PWA 状态等信息
 */

import { useEffect, useState } from 'react';
import { X, RefreshCw, Trash2, Database, Smartphone, CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';

// PWA 安装事件类型
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
import { useDataStore } from '@/store/dataStore';
import { useLoadingStore } from '@/store/loadingStore';
import { useRuleDataStore } from '@/store/ruleDataStore';
import { downloadDataToolSchema } from '@/components/Common/exportDataToolSchema';
import { fetchWorldMergeVersion } from '@/components/Rules/data/worldRuleDatasetLoader';
import {
  calculateRuleCacheSize,
  clearAllRuleWorldCaches,
  getRuleWorldFeatureCount,
  readRuleWorldMeta,
} from '@/components/Rules/data/worldRuleCache';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import ReviewAuthSettingsSection from '@/components/Settings/ReviewAuthSettingsSection';
import type { ReviewAuthPort } from '@/components/Review/auth';
import {
  getCurrentSourceLinkModeId,
  getDefaultSourceLinkModeId,
  getSourceLinkModeDefs,
  setCurrentSourceLinkMode,
} from '@/components/Rules/data/sourceLinkModes';

interface SettingsPanelProps {
  onClose: () => void;
  /** Optional application-owned identity provider; generic settings remain unchanged when absent. */
  reviewAuth?: ReviewAuthPort;
  reviewAuthTitle?: string;
  reviewAuthLoginLabel?: string;
}

type RuleWorldRow = {
  worldId: string;
  name: string;
  remoteVersion: string;
  remoteOk: boolean;
  localVersion: string | null;
  cachedAt: number | null;
  featureCount: number | null;
  isLoaded: boolean;
};

const RULE_WORLDS: Array<{ id: string; name: string }> = [
  { id: 'zth', name: '零洲' },
  { id: 'eden', name: '伊甸' },
  { id: 'naraku', name: '奈落洲' },
  { id: 'houtu', name: '后土洲' },
  { id: 'laputa', name: '拉普塔' },
];

export function SettingsPanel({ onClose, reviewAuth, reviewAuthTitle, reviewAuthLoginLabel }: SettingsPanelProps) {
  const { cacheInfo, clearCache, forceRefresh, updateCacheInfo } = useDataStore();
  const { startLoading, updateStage, isLoading, activeFlowId, activeRuleWorldId } = useLoadingStore();
  const datasets = useRuleDataStore((s) => s.datasets);
  const refreshWorlds = useRuleDataStore((s) => s.refreshWorlds);

  const [isRefreshingRules, setIsRefreshingRules] = useState(false);
  const [isRefreshingLegacy, setIsRefreshingLegacy] = useState(false);
  const [isSyncingRules, setIsSyncingRules] = useState(false);
  const [ruleCacheSize, setRuleCacheSize] = useState(0);
  const [ruleWorldRows, setRuleWorldRows] = useState<RuleWorldRow[]>([]);
  const [pwaStatus, setPwaStatus] = useState<{
    isInstalled: boolean;
    canInstall: boolean;
    swActive: boolean;
  }>({
    isInstalled: false,
    canInstall: false,
    swActive: false,
  });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const sourceLinkModeDefs = getSourceLinkModeDefs();
  const [sourceLinkModeDraft, setSourceLinkModeDraft] = useState(() => getCurrentSourceLinkModeId());
  const [sourceLinkModeApplied, setSourceLinkModeApplied] = useState(() => getCurrentSourceLinkModeId());
  const [sourceLinkModeStatus, setSourceLinkModeStatus] = useState<string>('');

  const anyRefreshBusy = isRefreshingRules || isRefreshingLegacy || isSyncingRules;
  const rulesRefreshBlocked = anyRefreshBusy || (isLoading && !!activeRuleWorldId);
  const legacyRefreshBlocked = anyRefreshBusy || (isLoading && !!activeRuleWorldId) || (isLoading && activeFlowId === 'legacy-refresh');

  useEffect(() => {
    const current = getCurrentSourceLinkModeId();
    setSourceLinkModeDraft(current);
    setSourceLinkModeApplied(current);
  }, []);

  useEffect(() => {
    if (!sourceLinkModeStatus) return;
    const timer = window.setTimeout(() => setSourceLinkModeStatus(''), 1800);
    return () => window.clearTimeout(timer);
  }, [sourceLinkModeStatus]);

  const handleApplySourceLinkMode = () => {
    const next = setCurrentSourceLinkMode(sourceLinkModeDraft);
    const nextId = next.id;
    const changed = nextId !== sourceLinkModeApplied;
    setSourceLinkModeDraft(nextId);
    setSourceLinkModeApplied(nextId);
    setSourceLinkModeStatus(changed ? '已应用，后续新数据获取将使用该模式' : '当前已是该模式');
  };


  const buildRuleWorldRow = (worldId: string, remoteVersion: string, remoteOk: boolean): RuleWorldRow => {
    const meta = readRuleWorldMeta(worldId);
    const loadedDataset = datasets[worldId];
    const loadedFeatureCount = Array.isArray(loadedDataset?.features) ? loadedDataset.features.length : null;
    return {
      worldId,
      name: RULE_WORLDS.find((item) => item.id === worldId)?.name ?? worldId,
      remoteVersion,
      remoteOk,
      localVersion: meta ? String(meta.mergeVersion) : null,
      cachedAt: meta?.cachedAt ?? null,
      featureCount: loadedFeatureCount ?? getRuleWorldFeatureCount(worldId),
      isLoaded: !!loadedDataset,
    };
  };

  const syncRuleWorldRows = async () => {
    setIsSyncingRules(true);
    try {
      const rows = await Promise.all(
        RULE_WORLDS.map(async (world) => {
          try {
            const remoteVersion = await fetchWorldMergeVersion(world.id);
            return buildRuleWorldRow(world.id, String(remoteVersion), true);
          } catch {
            return buildRuleWorldRow(world.id, '读取失败', false);
          }
        })
      );
      setRuleWorldRows(rows);
      setRuleCacheSize(calculateRuleCacheSize());
    } finally {
      setIsSyncingRules(false);
    }
  };

  const syncRuleWorldRowsFromLocal = () => {
    setRuleWorldRows((prev) => prev.map((row) => buildRuleWorldRow(row.worldId, row.remoteVersion, row.remoteOk)));
    setRuleCacheSize(calculateRuleCacheSize());
  };

  // 检查 PWA 状态
  useEffect(() => {
    // 检查是否已安装（standalone 模式）
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    // 检查 Service Worker 状态
    const checkSW = async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        setPwaStatus(prev => ({
          ...prev,
          swActive: !!registration?.active,
        }));
      }
    };
    checkSW();

    setPwaStatus(prev => ({
      ...prev,
      isInstalled,
    }));

    // 监听 beforeinstallprompt 事件
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPwaStatus(prev => ({
        ...prev,
        canInstall: true,
      }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 监听安装完成
    window.addEventListener('appinstalled', () => {
      setPwaStatus(prev => ({
        ...prev,
        isInstalled: true,
        canInstall: false,
      }));
      setDeferredPrompt(null);
    });

    // 更新缓存信息
    updateCacheInfo();
    syncRuleWorldRows();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [updateCacheInfo]);

  useEffect(() => {
    if (ruleWorldRows.length === 0) return;
    syncRuleWorldRowsFromLocal();
  }, [datasets]);

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 格式化时间
  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return '从未';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 计算下次更新时间
  const getNextUpdateText = (): string => {
    if (!cacheInfo.nextUpdate) return '需要更新';
    const now = Date.now();
    const diff = cacheInfo.nextUpdate - now;
    if (diff <= 0) return '已过期';
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return `${days} 天后`;
    return `${hours} 小时后`;
  };

  const getRuleRowStatus = (row: RuleWorldRow): { text: string; className: string; icon: 'ok' | 'warn' | 'none' } => {
    if (!row.remoteOk) return { text: '远端读取失败', className: 'text-orange-600', icon: 'warn' };
    if (!row.localVersion) return { text: row.isLoaded ? '仅内存已加载' : '未缓存', className: 'text-gray-600', icon: 'none' };
    if (String(row.localVersion) === String(row.remoteVersion)) return { text: '已缓存', className: 'text-green-600', icon: 'ok' };
    return { text: '缓存待刷新', className: 'text-orange-600', icon: 'warn' };
  };

  // 刷新当前主数据（Rules）
  const handleRefreshRules = async () => {
    if (rulesRefreshBlocked) return;
    setIsRefreshingRules(true);
    try {
      const cachedWorldIds = RULE_WORLDS
        .map((world) => world.id)
        .filter((worldId) => !!readRuleWorldMeta(worldId));
      const loadedWorldIds = Object.keys(datasets);
      const targetWorldIds = Array.from(new Set([...cachedWorldIds, ...loadedWorldIds]));

      if (targetWorldIds.length > 0) {
        await refreshWorlds(targetWorldIds);
        syncRuleWorldRowsFromLocal();
      }
      await syncRuleWorldRows();
    } finally {
      setIsRefreshingRules(false);
    }
  };

  // 清除当前主数据缓存（Rules）
  const handleClearRuleCache = async () => {
    if (!confirm('确定要清除当前世界数据缓存吗？已加载到内存的数据会在后续按需重新缓存。')) return;
    clearAllRuleWorldCaches();
    await syncRuleWorldRows();
  };

  // 刷新兼容旧数据源
  const handleRefreshLegacy = async () => {
    if (legacyRefreshBlocked) return;
    setIsRefreshingLegacy(true);

    const legacyFlowId = 'legacy-refresh';
    startLoading([
      { name: 'bureaus', label: '铁路局配置' },
      { name: 'zth-railway', label: '零洲铁路数据' },
      { name: 'zth-rmp', label: '零洲 RMP 数据' },
      { name: 'zth-landmark', label: '零洲地标数据' },
      { name: 'houtu-railway', label: '后土洲铁路数据' },
      { name: 'houtu-rmp', label: '后土洲 RMP 数据' },
      { name: 'houtu-landmark', label: '后土洲地标数据' },
      { name: 'naraku-railway', label: '奈落洲铁路数据' },
      { name: 'naraku-landmark', label: '奈落洲地标数据' },
      { name: 'eden-railway', label: '伊甸铁路数据' },
      { name: 'eden-landmark', label: '伊甸地标数据' },
      { name: 'laputa-railway', label: '拉普塔铁路数据' },
      { name: 'laputa-landmark', label: '拉普塔地标数据' },
    ], { flowId: legacyFlowId });

    try {
      await forceRefresh((stage, status) => {
        updateStage(stage, status);
      });

      setTimeout(() => {
        const latest = useLoadingStore.getState();
        if (latest.isLoading && latest.activeFlowId === legacyFlowId && !latest.activeRuleWorldId) {
          latest.finishLoading();
        }
        setIsRefreshingLegacy(false);
        updateCacheInfo();
      }, 500);
    } catch (e) {
      const latest = useLoadingStore.getState();
      if (latest.isLoading && latest.activeFlowId === legacyFlowId && !latest.activeRuleWorldId) {
        latest.finishLoading();
      }
      setIsRefreshingLegacy(false);
      throw e;
    }
  };

  // 清除兼容旧数据源缓存
  const handleClearLegacyCache = () => {
    if (confirm('确定要清除旧数据源缓存吗？下次使用对应旧模块时需要重新加载。')) {
      clearCache();
      updateCacheInfo();
    }
  };

  // 导出 Data Tool Schema
  const handleExportDataSchema = () => {
    downloadDataToolSchema();
  };

  // 安装 PWA
  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setPwaStatus(prev => ({
          ...prev,
          isInstalled: true,
          canInstall: false,
        }));
      }
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <AppCard className="w-80 max-h-[80vh] overflow-hidden flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <h2 className="font-bold text-gray-800">设置</h2>
        <AppButton
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <X className="w-5 h-5 text-gray-500" />
        </AppButton>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {reviewAuth ? (
          <ReviewAuthSettingsSection
            auth={reviewAuth}
            title={reviewAuthTitle}
            loginLabel={reviewAuthLoginLabel}
          />
        ) : null}
        {/* 世界数据版本 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Database className="w-4 h-4" />
            <span>世界数据版本</span>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-3 text-sm">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>缓存大小</span>
              <span>{formatSize(ruleCacheSize)}</span>
            </div>

            {isSyncingRules && ruleWorldRows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-4 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在读取世界版本…</span>
              </div>
            ) : (
              <div className="space-y-2">
                {ruleWorldRows.map((row) => {
                  const status = getRuleRowStatus(row);
                  return (
                    <div key={row.worldId} className="rounded-md border border-gray-200 bg-white px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">{row.name}</span>
                        <span className={`flex items-center gap-1 text-xs ${status.className}`}>
                          {status.icon === 'ok' ? <CheckCircle className="w-3.5 h-3.5" /> : null}
                          {status.icon === 'warn' ? <AlertCircle className="w-3.5 h-3.5" /> : null}
                          {status.text}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">远端版本</span>
                          <span className="text-gray-700">{row.remoteVersion}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">本地版本</span>
                          <span className="text-gray-700">{row.localVersion ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-2 col-span-2">
                          <span className="text-gray-500">缓存时间</span>
                          <span className="text-gray-700">{formatDate(row.cachedAt)}</span>
                        </div>
                        <div className="flex justify-between gap-2 col-span-2">
                          <span className="text-gray-500">Features</span>
                          <span className="text-gray-700">{row.featureCount ?? '—'}{row.isLoaded ? '（已加载）' : ''}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 space-y-2">
            <div className="text-xs font-semibold text-gray-700">源数据仓库链接模式</div>
            <div className="flex items-center gap-2">
              <select
                className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800"
                value={sourceLinkModeDraft}
                onChange={(e) => setSourceLinkModeDraft(e.target.value)}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
              >
                {sourceLinkModeDefs.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}{mode.id === getDefaultSourceLinkModeId() ? '（默认）' : ''}
                  </option>
                ))}
              </select>
              <AppButton
                onClick={handleApplySourceLinkMode}
                className="shrink-0 rounded bg-blue-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-600"
              >
                应用
              </AppButton>
            </div>
            <div className="text-[11px] leading-relaxed text-gray-500">
              当前已应用：{sourceLinkModeDefs.find((mode) => mode.id === sourceLinkModeApplied)?.label ?? sourceLinkModeApplied}。切换后不会清除已有缓存，后续新数据获取、刷新数据、换世界与图片路径会使用所选模式。
            </div>
            {sourceLinkModeStatus ? (
              <div className="text-[11px] text-green-600">{sourceLinkModeStatus}</div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <AppButton
              onClick={handleRefreshRules}
              disabled={rulesRefreshBlocked}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm rounded-lg transition-colors"
            >
              {isRefreshingRules ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>刷新数据</span>
            </AppButton>

            <AppButton
              onClick={handleClearRuleCache}
              disabled={rulesRefreshBlocked}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 text-sm rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>清除缓存</span>
            </AppButton>
          </div>
        </div>

        {/* 兼容旧数据源 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Database className="w-4 h-4" />
            <span>数据源缓存（兼容）</span>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">状态</span>
              <span className={`flex items-center gap-1 ${cacheInfo.isStale ? 'text-orange-600' : 'text-green-600'}`}>
                {cacheInfo.isStale ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    需要更新
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    已缓存
                  </>
                )}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">更新时间</span>
              <span className="text-gray-700">{formatDate(cacheInfo.lastUpdated)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">缓存大小</span>
              <span className="text-gray-700">{formatSize(cacheInfo.size)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">下次更新</span>
              <span className="text-gray-700">{getNextUpdateText()}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <AppButton
              onClick={handleRefreshLegacy}
              disabled={legacyRefreshBlocked}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm rounded-lg transition-colors"
            >
              {isRefreshingLegacy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>数据源刷新</span>
            </AppButton>

            <AppButton
              onClick={handleClearLegacyCache}
              disabled={legacyRefreshBlocked}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 text-sm rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>清除</span>
            </AppButton>
          </div>
        </div>

        {/* PWA 状态 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Smartphone className="w-4 h-4" />
            <span>PWA 状态</span>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">安装状态</span>
              <span className={`flex items-center gap-1 ${pwaStatus.isInstalled ? 'text-green-600' : 'text-gray-600'}`}>
                {pwaStatus.isInstalled ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    已安装
                  </>
                ) : (
                  '未安装'
                )}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Service Worker</span>
              <span className={`flex items-center gap-1 ${pwaStatus.swActive ? 'text-green-600' : 'text-gray-600'}`}>
                {pwaStatus.swActive ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    活跃
                  </>
                ) : (
                  '未激活'
                )}
              </span>
            </div>
          </div>

          {/* 安装按钮 - 仅在可安装且未安装时显示 */}
          {pwaStatus.canInstall && !pwaStatus.isInstalled && (
            <AppButton
              onClick={handleInstallPWA}
              disabled={isInstalling}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm rounded-lg transition-colors"
            >
              {isInstalling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>安装到桌面</span>
            </AppButton>
          )}
        </div>


        {/* Data Tool Schema */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Download className="w-4 h-4" />
            <span>Data Tool Schema</span>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm text-gray-600">
            <p>导出当前 Web 注册体系对应的 data_tool_schema.json。</p>
            <p>可提供给 OpenRIAMap-Data 的 Tool 进行 sync-web-schema 使用。</p>
          </div>

          <AppButton
            onClick={handleExportDataSchema}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>导出 Data Schema</span>
          </AppButton>
        </div>

        {/* 关于 */}
        <div className="text-xs text-gray-400 text-center pt-2">
          <p>当前默认主数据源为 Rules 仓库数据</p>
          <p>兼容旧数据源入口仍可手动刷新</p>
        </div>
      </div>
    </AppCard>
  );
}

export default SettingsPanel;
