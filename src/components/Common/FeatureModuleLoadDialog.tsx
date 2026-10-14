import { useEffect } from 'react';
import { Download, Loader2, PackageOpen, XCircle } from 'lucide-react';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import { useFeatureModuleStore } from '@/store/featureModuleStore';

export default function FeatureModuleLoadDialog() {
  const dialog = useFeatureModuleStore((state) => state.dialog);
  const confirmDialogAndLoad = useFeatureModuleStore((state) => state.confirmDialogAndLoad);
  const dismissDialog = useFeatureModuleStore((state) => state.dismissDialog);

  useEffect(() => {
    if (!dialog.isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialog.loading) dismissDialog();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog.isOpen, dialog.loading, dismissDialog]);

  if (!dialog.isOpen || !dialog.moduleKey) return null;

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-[1px]">
      <div className="absolute inset-0" onClick={() => !dialog.loading && dismissDialog()} />
      <AppCard role="dialog" aria-modal="true" aria-labelledby="feature-module-dialog-title" className="relative max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-white/70 bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            {dialog.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageOpen className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="feature-module-dialog-title" className="text-lg font-semibold text-slate-900">{dialog.title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{dialog.description}</p>
          </div>
        </div>

        {dialog.error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{dialog.error}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <AppButton
            className="h-11 min-w-[92px] border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
            onClick={dismissDialog}
            disabled={dialog.loading}
          >
            取消
          </AppButton>
          <AppButton
            className="h-11 min-w-[132px] bg-blue-600 px-4 text-sm text-white hover:bg-blue-700"
            onClick={() => void confirmDialogAndLoad()}
            disabled={dialog.loading}
          >
            {dialog.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>{dialog.loading ? '加载中' : dialog.error ? '重新加载并重试' : '下载并启用'}</span>
          </AppButton>
        </div>
      </AppCard>
    </div>
  );
}
