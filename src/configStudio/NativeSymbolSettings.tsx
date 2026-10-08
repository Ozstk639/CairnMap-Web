import type { ZoomPriorityRule } from './types';
export function NativeSymbolSettings({ rule, onChange }: { rule: ZoomPriorityRule; onChange: (rule: ZoomPriorityRule) => void }) {
  if (!rule.style) return null;
  const style = rule.style; const offset = style.symbolOffsetPx ?? { x: 0, y: 0 };
  return <div className="mt-2 grid gap-2 rounded border p-2 text-xs md:grid-cols-4">
    {(['x', 'y'] as const).map(axis => <label key={axis}>符号 {axis.toUpperCase()} 偏移 px<input className="mt-1 w-full rounded border px-2 py-1" type="number" step={0.1} value={offset[axis]} onChange={event => onChange({ ...rule, style: { ...style, symbolOffsetPx: { ...offset, [axis]: Number(event.target.value) } } })} /></label>)}
    <label>符号锚点<select className="mt-1 w-full rounded border px-2 py-1" value={style.symbolAnchor ?? 'geometry'} onChange={event => onChange({ ...rule, style: { ...style, symbolAnchor: event.target.value as typeof style.symbolAnchor } })}><option value="geometry">几何锚点</option><option value="label">跟随 Label 候选</option></select></label>
    <label>符号可见性<select className="mt-1 w-full rounded border px-2 py-1" value={style.symbolVisibility ?? 'independent'} onChange={event => onChange({ ...rule, style: { ...style, symbolVisibility: event.target.value as typeof style.symbolVisibility } })}><option value="independent">独立显示</option><option value="withLabel">与 Label 同显隐</option></select></label>
  </div>;
}
