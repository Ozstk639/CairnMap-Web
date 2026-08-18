import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, ClipboardCheck, FileDown, FileText, RefreshCw, RotateCcw, Send, ShieldCheck, XCircle } from 'lucide-react';
import AppButton from '@/components/ui/AppButton';
import { DraggablePanel } from '@/components/DraggablePanel/DraggablePanel';
import type { ReviewAuthPort } from './auth';
import {
  createIdleReviewReleaseGate,
  ReviewOperationError,
  type ReviewAuthorizationContext,
  type ReviewPackagePrecheckReport,
  type ReviewPackageRevision,
  type ReviewReleaseControlPort,
  type ReviewReleaseControlReport,
  type ReviewReleaseGateSnapshot,
  type ReviewStatusBoardAdapter,
  type ReviewSubmissionAdapter,
  type ReviewSubmissionSnapshot,
  type ReviewWorkspaceLoadProgress,
} from './contracts';
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
  onLoadRevision(
    input: { submission: ReviewSubmissionSnapshot; revision: ReviewPackageRevision },
    reportProgress?: (progress: ReviewWorkspaceLoadProgress) => void,
  ): Promise<void> | void;
  onClose: () => void;
  subscribeToStatusDraft?: (listener: (signal: ReviewStatusDraftSignal) => void) => () => void;
  subscribeToSubmissionUpload?: (listener: (submissionId?: string) => void) => () => void;
};

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function stateLabel(state: string) {
  return ({ pending: '待审核', approved: '已通过', rejected: '已打回', archived: '已归档', queued: '已排队', running: '发布中', 'mirror-pending': '镜像等待中', mirrored: '已镜像', failed: '失败' } as Record<string, string>)[state] ?? state;
}

function stateTone(state: string) {
  return ({ pending: 'bg-amber-100 text-amber-800', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', archived: 'bg-gray-200 text-gray-700' } as Record<string, string>)[state] ?? 'bg-blue-100 text-blue-700';
}

function describeError(error: unknown) {
  if (error instanceof ReviewOperationError) {
    const correlation = error.correlationId ? `（关联 ID：${error.correlationId}）` : '';
    const details = error.details.length ? ` ${error.details.join('；')}` : '';
    return `${error.code}：${error.message}${correlation}${details}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function normalizeGate(value: ReviewReleaseGateSnapshot | null | undefined) {
  return value && typeof value.state === 'string' ? value : createIdleReviewReleaseGate();
}

function createEntry(submission: ReviewSubmissionSnapshot, existing?: ReviewStatusBoardEntry): ReviewStatusBoardEntry {
  if (existing) return existing;
  const state = ['pending', 'approved', 'rejected', 'archived'].includes(submission.state)
    ? submission.state as ReviewStatusBoardEntry['state']
    : 'pending';
  return {
    submissionId: submission.submissionId,
    state,
    decisionRevisionId: state === 'pending' ? submission.currentRevisionId : submission.displayRevisionId,
    updatedAt: submission.lastEvent?.occurredAt ?? new Date().toISOString(),
    updatedBy: submission.lastEvent?.actor ?? { principalId: 'system', roles: [] },
    ...(submission.lastEvent?.reason ? { reason: submission.lastEvent.reason } : {}),
  };
}

function reportView(report: ReviewReleaseControlReport | ReviewPackagePrecheckReport | null, title: string) {
  if (!report) return null;
  const findings = 'findings' in report ? report.findings : report.report?.findings ?? [];
  return <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
    <div className="font-semibold">{title}：{report.decision ?? '无决定'}</div>
    {findings.length ? <div className="mt-2 space-y-1">{findings.map((finding, index) => <div key={`${finding.message ?? 'finding'}-${index}`} className={finding.severity === 'blocker' ? 'text-red-700' : finding.severity === 'warning' ? 'text-amber-700' : 'text-gray-600'}>• {finding.message ?? '未提供说明'}</div>)}</div> : <div className="mt-1 text-gray-500">未返回阻断或警告项。</div>}
  </div>;
}

function progressText(progress: ReviewWorkspaceLoadProgress) {
  if (!progress.totalBytes || progress.completedBytes === undefined) return progress.message;
  return `${progress.message} ${Math.min(100, Math.round((progress.completedBytes / progress.totalBytes) * 100))}%`;
}

export function ReviewStatusBoardPanel({ auth, submissionAdapter, releaseControl, onLoadRevision, onClose, subscribeToStatusDraft, subscribeToSubmissionUpload }: ReviewStatusBoardPanelProps) {
  const [actor, setActor] = useState<ReviewAuthorizationContext>({ principalId: 'anonymous', roles: [] });
  const [submissions, setSubmissions] = useState<ReviewSubmissionSnapshot[]>([]);
  const [board, setBoard] = useState<ReviewStatusBoardSnapshot | null>(null);
  const [draft, setDraft] = useState<ReviewStatusBoardEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [packageReport, setPackageReport] = useState<ReviewPackagePrecheckReport | null>(null);
  const [releaseReport, setReleaseReport] = useState<ReviewReleaseControlReport | null>(null);
  const [releaseGate, setReleaseGate] = useState<ReviewReleaseGateSnapshot | null>(null);
  const [releaseFeed, setReleaseFeed] = useState<Awaited<ReturnType<NonNullable<ReviewSubmissionAdapter['getReleaseFeed']>>> | null>(null);
  const [loadProgress, setLoadProgress] = useState<ReviewWorkspaceLoadProgress | null>(null);

  const detail = submissions.find((submission) => submission.submissionId === detailId) ?? null;
  const revision = detail?.revisions.find((candidate) => candidate.revisionId === revisionId)
    ?? detail?.revisions.find((candidate) => candidate.revisionId === detail.currentRevisionId)
    ?? null;
  const selectedEntries = useMemo(() => draft.filter((entry) => selectedIds.has(entry.submissionId)), [draft, selectedIds]);
  const dirty = board ? isReviewStatusBoardDirty({ baseBoardVersion: board.boardVersion, entries: draft }, board) : false;
  const publishReady = releaseReport?.decision === 'ready' || releaseReport?.decision === 'warning-confirmation-required';

  const refreshList = useCallback(async () => {
    setBusy('refresh');
    setMessage(null);
    try {
      const session = await auth.getSession();
      if (session.status !== 'authenticated' || !session.principalId) throw new ReviewOperationError({ code: 'authentication-required', message: session.message ?? '请先登录已授权身份。' });
      const currentActor = { principalId: session.principalId, roles: session.roles ?? [] };
      const [items, remoteBoard] = await Promise.all([
        submissionAdapter.listSubmissions?.(currentActor) ?? Promise.resolve([]),
        submissionAdapter.getStatusBoard(currentActor),
      ]);
      const remoteById = new Map(remoteBoard.entries.map((entry) => [entry.submissionId, entry]));
      const hydrated = items.map((item) => createEntry(item, remoteById.get(item.submissionId)));
      setActor(currentActor);
      setSubmissions(items);
      setBoard({ ...remoteBoard, entries: hydrated });
      setDraft(hydrated);
      setSelectedIds((previous) => new Set([...previous].filter((id) => items.some((item) => item.submissionId === id))));
      setDetailId((previous) => previous && items.some((item) => item.submissionId === previous) ? previous : null);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }, [auth, submissionAdapter]);

  const updateDraft = useCallback((submissionId: string, state: ReviewStatusBoardEntry['state'], decisionAction?: ReviewStatusDecisionAction, reason?: string) => {
    const current = draft.find((entry) => entry.submissionId === submissionId);
    const selected = submissions.find((item) => item.submissionId === submissionId);
    if (!current || !selected) return;
    const actionLabel = ({ approve: '通过', reject: '打回', 'request-changes': '要求修改', archive: '归档', reopen: '恢复待审' } as Record<string, string>)[decisionAction ?? ''] ?? stateLabel(state);
    if (!window.confirm(`确认${actionLabel}此审核包？此操作仅修改本地状态灯，需点击“保存状态”后才会提交。`)) return;
    const selectedRevision = selected.revisions.find((item) => item.revisionId === revisionId) ?? selected.revisions.find((item) => item.revisionId === selected.currentRevisionId);
    setDraft((entries) => entries.map((entry) => entry.submissionId !== submissionId ? entry : {
      ...entry,
      state,
      decisionRevisionId: selectedRevision?.revisionId ?? entry.decisionRevisionId,
      ...(decisionAction ? { decisionAction } : {}),
      ...(reason ? { reason } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    }));
    setSelectedIds((previous) => new Set(previous).add(submissionId));
  }, [actor, draft, revisionId, submissions]);

  const saveStatus = useCallback(async () => {
    if (!board || !selectedEntries.length) return;
    setBusy('save-status');
    try {
      const remote = await submissionAdapter.getStatusBoard(actor);
      const differences = compareReviewStatusBoards(draft, remote.entries).filter((difference) => difference.kind !== 'unchanged');
      const revisionChanges = differences.filter((difference) => difference.kind === 'revision-changed');
      if (revisionChanges.length) {
        setMessage(`保存状态已阻断：${revisionChanges.map((difference) => difference.submissionId).join('、')} 的云端决策版本已变化。请刷新并检查对应审核包。`);
        return;
      }
      const expectedBoardVersion = remote.boardVersion;
      if (differences.length && !window.confirm(`检测到云端状态灯变化：${differences.map((difference) => `${difference.submissionId}（${difference.kind}）`).join('；')}。确认以本地已选择状态覆盖这些变化？`)) {
        setMessage('保存状态已取消；本地状态灯保持不变。');
        return;
      }
      if (!window.confirm(`确认保存 ${selectedEntries.length} 个审核包的状态灯？`)) return;
      const result = await submissionAdapter.saveStatusBoard({
        requestId: createId('status-save'), correlationId: createId('status-correlation'), idempotencyKey: createId('status-idempotency'),
        expectedBoardVersion, entries: selectedEntries, actor, occurredAt: new Date().toISOString(),
      });
      setBoard(result.board);
      setDraft(result.board.entries.map((entry) => ({ ...entry })));
      setMessage('审核状态已保存。');
      setReleaseReport(null);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }, [actor, board, draft, selectedEntries, submissionAdapter]);

  const loadWorkspace = useCallback(async () => {
    if (!detail || !revision) return;
    setBusy('load');
    setLoadProgress({ stage: 'requesting-download', message: '正在申请审核包下载…' });
    try {
      await onLoadRevision({ submission: detail, revision }, setLoadProgress);
      setMessage('审核包已下载并加载到审核工作区。');
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setLoadProgress(null);
      setBusy(null);
    }
  }, [detail, onLoadRevision, revision]);

  const packagePrecheck = useCallback(async () => {
    if (!detail || !revision || !submissionAdapter.precheckSubmission) return;
    setBusy('package-precheck');
    setPackageReport(null);
    try {
      const result = await submissionAdapter.precheckSubmission({
        requestId: createId('precheck'), correlationId: createId('precheck-correlation'), idempotencyKey: createId('precheck-idempotency'),
        submissionId: detail.submissionId, targetRevisionId: revision.revisionId, expectedStateVersion: detail.stateVersion,
        action: 'precheck', occurredAt: new Date().toISOString(), actor,
      });
      setPackageReport(result);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }, [actor, detail, revision, submissionAdapter]);

  const refreshGate = useCallback(async () => {
    if (!window.confirm('确认刷新 Release Gate？这会读取当前发布锁与执行状态。')) return;
    setBusy('gate');
    try {
      setReleaseGate(normalizeGate(await releaseControl.getReleaseGate(actor)));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }, [actor, releaseControl]);

  const refreshFeed = useCallback(async () => {
    setBusy('feed');
    try {
      setReleaseFeed(await submissionAdapter.getReleaseFeed?.(actor, 10) ?? []);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }, [actor, submissionAdapter]);

  const releasePrecheck = useCallback(async () => {
    if (!board || !selectedEntries.length) return;
    if (dirty) {
      setMessage('发布前检查已阻断：状态灯存在未保存的本地修改，请先保存状态。');
      return;
    }
    const approved = selectedEntries.find((entry) => entry.state === 'approved' && entry.decisionRevisionId);
    const owner = approved && submissions.find((item) => item.submissionId === approved.submissionId);
    if (!approved || !owner) { setMessage('至少选择一个已通过且已指定版本的审核包。'); return; }
    setBusy('release-precheck');
    try {
      const gate = normalizeGate(await releaseControl.getReleaseGate(actor));
      setReleaseGate(gate);
      if (['prechecking', 'awaiting-confirmation', 'queueing', 'running', 'mirroring'].includes(gate.state)) { setMessage('当前已有发布进行中，请稍后刷新 Release Gate。'); return; }
      const remote = await submissionAdapter.getStatusBoard(actor);
      const differences = compareReviewStatusBoards(draft, remote.entries).filter((difference) => difference.kind !== 'unchanged');
      if (remote.boardVersion !== board.boardVersion || differences.length) {
        const revisionChanges = differences.filter((difference) => difference.kind === 'revision-changed');
        if (revisionChanges.length) {
          setMessage(`发布前检查已阻断：${revisionChanges.map((difference) => difference.submissionId).join('、')} 的云端决策版本已变化。请刷新对应审核包并重新保存状态。`);
        } else {
          setMessage(`发布前检查已阻断：云端状态灯已更新（${differences.map((difference) => `${difference.submissionId}:${difference.kind}`).join('；') || '版本号变化'}）。请确认后先保存状态，再重新检查。`);
        }
        return;
      }
      const result = await releaseControl.runReleasePrecheck({
        selectedSubmissionIds: selectedEntries.map((entry) => entry.submissionId), expectedBoardVersion: board.boardVersion,
        request: { requestId: createId('release-precheck'), correlationId: createId('release-correlation'), idempotencyKey: createId('release-idempotency'), submissionId: owner.submissionId, targetRevisionId: approved.decisionRevisionId!, expectedStateVersion: owner.stateVersion, action: 'publish', occurredAt: new Date().toISOString(), actor },
      }, actor);
      setReleaseReport(result);
      setReleaseGate(normalizeGate(result.gate));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }, [actor, board, dirty, draft, releaseControl, selectedEntries, submissionAdapter, submissions]);

  const publish = useCallback(async () => {
    if (!releaseReport?.gate?.attemptId || !releaseReport.report?.reportSha256 || !publishReady) return;
    const approved = selectedEntries.find((entry) => entry.state === 'approved' && entry.decisionRevisionId);
    const owner = approved && submissions.find((item) => item.submissionId === approved.submissionId);
    if (!approved || !owner || !window.confirm('确认发布？服务端会再次校验 Release Gate、当前数据和已保存状态。')) return;
    setBusy('publish');
    try {
      const result = await releaseControl.confirmRelease({
        attemptId: releaseReport.gate.attemptId, expectedGateVersion: releaseReport.gate.gateVersion,
        precheckReportSha256: releaseReport.report.reportSha256,
        request: { requestId: createId('publish'), correlationId: createId('publish-correlation'), idempotencyKey: createId('publish-idempotency'), submissionId: owner.submissionId, targetRevisionId: approved.decisionRevisionId!, expectedStateVersion: owner.stateVersion, action: 'publish', occurredAt: new Date().toISOString(), actor },
      }, actor);
      setReleaseReport(result);
      setReleaseGate(normalizeGate(result.gate));
      setMessage('发布已进入受控执行队列。');
      await refreshList();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }, [actor, publishReady, refreshList, releaseControl, releaseReport, selectedEntries, submissions]);

  useEffect(() => { void refreshList(); }, [refreshList]);
  useEffect(() => subscribeToStatusDraft?.((signal) => updateDraft(signal.submissionId, signal.state, signal.decisionAction, signal.reason)), [subscribeToStatusDraft, updateDraft]);
  useEffect(() => subscribeToSubmissionUpload?.(() => { void refreshList(); }), [refreshList, subscribeToSubmissionUpload]);

  return <>
    <DraggablePanel id="review-status-board" defaultPosition={{ x: 28, y: 132 }} zIndex={1760} constrainExpandedToViewport>
      <div className="w-[430px] max-h-[74vh] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-xl" data-draggable-proxy-close="true">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4"><div><h2 className="text-xl font-bold text-gray-900" data-draggable-title>审核序列</h2><p className="mt-1 text-sm text-gray-500">状态灯先本地编辑；仅“保存状态”会提交至审核服务。</p></div><button type="button" data-draggable-close className="sr-only" aria-label="关闭" onClick={onClose} /></div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2"><AppButton onClick={() => void refreshGate()} disabled={busy !== null} className="justify-center rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"><ShieldCheck className="h-4 w-4" />刷新 Release Gate</AppButton><AppButton onClick={() => void refreshFeed()} disabled={busy !== null} className="justify-center rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"><FileText className="h-4 w-4" />刷新发布记录</AppButton><AppButton onClick={() => void refreshList()} disabled={busy !== null} className="justify-center rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"><RefreshCw className="h-4 w-4" />刷新列表</AppButton><div className="rounded-xl bg-gray-50 px-3 py-2 text-center text-sm text-gray-600">Gate：{releaseGate ? stateLabel(releaseGate.state) : '未读取'} · 已选 {selectedIds.size}</div></div>
          {message ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
          <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-900">待审核包</h3><div className="flex gap-3 text-sm"><button type="button" className="text-blue-600 hover:underline" onClick={() => setSelectedIds(new Set(submissions.map((item) => item.submissionId)))}>全选</button><button type="button" className="text-gray-500 hover:underline" onClick={() => setSelectedIds(new Set())}>清空选择</button></div></div>
          <div className="space-y-2">{submissions.map((submission) => { const entry = draft.find((item) => item.submissionId === submission.submissionId); return <button key={submission.submissionId} type="button" onClick={() => { setDetailId(submission.submissionId); setRevisionId(submission.currentRevisionId); setPackageReport(null); }} className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-3 text-left hover:border-blue-400"><div className="flex gap-3"><input aria-label={`选择 ${submission.packageName}`} type="checkbox" checked={selectedIds.has(submission.submissionId)} onClick={(event) => event.stopPropagation()} onChange={() => setSelectedIds((previous) => { const next = new Set(previous); if (next.has(submission.submissionId)) next.delete(submission.submissionId); else next.add(submission.submissionId); return next; })} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-gray-900">{submission.packageName}</span><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${stateTone(entry?.state ?? submission.state)}`}>{stateLabel(entry?.state ?? submission.state)}</span></div><div className="mt-1 text-xs text-gray-500">{submission.submissionId}</div><div className="mt-2 text-xs text-gray-600">决策版本：{entry?.decisionRevisionId ?? '未选择'} · 共 {submission.revisions.length} 个版本</div></div></div></button>; })}</div>
          <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3"><AppButton disabled={!selectedEntries.length || busy !== null} onClick={() => void saveStatus()} className="justify-center rounded-xl bg-orange-600 px-2 py-2 text-xs text-white hover:bg-orange-700 disabled:bg-orange-300"><CheckCircle2 className="h-3.5 w-3.5" />保存状态</AppButton><AppButton disabled={!selectedEntries.length || dirty || busy !== null} onClick={() => void releasePrecheck()} className="justify-center rounded-xl bg-blue-600 px-2 py-2 text-xs text-white hover:bg-blue-700 disabled:bg-blue-300"><ClipboardCheck className="h-3.5 w-3.5" />发布前检查</AppButton><AppButton disabled={!publishReady || busy !== null} onClick={() => void publish()} className="justify-center rounded-xl bg-green-600 px-2 py-2 text-xs text-white hover:bg-green-700 disabled:bg-green-300"><Send className="h-3.5 w-3.5" />发布</AppButton></div>
          {dirty ? <p className="text-xs text-amber-700">状态灯有未保存的本地修改；请先保存状态。</p> : null}
          {reportView(releaseReport, '发布前检查报告')}
        </div>
      </div>
    </DraggablePanel>
    {detail ? <DraggablePanel id="review-package-detail" defaultPosition={{ x: 900, y: 132 }} zIndex={1761} constrainExpandedToViewport><div className="w-[390px] max-h-[74vh] overflow-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl" data-draggable-proxy-close="true"><div className="flex items-start justify-between"><div><h3 className="text-xl font-bold text-gray-900" data-draggable-title>审核包详情</h3><p className="mt-1 text-sm text-gray-500">{detail.submissionId}</p></div><button type="button" data-draggable-close className="sr-only" aria-label="关闭" onClick={() => setDetailId(null)} /></div><div className="mt-4 flex gap-2"><select className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" value={revision?.revisionId ?? ''} onChange={(event) => { setRevisionId(event.target.value); setPackageReport(null); }}>{detail.revisions.map((item) => <option key={item.revisionId} value={item.revisionId}>{item.revisionId}</option>)}</select><AppButton onClick={() => void refreshList()} disabled={busy !== null} className="rounded-xl bg-gray-100 px-3 text-gray-700 hover:bg-gray-200"><RefreshCw className="h-4 w-4" />刷新</AppButton></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-xl bg-blue-50 p-2 text-blue-700"><b>{revision?.package.featureCount ?? 0}</b><div>要素</div></div><div className="rounded-xl bg-amber-50 p-2 text-amber-700"><b>{revision?.package.deleteCount ?? 0}</b><div>删除</div></div><div className="rounded-xl bg-purple-50 p-2 text-purple-700"><b>{revision?.package.pictureCount ?? 0}</b><div>图片</div></div></div><div className="mt-3 space-y-2"><AppButton onClick={() => void loadWorkspace()} disabled={!revision || busy !== null} className="w-full justify-center rounded-xl bg-orange-600 px-3 py-2 font-semibold text-white hover:bg-orange-700 disabled:bg-orange-300"><FileDown className="h-4 w-4" />加载到审核工作区</AppButton><AppButton onClick={() => void packagePrecheck()} disabled={!revision || busy !== null} className="w-full justify-center rounded-xl bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"><ClipboardCheck className="h-4 w-4" />预检</AppButton>{reportView(packageReport, '审核包预检报告')}</div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3"><AppButton onClick={() => updateDraft(detail.submissionId, 'archived', 'archive')} disabled={busy !== null} className="justify-center rounded-xl bg-gray-100 px-2 py-2 text-xs text-gray-700 hover:bg-gray-200"><Archive className="h-3.5 w-3.5" />归档</AppButton><AppButton onClick={() => { const reason = window.prompt('请填写要求修改的原因：'); if (reason?.trim()) updateDraft(detail.submissionId, 'rejected', 'request-changes', reason.trim()); }} disabled={busy !== null} className="justify-center rounded-xl bg-red-50 px-2 py-2 text-xs text-red-700 hover:bg-red-100"><XCircle className="h-3.5 w-3.5" />要求修改</AppButton><AppButton onClick={() => updateDraft(detail.submissionId, 'pending', 'reopen')} disabled={busy !== null} className="justify-center rounded-xl bg-amber-50 px-2 py-2 text-xs text-amber-800 hover:bg-amber-100"><RotateCcw className="h-3.5 w-3.5" />恢复待审</AppButton></div><div className="mt-2 grid grid-cols-2 gap-2"><AppButton onClick={() => updateDraft(detail.submissionId, 'approved', 'approve')} disabled={busy !== null} className="justify-center rounded-xl bg-green-600 px-2 py-2 text-xs text-white hover:bg-green-700"><CheckCircle2 className="h-3.5 w-3.5" />通过</AppButton><AppButton onClick={() => { const reason = window.prompt('请填写打回原因：'); if (reason?.trim()) updateDraft(detail.submissionId, 'rejected', 'reject', reason.trim()); }} disabled={busy !== null} className="justify-center rounded-xl bg-rose-600 px-2 py-2 text-xs text-white hover:bg-rose-700"><XCircle className="h-3.5 w-3.5" />打回</AppButton></div></div></DraggablePanel> : null}
    {releaseFeed ? <DraggablePanel id="review-release-feed" defaultPosition={{ x: 870, y: 180 }} zIndex={1762} constrainExpandedToViewport><div className="w-[330px] max-h-[60vh] overflow-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl" data-draggable-proxy-close="true"><h3 className="text-base font-bold text-gray-900" data-draggable-title>发布记录</h3><button type="button" data-draggable-close className="sr-only" aria-label="关闭" onClick={() => setReleaseFeed(null)} />{releaseFeed.length ? <div className="mt-3 space-y-2">{releaseFeed.map((item) => <div key={item.releaseId} className="rounded-xl bg-gray-50 p-2 text-xs"><div className="font-semibold text-gray-800">{item.releaseId}</div><div className="mt-1 text-gray-500">{item.occurredAt} · {stateLabel(item.state)}</div></div>)}</div> : <p className="mt-3 text-sm text-gray-500">暂无发布记录。</p>}</div></DraggablePanel> : null}
    {loadProgress ? <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" role="dialog" aria-live="polite"><div className="w-[420px] max-w-[90vw] rounded-2xl border border-gray-200 bg-white shadow-xl"><div className="border-b border-gray-200 px-4 py-3 text-sm font-bold text-gray-900">正在加载审核包</div><div className="px-4 py-4 text-sm text-gray-700">{progressText(loadProgress)}</div><div className="px-4 pb-4"><div className="h-2 overflow-hidden rounded bg-gray-100"><div className="h-full w-3/5 animate-pulse rounded bg-blue-600" /></div></div></div></div> : null}
  </>;
}
