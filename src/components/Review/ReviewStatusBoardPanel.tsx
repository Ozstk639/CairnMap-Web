import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Archive, CheckCircle2, ClipboardCheck, FileDown, FileText, RefreshCw, RotateCcw, Send, ShieldCheck, XCircle } from 'lucide-react';
import AppButton from '@/components/ui/AppButton';
import { DraggablePanel } from '@/components/DraggablePanel/DraggablePanel';
import type {
  ReviewAuthPort,
  ReviewAuthorizationContext,
  ReviewPackageRevision,
  ReviewReleaseControlPort,
  ReviewReleaseControlReport,
  ReviewStatusBoardAdapter,
  ReviewSubmissionAdapter,
  ReviewSubmissionSnapshot,
} from './index';
import {
  compareReviewStatusBoards,
  isReviewStatusBoardDirty,
  type ReviewStatusBoardEntry,
  type ReviewStatusBoardSnapshot,
  type ReviewStatusDecisionAction,
} from './statusBoard';

export type ReviewStatusDraftSignal = {
  submissionId: string;
  state: ReviewStatusBoardEntry['state'];
  reason?: string;
  decisionAction?: ReviewStatusDecisionAction;
};

export type ReviewStatusBoardPanelProps = {
  auth: ReviewAuthPort;
  submissionAdapter: ReviewSubmissionAdapter & ReviewStatusBoardAdapter;
  releaseControl: ReviewReleaseControlPort;
  onLoadRevision(input: { submission: ReviewSubmissionSnapshot; revision: ReviewPackageRevision }): Promise<void> | void;
  onClose: () => void;
  workspacePanel?: ReactNode;
  /**
   * An application may bridge its existing workspace buttons to this generic
   * status board without making a provider part of the workbench contract.
   */
  subscribeToStatusDraft?: (listener: (signal: ReviewStatusDraftSignal) => void) => () => void;
  /** Allows an exporter-owned transport to request an inbox refresh. */
  subscribeToSubmissionUpload?: (listener: (submissionId?: string) => void) => () => void;
};

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function stateLabel(state: string) {
  return ({ pending: '待审核', approved: '已通过', rejected: '已打回', archived: '已归档', queued: '已排队', running: '执行中', 'mirror-pending': '等待镜像', mirrored: '已镜像', failed: '失败' } as Record<string, string>)[state] ?? state;
}

function stateTone(state: string) {
  return ({ approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', archived: 'bg-gray-200 text-gray-700', pending: 'bg-amber-100 text-amber-800' } as Record<string, string>)[state] ?? 'bg-blue-100 text-blue-700';
}

function asBoardEntry(submission: ReviewSubmissionSnapshot, previous?: ReviewStatusBoardEntry): ReviewStatusBoardEntry {
  const state = ['pending', 'approved', 'rejected', 'archived'].includes(submission.state) ? submission.state as ReviewStatusBoardEntry['state'] : 'pending';
  return previous ?? {
    submissionId: submission.submissionId,
    state,
    decisionRevisionId: state === 'pending' ? submission.currentRevisionId : submission.displayRevisionId,
    ...(state === 'approved' ? { decisionAction: 'approve' as const } : state === 'rejected' ? { decisionAction: submission.lastEvent?.action === 'request-changes' ? 'request-changes' as const : 'reject' as const } : state === 'archived' ? { decisionAction: 'archive' as const } : {}),
    updatedAt: submission.lastEvent?.occurredAt ?? new Date().toISOString(),
    updatedBy: { principalId: submission.lastEvent?.actor?.principalId ?? 'system', roles: submission.lastEvent?.actor?.roles ?? [] },
    ...(submission.lastEvent?.reason ? { reason: submission.lastEvent.reason } : {}),
  };
}

function reportView(report: ReviewReleaseControlReport | null) {
  if (!report) return null;
  const findings = report.report?.findings ?? [];
  return <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
    <div className="font-semibold">预检报告：{report.decision ?? '未知'}</div>
    {findings.length
      ? <div className="mt-2 space-y-1">{findings.map((finding, index) => <div key={`${finding.message ?? 'finding'}-${index}`} className={finding.severity === 'blocker' ? 'text-red-700' : finding.severity === 'warning' ? 'text-amber-700' : 'text-gray-600'}>• {finding.message ?? '未提供说明'}</div>)}</div>
      : <div className="mt-1 text-gray-500">未返回逐项问题。</div>}
  </div>;
}

/**
 * Provider-neutral Review sequence, detail, status-board, and release-gate
 * workbench.  Storage, identity, network, and workspace injection remain
 * behind the ports supplied by the application.
 */
export function ReviewStatusBoardPanel({ auth, submissionAdapter, releaseControl, onLoadRevision, onClose, workspacePanel, subscribeToStatusDraft, subscribeToSubmissionUpload }: ReviewStatusBoardPanelProps) {
  const [actor, setActor] = useState<ReviewAuthorizationContext>({ principalId: 'anonymous', roles: [] });
  const [submissions, setSubmissions] = useState<ReviewSubmissionSnapshot[]>([]);
  const [board, setBoard] = useState<ReviewStatusBoardSnapshot | null>(null);
  const [draftEntries, setDraftEntries] = useState<ReviewStatusBoardEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailRevisionId, setDetailRevisionId] = useState<string | null>(null);
  const [releaseGate, setReleaseGate] = useState<ReviewReleaseControlReport['gate'] | null>(null);
  const [releaseFeed, setReleaseFeed] = useState<Awaited<ReturnType<NonNullable<ReviewSubmissionAdapter['getReleaseFeed']>>> | null>(null);
  const [report, setReport] = useState<ReviewReleaseControlReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const selectedSubmission = submissions.find((item) => item.submissionId === detailId) ?? null;
  const selectedRevision = selectedSubmission?.revisions.find((item) => item.revisionId === detailRevisionId)
    ?? selectedSubmission?.revisions.find((item) => item.revisionId === selectedSubmission.currentRevisionId) ?? null;
  const selectedEntries = useMemo(() => draftEntries.filter((entry) => selectedIds.has(entry.submissionId)), [draftEntries, selectedIds]);
  const boardDirty = board ? isReviewStatusBoardDirty({ baseBoardVersion: board.boardVersion, entries: draftEntries }, board) : false;
  const publishReady = report?.decision === 'ready' || report?.decision === 'warning-confirmation-required';

  const reload = useCallback(async () => {
    setBusy('refresh');
    setMessage(null);
    try {
      const session = await auth.getSession();
      if (session.status !== 'authenticated' || !session.principalId) throw new Error('请先在设置中的“登录状态”完成登录。');
      const currentActor = { principalId: session.principalId, roles: session.roles ?? [] };
      const [items, remoteBoard] = await Promise.all([
        submissionAdapter.listSubmissions?.(currentActor) ?? Promise.resolve([]),
        submissionAdapter.getStatusBoard(currentActor),
      ]);
      setActor(currentActor);
      setSubmissions(items);
      const previousById = new Map(remoteBoard.entries.map((entry) => [entry.submissionId, entry]));
      const hydratedEntries = items.map((item) => asBoardEntry(item, previousById.get(item.submissionId)));
      setBoard({ ...remoteBoard, entries: hydratedEntries });
      setDraftEntries(hydratedEntries);
      setSelectedIds((previous) => new Set([...previous].filter((item) => items.some((submission) => submission.submissionId === item))));
      setDetailId((previous) => previous && items.some((item) => item.submissionId === previous) ? previous : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [auth, submissionAdapter]);

  useEffect(() => { void reload(); }, [reload]);

  const refreshGate = useCallback(async () => {
    setBusy('gate');
    try {
      setReleaseGate(await releaseControl.getReleaseGate(actor));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [actor, releaseControl]);

  const refreshFeed = useCallback(async () => {
    setBusy('feed');
    try {
      setReleaseFeed(await submissionAdapter.getReleaseFeed?.(actor, 10) ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [actor, submissionAdapter]);

  const setDraftState = useCallback((submissionId: string, state: ReviewStatusBoardEntry['state'], reason?: string, decisionAction?: ReviewStatusDecisionAction) => {
    const submission = submissions.find((item) => item.submissionId === submissionId);
    if (!submission) return;
    const revisionId = detailId === submissionId && detailRevisionId ? detailRevisionId : submission.currentRevisionId;
    setDraftEntries((previous) => previous.map((entry) => entry.submissionId === submissionId ? {
      ...entry,
      state,
      decisionRevisionId: revisionId,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
      ...(decisionAction ? { decisionAction } : {}),
      ...(reason ? { reason } : {}),
    } : entry));
  }, [actor, detailId, detailRevisionId, submissions]);

  const saveStatus = useCallback(async () => {
    if (!board || !selectedEntries.length) return;
    if (!window.confirm(`将保存 ${selectedEntries.length} 个审核包的状态灯。保存前服务端会再次校验状态与版本，是否继续？`)) return;
    setBusy('status');
    try {
      let expectedBoardVersion = board.boardVersion;
      const remoteBoard = await submissionAdapter.getStatusBoard(actor);
      if (remoteBoard.boardVersion !== board.boardVersion) {
        const changed = compareReviewStatusBoards(draftEntries, remoteBoard.entries).filter((entry) => entry.kind !== 'unchanged');
        const revisionChanged = changed.filter((entry) => entry.kind === 'revision-changed');
        if (revisionChanged.length) {
          setMessage(`状态未保存：${revisionChanged.map((entry) => entry.submissionId).join('、')} 已在云端切换到其他版本。请刷新对应审核包、检查新版本后重新保存状态。`);
          return;
        }
        const summary = changed.length ? changed.map((entry) => `${entry.submissionId}:${entry.kind}`).join('；') : '云端状态板已更新';
        if (!window.confirm(`检测到其他审核员的状态灯变更（${summary}）。已确认的包版本没有变化；是否以当前本地选择覆盖这些状态灯？`)) {
          setMessage('状态保存已取消；本地草稿仍保留，必要时请刷新对应审核包。');
          return;
        }
        expectedBoardVersion = remoteBoard.boardVersion;
      }
      const result = await submissionAdapter.saveStatusBoard({
        requestId: id('status-save'), correlationId: id('status-correlation'), idempotencyKey: id('status-idempotency'),
        expectedBoardVersion, entries: selectedEntries, actor, occurredAt: new Date().toISOString(),
      });
      setBoard(result.board);
      setDraftEntries(result.board.entries.map((entry) => ({ ...entry })));
      setReport(null);
      setMessage('审核状态已保存；现在可进行发布前检查。');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [actor, board, draftEntries, reload, selectedEntries, submissionAdapter]);

  const runPackagePrecheck = useCallback(async () => {
    if (!selectedSubmission || !selectedRevision) return;
    setBusy('package-precheck');
    try {
      const result = await submissionAdapter.dispatchSubmission({
        requestId: id('precheck'), correlationId: id('precheck-correlation'), idempotencyKey: id('precheck-idempotency'),
        submissionId: selectedSubmission.submissionId, targetRevisionId: selectedRevision.revisionId,
        expectedStateVersion: selectedSubmission.stateVersion, action: 'precheck', occurredAt: new Date().toISOString(), actor,
      });
      setReport(result as unknown as ReviewReleaseControlReport);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [actor, reload, selectedRevision, selectedSubmission, submissionAdapter]);

  const loadIntoWorkspace = useCallback(async () => {
    if (!selectedSubmission || !selectedRevision) return;
    setBusy('download');
    try {
      await onLoadRevision({ submission: selectedSubmission, revision: selectedRevision });
      setMessage('审核包已下载并加载到审核工作区。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [onLoadRevision, selectedRevision, selectedSubmission]);

  const runReleasePrecheck = useCallback(async () => {
    if (!board || boardDirty || !selectedEntries.length) return;
    const approved = selectedEntries.find((entry) => entry.state === 'approved' && entry.decisionRevisionId);
    const initiator = approved ? submissions.find((item) => item.submissionId === approved.submissionId) : null;
    if (!approved || !initiator) {
      setMessage('所选包中至少需要一个已通过状态，才能进行发布前检查。');
      return;
    }
    setBusy('release-precheck');
    try {
      const gate = await releaseControl.getReleaseGate(actor);
      setReleaseGate(gate);
      if (['prechecking', 'awaiting-confirmation', 'queueing', 'running', 'mirroring'].includes(gate.state)) {
        setMessage('正有发布进行中。请刷新 Release Gate 并在其结束后重新检查。');
        return;
      }
      const remoteBoard = await submissionAdapter.getStatusBoard(actor);
      if (remoteBoard.boardVersion !== board.boardVersion) {
        const changed = compareReviewStatusBoards(draftEntries, remoteBoard.entries).filter((entry) => entry.kind !== 'unchanged');
        if (changed.some((entry) => entry.kind === 'revision-changed')) {
          setMessage('发布前检查已阻断：云端审核包版本已经变化。请刷新对应审核包、检查新版后保存状态。');
          return;
        }
        if (window.confirm('云端状态灯已有其他审核员的更新。要先以当前本地选择执行“保存状态”并完成版本核对吗？')) await saveStatus();
        else setMessage('发布前检查已取消；请先刷新或保存状态。');
        return;
      }
      const result = await releaseControl.runReleasePrecheck({
        selectedSubmissionIds: selectedEntries.map((entry) => entry.submissionId), expectedBoardVersion: board.boardVersion,
        request: {
          requestId: id('release-precheck'), correlationId: id('release-correlation'), idempotencyKey: id('release-idempotency'),
          submissionId: initiator.submissionId, targetRevisionId: approved.decisionRevisionId!, expectedStateVersion: initiator.stateVersion,
          action: 'publish', occurredAt: new Date().toISOString(), actor,
        },
      }, actor);
      setReport(result);
      setReleaseGate(result.gate ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [actor, board, boardDirty, draftEntries, releaseControl, saveStatus, selectedEntries, submissionAdapter, submissions]);

  const publish = useCallback(async () => {
    if (!report?.gate?.attemptId || report.gate.gateVersion === undefined || !report?.report?.reportSha256 || !publishReady) return;
    if (!window.confirm('确认发布？服务端会再次验证 Release Gate、当前数据版本和选择状态。')) return;
    const approved = selectedEntries.find((entry) => entry.state === 'approved' && entry.decisionRevisionId);
    const initiator = approved ? submissions.find((item) => item.submissionId === approved.submissionId) : null;
    if (!approved || !initiator) return;
    setBusy('publish');
    try {
      const result = await releaseControl.confirmRelease({
        attemptId: report.gate.attemptId, expectedGateVersion: report.gate.gateVersion, precheckReportSha256: report.report.reportSha256,
        request: {
          requestId: id('publish'), correlationId: id('publish-correlation'), idempotencyKey: id('publish-idempotency'),
          submissionId: initiator.submissionId, targetRevisionId: approved.decisionRevisionId!, expectedStateVersion: initiator.stateVersion,
          action: 'publish', occurredAt: new Date().toISOString(), actor,
        },
      }, actor);
      setReport(result);
      setReleaseGate(result.gate ?? null);
      setMessage(`发布已进入 ${result.decision ?? '队列'} 状态。`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [actor, publishReady, reload, releaseControl, report, selectedEntries, submissions]);

  const mutateLocal = useCallback((state: ReviewStatusBoardEntry['state'], reasonPrompt?: string, decisionAction?: ReviewStatusDecisionAction) => {
    for (const entry of selectedEntries) {
      const reason = reasonPrompt ? window.prompt(reasonPrompt, entry.reason ?? '') ?? undefined : undefined;
      if (reasonPrompt && !reason) continue;
      setDraftState(entry.submissionId, state, reason, decisionAction);
    }
  }, [selectedEntries, setDraftState]);

  useEffect(() => subscribeToStatusDraft?.((signal) => {
    setDraftState(signal.submissionId, signal.state, signal.reason, signal.decisionAction);
    setSelectedIds((previous) => new Set(previous).add(signal.submissionId));
    setDetailId(signal.submissionId);
  }), [setDraftState, subscribeToStatusDraft]);

  useEffect(() => subscribeToSubmissionUpload?.((submissionId) => {
    setMessage(submissionId ? `审核包已上传：${submissionId}。正在刷新审核列表。` : '审核包已上传。正在刷新审核列表。');
    void reload();
  }), [reload, subscribeToSubmissionUpload]);

  return <>
    <DraggablePanel id="review-queue-panel" defaultPosition={{ x: 18, y: 132 }} zIndex={1760} constrainExpandedToViewport>
      <div className="w-[430px] max-h-[76vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl" data-draggable-proxy-close="true">
        <div className="border-b border-gray-200 px-4 py-3 pr-24"><h3 className="text-base font-bold text-gray-900" data-draggable-title>审核序列</h3><div className="mt-0.5 text-xs text-gray-500">状态灯先本地编辑；仅“保存状态”会提交到审核服务。</div><button type="button" data-draggable-close className="sr-only" aria-label="关闭" onClick={onClose} /></div>
        <div className="max-h-[calc(76vh-56px)] space-y-3 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            <AppButton onClick={() => void refreshGate()} disabled={busy !== null} className="justify-center rounded-xl bg-gray-100 px-2 py-2 text-xs text-gray-700 hover:bg-gray-200"><ShieldCheck className="h-3.5 w-3.5" />刷新 Release Gate</AppButton>
            <AppButton onClick={() => void refreshFeed()} disabled={busy !== null} className="justify-center rounded-xl bg-gray-100 px-2 py-2 text-xs text-gray-700 hover:bg-gray-200"><FileText className="h-3.5 w-3.5" />刷新发布记录</AppButton>
            <AppButton onClick={() => void reload()} disabled={busy !== null} className="justify-center rounded-xl bg-blue-50 px-2 py-2 text-xs text-blue-700 hover:bg-blue-100"><RefreshCw className={`h-3.5 w-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} />刷新列表</AppButton>
            <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">Gate：{releaseGate?.state ?? '未读取'} · 已选 {selectedIds.size}</div>
          </div>
          {message ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{message}</div> : null}
          <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-gray-800">待审核包</span><span className="flex gap-2"><button type="button" className="text-blue-600 hover:underline" onClick={() => setSelectedIds(new Set(submissions.map((item) => item.submissionId)))}>全选</button><button type="button" className="text-gray-500 hover:underline" onClick={() => setSelectedIds(new Set())}>清空选择</button></span></div>
          <div className="space-y-2">{submissions.map((submission) => {
            const draft = draftEntries.find((entry) => entry.submissionId === submission.submissionId) ?? asBoardEntry(submission);
            const checked = selectedIds.has(submission.submissionId);
            return <div key={submission.submissionId} className={`rounded-2xl border p-3 ${detailId === submission.submissionId ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-white'}`}><div className="flex items-start gap-2"><input aria-label={`选择 ${submission.packageName}`} type="checkbox" checked={checked} onChange={() => setSelectedIds((previous) => { const next = new Set(previous); if (next.has(submission.submissionId)) next.delete(submission.submissionId); else next.add(submission.submissionId); return next; })} /><button type="button" onClick={() => { setDetailId(submission.submissionId); setDetailRevisionId(submission.currentRevisionId); }} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-semibold text-gray-900">{submission.packageName || submission.submissionId}</div><div className="mt-0.5 truncate text-[11px] text-gray-500">{submission.submissionId}</div></button><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${stateTone(draft.state)}`}>{stateLabel(draft.state)}</span></div><div className="mt-2 text-[11px] text-gray-500">决策版本：{draft.decisionRevisionId ?? '—'} · 共 {submission.revisions.length} 个版本</div></div>;
          })}{!submissions.length && !busy ? <div className="rounded-xl bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">当前没有可读取的审核包。</div> : null}</div>
          <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3"><AppButton disabled={!selectedEntries.length || busy !== null} onClick={() => void saveStatus()} className="justify-center rounded-xl bg-orange-600 px-2 py-2 text-xs text-white hover:bg-orange-700 disabled:bg-orange-300"><CheckCircle2 className="h-3.5 w-3.5" />保存状态</AppButton><AppButton disabled={!selectedEntries.length || boardDirty || busy !== null} onClick={() => void runReleasePrecheck()} className="justify-center rounded-xl bg-blue-600 px-2 py-2 text-xs text-white hover:bg-blue-700 disabled:bg-blue-300"><ClipboardCheck className="h-3.5 w-3.5" />发布前检查</AppButton><AppButton disabled={!publishReady || busy !== null} onClick={() => void publish()} className="justify-center rounded-xl bg-green-600 px-2 py-2 text-xs text-white hover:bg-green-700 disabled:bg-green-300"><Send className="h-3.5 w-3.5" />发布</AppButton></div>
          {boardDirty ? <div className="text-[11px] text-amber-700">状态灯存在未保存修改；请先保存状态，才可进行发布前检查。</div> : null}
          {reportView(report)}
        </div>
      </div>
    </DraggablePanel>
    {selectedSubmission ? <DraggablePanel id="review-package-detail-panel" defaultPosition={{ x: 468, y: 132 }} zIndex={1765} constrainExpandedToViewport><div className="w-[390px] max-h-[76vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl" data-draggable-proxy-close="true"><div className="border-b border-gray-200 px-4 py-3 pr-24"><h3 className="text-base font-bold text-gray-900" data-draggable-title>审核包详情</h3><div className="mt-0.5 break-all text-xs text-gray-500">{selectedSubmission.submissionId}</div><button type="button" data-draggable-close className="sr-only" aria-label="关闭" onClick={() => setDetailId(null)} /></div><div className="max-h-[calc(76vh-56px)] space-y-3 overflow-y-auto p-3"><div className="flex gap-2"><select className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800" value={selectedRevision?.revisionId ?? ''} onChange={(event) => setDetailRevisionId(event.target.value)}>{selectedSubmission.revisions.map((revision) => <option key={revision.revisionId} value={revision.revisionId}>{revision.revisionId}</option>)}</select><AppButton onClick={() => void reload()} disabled={busy !== null} className="rounded-xl bg-gray-100 px-3 text-xs text-gray-700 hover:bg-gray-200"><RefreshCw className="h-4 w-4" />刷新</AppButton></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-blue-50 px-2 py-2 text-blue-700"><b>{selectedRevision?.package.featureCount ?? '—'}</b><div>要素</div></div><div className="rounded-xl bg-amber-50 px-2 py-2 text-amber-700"><b>{selectedRevision?.package.deleteCount ?? '—'}</b><div>删除</div></div><div className="rounded-xl bg-purple-50 px-2 py-2 text-purple-700"><b>{selectedRevision?.package.pictureCount ?? '—'}</b><div>图片</div></div></div><AppButton onClick={() => void loadIntoWorkspace()} disabled={!selectedRevision || busy !== null} className="w-full justify-center rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:bg-orange-300"><FileDown className="h-4 w-4" />加载到审核工作区</AppButton><AppButton onClick={() => void runPackagePrecheck()} disabled={!selectedRevision || busy !== null} className="w-full justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"><ClipboardCheck className="h-4 w-4" />预检</AppButton><div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3"><AppButton onClick={() => mutateLocal('archived', undefined, 'archive')} className="justify-center rounded-xl bg-gray-100 px-2 py-2 text-xs text-gray-700 hover:bg-gray-200"><Archive className="h-3.5 w-3.5" />归档</AppButton><AppButton onClick={() => mutateLocal('rejected', '请填写要求修改的原因：', 'request-changes')} className="justify-center rounded-xl bg-red-50 px-2 py-2 text-xs text-red-700 hover:bg-red-100"><XCircle className="h-3.5 w-3.5" />要求修改</AppButton><AppButton onClick={() => mutateLocal('pending', undefined, 'reopen')} className="justify-center rounded-xl bg-amber-50 px-2 py-2 text-xs text-amber-800 hover:bg-amber-100"><RotateCcw className="h-3.5 w-3.5" />恢复待审</AppButton></div>{reportView(report)}</div></div></DraggablePanel> : null}
    {releaseFeed ? <DraggablePanel id="review-release-feed-panel" defaultPosition={{ x: 874, y: 132 }} zIndex={1762} constrainExpandedToViewport><div className="w-[330px] max-h-[60vh] overflow-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl" data-draggable-proxy-close="true"><h3 className="text-base font-bold text-gray-900" data-draggable-title>发布记录</h3><button type="button" data-draggable-close className="sr-only" aria-label="关闭" onClick={() => setReleaseFeed(null)} />{releaseFeed.length ? <div className="mt-3 space-y-2">{releaseFeed.map((item) => <div key={item.releaseId} className="rounded-xl bg-gray-50 p-2 text-xs"><div className="font-semibold text-gray-800">{item.releaseId}</div><div className="mt-1 text-gray-500">{item.occurredAt} · {stateLabel(item.state)}</div></div>)}</div> : <div className="mt-3 text-sm text-gray-500">暂无发布记录。</div>}</div></DraggablePanel> : null}
    {workspacePanel}
  </>;
}
