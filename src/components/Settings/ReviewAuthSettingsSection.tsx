import { useCallback, useEffect, useState } from 'react';
import AppButton from '@/components/ui/AppButton';
import type { ReviewAuthPort, ReviewAuthSessionState } from '@/components/Review/auth';

export type ReviewAuthSettingsSectionProps = {
  auth: ReviewAuthPort;
  title?: string;
  loginLabel?: string;
};

function highestRole(roles?: string[]) {
  const normalized = new Set((roles ?? []).map((role) => role.toLowerCase()));
  if (normalized.has('maintainer')) return '维护者';
  if (normalized.has('reviewer')) return '审核员';
  if (normalized.has('contributor')) return '贡献者';
  return null;
}

function presentation(session: ReviewAuthSessionState): { tone: string; text: string } {
  switch (session.status) {
    case 'authenticated': return { tone: 'text-green-600', text: `已登录：${session.principalId ?? '已验证用户'}${highestRole(session.roles) ? `（${highestRole(session.roles)}）` : ''}` };
    case 'expired': return { tone: 'text-orange-600', text: session.message || '登录会话已过期，请重新登录。' };
    case 'unavailable': return { tone: 'text-red-600', text: session.message || '审核身份服务暂不可用。' };
    case 'anonymous':
    default: return { tone: 'text-gray-500', text: session.message || '当前未登录审核身份。' };
  }
}

/**
 * Provider-neutral settings section.  The application supplies its own auth
 * port, labels and routes; no provider or OAuth details enter core UI code.
 */
export function ReviewAuthSettingsSection({ auth, title = '登录状态', loginLabel = '登录' }: ReviewAuthSettingsSectionProps) {
  const [session, setSession] = useState<ReviewAuthSessionState>({ status: 'anonymous' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSession(await auth.getSession());
    } catch {
      setSession({ status: 'unavailable', message: '无法读取审核身份状态，请稍后重试。' });
    } finally {
      setLoading(false);
    }
  }, [auth]);
  useEffect(() => { void refresh(); }, [refresh]);
  const view = presentation(session);
  const isAuthenticated = session.status === 'authenticated';
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 space-y-2">
      <div className="text-xs font-semibold text-gray-700">{title}</div>
      <div className={`text-[11px] leading-relaxed ${view.tone}`}>{loading ? '正在读取登录状态…' : view.text}</div>
      {isAuthenticated && session.roles?.length ? <div className="text-[11px] text-gray-500">最高权限：{highestRole(session.roles) ?? session.roles.join('、')}</div> : null}
      <div className="flex gap-2">
        {isAuthenticated ? (
          <AppButton
            className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-800 transition-colors hover:bg-gray-300"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await auth.logout(); await refresh(); }
              catch { setSession({ status: 'unavailable', message: '退出登录失败，请稍后重试。' }); }
              finally { setBusy(false); }
            }}
          >
            退出登录
          </AppButton>
        ) : (
          <AppButton
            className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-600"
            disabled={busy || session.status === 'unavailable'}
            onClick={() => auth.beginLogin()}
          >
            {loginLabel}
          </AppButton>
        )}
        <AppButton
          className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
          disabled={busy || loading}
          onClick={() => void refresh()}
        >
          刷新状态
        </AppButton>
      </div>
    </div>
  );
}

export default ReviewAuthSettingsSection;
