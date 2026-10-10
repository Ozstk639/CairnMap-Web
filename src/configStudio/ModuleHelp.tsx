import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export const MODULE_HELP: Record<string, string> = {
  '扩展规则': '这里集中设置少数规则需要的特殊显示行为。通常保留默认即可；需要改变候选位置、碰撞、密度、层级或交互效果时，展开对应模块，仅覆写需要调整的值。恢复继承后会使用全局设置。',
  '显示权重合成与边界': '这里决定同层级要素显示时谁更靠前。一般保留默认；需要按面积、长度或字段调整先后顺序时，选择指标并设置倍率、合成方式和上下限。它与 Label 的碰撞优先级分别设置。',
  'Label 独立碰撞指标': '这里决定标签发生冲突时优先保留谁，可按面积、长度或字段计算优先级，再设置倍率及范围。一般使用默认；数值越高越优先，几何层级和显示权重不由此改变。',
  '候选、碰撞对象与稳定/密度策略': '这里控制标签可以放在哪里、需要避让什么，以及拥挤时如何处理。通常沿用默认；可按需要增加候选、选择碰撞对象或调整密度，并通过恢复继承撤销本地覆写。',
  '本规则交互视觉覆盖': '这里单独调整当前规则在悬停、选中等交互状态下的颜色、粗细与符号。没有覆写时使用全局交互设置；只有需要强调某类要素时才修改，并在地图中检查实际效果。',
  '通用文字、Pane 与点击': '这里设置文字显示、图层归属和点击范围。通常保留默认；特殊情况可调整具体项目，点击范围与标签、几何的真实位置共享计算，不能用它修正错误的坐标。',
  '跨要素可见性与上下文关系': '这里决定某个要素是否因其他要素或主从关系而显示。只有需要铁路互斥显示、建筑楼层等关联行为时才设置；选择关系类型、字段和阈值，并检查有效分类及关联数据。',
  '面候选点与大面策略': '这里为面内标签选择合适的位置，并处理大面的显示。一般沿用默认；可按需要调整候选数量、面内边距和阈值，候选仍会接受面内约束与碰撞校验。',
  '面候选权重与切换': '这里决定多个面内候选之间如何比较，以及何时换到新的位置。通常保持默认可减少跳动；需要偏向某类位置时调整指标和切换阈值，再在不同缩放下检查结果。',
  '候选锚点与稳定性': '这里控制标签锚点、候选顺序和旧位置复用。一般保留默认以减少平移缩放时的跳动；需要固定或改变位置时调整对应项，X 正右负左、Y 正下负上，单位为屏幕像素。',
  '完整贴线 / CJK 标签算法': '这里调整沿线文字和中文逐字贴线的排布，包括间距、旋转、预算及失败回退。默认适合一般线路；特殊线路只覆写所需参数，并检查转弯、短线和拥挤位置的可读性。',
  '碰撞、密度与回退': '这里限制拥挤区域的标签数量，并决定放不下时如何降级。设置每格或视窗预算、碰撞留白和回退方式；降低顺序按编号执行，选中目标等保留规则继续生效。',
  '自定义候选偏移': '这里增加相对锚点的备用位置，原位置碰撞时按规则尝试。填写名称和 X/Y 偏移，X 正右负左、Y 正下负上，单位 px；例如右上位置可设 X=20、Y=-12。',
  '检测碰撞对象': '这里选择当前标签需要避让哪些对象，例如点符号、必显标签或几何。选择顺序不影响结果；一般使用全局默认，仅在某条规则需要不同避让行为时覆写。',
  '阻挡标签对象': '这里选择已经放置的当前标签会阻挡哪些后续标签。它控制向外施加的阻挡；例如重要地标可阻挡普通 POI。一般沿用默认，需要特殊关系时选择对应类型。',
  '缓存失效条件': '这里说明哪些变化会使稳定位置需要重算。通常使用默认；可选择文字、几何、世界、Zoom 桶等变化，实际数据与投影更新仍会正确触发重算，避免旧尺寸影响碰撞和点击。',
  '密度降低顺序（按选择顺序）': '这里决定预算不足后依次执行的降级动作，界面上的 1、2、3 就是执行顺序。点击编号框选择或取消，再用手柄或上下按钮排序；成功或遇到终止动作即停止，空覆写直接采用最终回退。',
  '有效扩展值与来源': '这里只读展示全局默认、本规则覆写和静态合成值，便于查出某个参数来自哪里。需要调整时回到对应模块或全局设置；具体要素的字段条件、关联颜色和交互状态还会影响实际运行结果。',
  '全局扩展默认': '这里为同一几何类型设置共用的候选、密度和稳定性默认，未被具体规则覆写的项目都会使用这些值。先保留默认；只影响一个分类时在该规则中修改，并可恢复继承。',
};
export function ModuleHelp({ title, helpKey }: { title: string; helpKey?: string }) {
  const content = MODULE_HELP[helpKey ?? title] ?? (title.startsWith('扩展规则') ? MODULE_HELP['扩展规则'] : title.includes('通用候选、密度与稳定性默认') ? MODULE_HELP['全局扩展默认'] : undefined);
  const id = useId(), button = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(); const beforePointer = useRef(false);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 8, top: 8, width: 360 });
  const cancel = () => { if (timer.current) clearTimeout(timer.current); };
  const close = () => { pinned.current = false; cancel(); setOpen(false); };
  const closeSoon = () => { if (!open || pinned.current) return; cancel(); timer.current = setTimeout(close, 140); };
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const rect = button.current!.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) { setOpen(false); return; }
      const width = Math.min(360, innerWidth - 16), height = popup.current?.offsetHeight ?? 250;
      const top = rect.bottom + 8 + height <= innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - height - 8);
      setPosition({ width, left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), top });
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const outside = (e: PointerEvent) => { if (!button.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) close(); };
    place(); const observer = new ResizeObserver(place); if (popup.current) observer.observe(popup.current);
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place); document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', outside, true);
    return () => { cancel(); observer.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside, true); };
  }, [open]);
  if (!content) return null;
  return <><button ref={button} type="button" aria-label={`${title}说明`} aria-describedby={open ? id : undefined} aria-expanded={open} className="ml-2 inline-flex align-middle text-slate-500 hover:text-blue-700" onPointerEnter={e => { if (e.pointerType !== 'touch') { cancel(); setOpen(true); } }} onPointerLeave={closeSoon} onFocus={() => { cancel(); setOpen(true); }} onBlur={closeSoon} onPointerDown={e => { beforePointer.current = open; if (e.pointerType === 'touch') { pinned.current = true; cancel(); } e.stopPropagation(); }} onClick={e => { e.preventDefault(); e.stopPropagation(); cancel(); if (e.detail === 0 || !beforePointer.current) { pinned.current = true; setOpen(true); } else close(); }}>
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1 L17 9 L9 17 L1 9 Z" fill="white" stroke="currentColor" /><text x="9" y="12" textAnchor="middle" fontSize="10" fill="currentColor">?</text></svg>
  </button>{open ? createPortal(<div ref={popup} id={id} role="tooltip" aria-label={`${title}说明`} className="fixed rounded-lg border border-slate-300 bg-white p-3 text-xs leading-5 text-slate-700 shadow-xl" style={{ ...position, zIndex: 14000, maxHeight: Math.min(420, innerHeight - 24), overflowY: 'auto' }} onPointerEnter={cancel} onPointerLeave={closeSoon}>
    <div className="mb-1 flex items-center justify-between gap-3"><strong>{title}</strong><button type="button" aria-label="关闭模块说明" className="rounded px-1" onClick={close}>×</button></div>
    <p>{content}</p>
  </div>, document.body) : null}</>;
}
