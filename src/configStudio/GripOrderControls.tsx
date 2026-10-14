export function GripOrderControls({ scope, index, count, onMove, label = '项目' }: { scope: string; index: number; count: number; onMove: (from: number, to: number) => void; label?: string }) {
  const format = 'application/x-cairnmap-order';
  return <span className="inline-flex items-center gap-1" onDragOver={e => { if ([...e.dataTransfer.types].includes(format)) e.preventDefault(); }} onDrop={e => { e.preventDefault(); try { const value = JSON.parse(e.dataTransfer.getData(format)); if (value.scope === scope && Number.isInteger(value.index) && value.index >= 0 && value.index < count) onMove(value.index, index); } catch { /* external drags do not reorder */ } }}>
    <button type="button" draggable aria-label={`拖动${label} ${index + 1} 排序`} title="仅此手柄可拖动排序" className="cursor-grab rounded border px-1 text-slate-500" onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData(format, JSON.stringify({ scope, index })); e.dataTransfer.effectAllowed = 'move'; }}>⠿</button>
    <button type="button" disabled={index === 0} aria-label={`${label} ${index + 1} 上移`} className="rounded border px-1 disabled:opacity-30" onClick={() => onMove(index, index - 1)}>↑</button>
    <button type="button" disabled={index === count - 1} aria-label={`${label} ${index + 1} 下移`} className="rounded border px-1 disabled:opacity-30" onClick={() => onMove(index, index + 1)}>↓</button>
  </span>;
}
