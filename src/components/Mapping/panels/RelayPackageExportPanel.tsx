import { useEffect, useState } from 'react';
import AppCard from '@/components/ui/AppCard';
import BlockingFullscreenModal from '@/components/Common/BlockingFullscreenModal';
import AppButton from '@/components/ui/AppButton';
import { relayDraftShowsMeta, relayDraftStatusLabel, type RelayPackageDraft } from '@/components/Mapping/core/relayPackageDraft';
import { X } from 'lucide-react';

export default function RelayPackageExportPanel(props: {
  open: boolean;
  draft: RelayPackageDraft;
  featureCount: number;
  onClose: () => void;
  onExport: (operator: string, note: string) => Promise<{ blob: Blob; filename: string }>;
  /** Optional application binding. Core export UI never chooses a provider. */
  onUploadToReview?: (input: { blob: Blob; filename: string; operator: string; note: string }) => Promise<{ submissionId: string; revisionId: string }>;
}) {
  const { open, draft, featureCount, onClose, onExport, onUploadToReview } = props;
  const [operator, setOperator] = useState(draft.meta.operator ?? '');
  const [note, setNote] = useState(draft.meta.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparedPackage, setPreparedPackage] = useState<{ blob: Blob; filename: string } | null>(null);
  const [uploadResult, setUploadResult] = useState<{ submissionId: string; revisionId: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setOperator(draft.meta.operator ?? '');
    setNote(draft.meta.note ?? '');
    setBusy(false);
    setError(null);
    setPreparedPackage(null);
    setUploadResult(null);
  }, [open]);

  const pictureCount = Object.values(draft.picturesById).reduce((sum, list) => sum + list.filter((x) => !x.deleted).length, 0);
  const showDraftMeta = relayDraftShowsMeta(draft.meta.draftStatus);
  const readyMessage = preparedPackage ? `标准包已生成：${preparedPackage.filename}` : '';

  if (!open) return null;

  const triggerDownload = () => {
    if (!preparedPackage) return;
    const url = URL.createObjectURL(preparedPackage.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = preparedPackage.filename;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
    onClose();
  };

  return (
    <BlockingFullscreenModal open={open}>
      <AppCard className="w-[520px] max-w-[92vw] overflow-hidden border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-800">导出标准包</h3>
          <AppButton onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" type="button">
            <X className="w-4 h-4" />
          </AppButton>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1">用户</label>
            <input value={operator} onChange={(e) => { setOperator(e.target.value); setPreparedPackage(null); setError(null); }} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">备注</label>
            <textarea value={note} onChange={(e) => { setNote(e.target.value); setPreparedPackage(null); setError(null); }} className="w-full border rounded px-3 py-2 text-sm" rows={4} />
          </div>

          <div className="rounded border bg-gray-50 p-3 text-sm space-y-1">
            <div><span className="font-bold">来源：</span>{relayDraftStatusLabel(draft.meta.draftStatus)}</div>
            {showDraftMeta ? <div><span className="font-bold">Operator：</span>{draft.meta.operator || '-'}</div> : null}
            {showDraftMeta ? <div><span className="font-bold">Note：</span>{draft.meta.note || '-'}</div> : null}
            {showDraftMeta ? <div><span className="font-bold">包版本：</span>{draft.meta.packageVersion ?? '-'}</div> : null}
            <div><span className="font-bold">要素数量：</span>{featureCount}</div>
            <div><span className="font-bold">图片数量：</span>{pictureCount}</div>
            <div><span className="font-bold">删除标记数量：</span>{draft.deleteMarks.length}</div>
            <div><span className="font-bold">Schema版本：</span>{draft.meta.schemaVersion}</div>
            <div><span className="font-bold">更新时间：</span>{draft.meta.updatedAt}</div>
          </div>

          {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          {preparedPackage ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{readyMessage}</div> : null}
          {uploadResult ? <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">已提交至审核序列：{uploadResult.submissionId}（版本 {uploadResult.revisionId}）</div> : null}

          <div className="flex gap-2">
            <AppButton className="flex-1 bg-gray-200 text-gray-800 px-3 py-2 rounded-lg" onClick={onClose} type="button" disabled={busy}>取消</AppButton>
            {preparedPackage ? (
              <>
                <AppButton
                  className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg"
                  onClick={() => {
                    setPreparedPackage(null);
                    setError(null);
                  }}
                  type="button"
                  disabled={busy}
                >
                  重新生成
                </AppButton>
                <AppButton
                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg disabled:opacity-60"
                  onClick={triggerDownload}
                  type="button"
                  disabled={busy}
                >
                  点击下载标准包
                </AppButton>
                {onUploadToReview ? <AppButton
                  className="flex-1 bg-emerald-600 text-white px-3 py-2 rounded-lg disabled:opacity-60"
                  onClick={async () => {
                    if (!preparedPackage || !onUploadToReview) return;
                    setBusy(true);
                    setError(null);
                    try {
                      const result = await onUploadToReview({ ...preparedPackage, operator, note });
                      setUploadResult(result);
                    } catch (e) {
                      setError(String((e as Error)?.message ?? e ?? '上传到审核序列失败'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  type="button"
                  disabled={busy || Boolean(uploadResult)}
                >
                  {busy ? '正在上传到审核序列…' : uploadResult ? '已上传到审核序列' : '上传到审核序列'}
                </AppButton> : null}
              </>
            ) : (
              <AppButton
                className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg disabled:opacity-60"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const built = await onExport(operator, note);
                    setPreparedPackage(built);
                  } catch (e) {
                    setError(String((e as Error)?.message ?? e ?? '标准包生成失败'));
                  } finally {
                    setBusy(false);
                  }
                }}
                type="button"
                disabled={busy || !operator.trim()}
              >
                {busy ? '正在生成标准包…' : '生成标准包'}
              </AppButton>
            )}
          </div>
        </div>
      </AppCard>
    </BlockingFullscreenModal>
  );
}
