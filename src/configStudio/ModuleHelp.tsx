import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
type Help = { meaning: string; effect: string; edit: string; example: string };
export const MODULE_HELP: Record<string, Help> = {
  '扩展规则': { meaning: '为少数需要特殊显示的规则调整高级参数。', effect: '控制候选、碰撞、密度、层级及交互视觉；未设置项沿用引擎默认。', edit: '展开对应模块，仅覆盖需要调整的值；恢复继承后使用全局设置。', example: '普通规则保留默认；拥挤地区可单独提高标签留白。' },
  '显示权重合成与边界': { meaning: '配置显示权重 C 的动态指标和合成方式，与几何层级 A、碰撞优先级 B 独立。', effect: '在同层级比较显示权重；不会决定哪条字段规则命中。', edit: '选择面积/长度/部件数/字段，设置倍率、除数、上下限和取整，再选择加法或替代。面积/长度为世界坐标单位。', example: '基础 10、指标 2：加法得 12，替代得 2。' },
  'Label 独立碰撞指标': { meaning: '配置碰撞优先级 B，让拥挤时需要的 Label 优先保留。', effect: '按角色和碰撞优先级处理标注，不改变几何覆盖层级。', edit: '基础优先级可配面积/长度/部件数/字段指标；导入 r5 的兼容勾选保留其 B/C 联动，新规则默认独立。', example: '提高一个地标的碰撞优先级，不必同时提高其线面层级。' },
  '候选、碰撞对象与稳定/密度策略': { meaning: '细调 Label 可尝试的位置、避让对象与拥挤后的处理。', effect: '影响位置选择、谁阻挡谁、锚点复用和按序降级。', edit: '候选偏移用屏幕 px；对象列表无顺序，密度列表有顺序；未设置项继承。', example: '增加右侧候选，同时先缩略再隐藏可选标签。' },
  '本规则交互视觉覆盖': { meaning: '覆盖当前规则在悬停、选中、搜索、编辑、删除标记时的视觉。', effect: '调整颜色、线宽、透明度、标签强制显示与层级；不会给几何增加新的点击能力。', edit: '开启需要的状态覆盖，或恢复全局基线。点/线/面触发能力在几何设置中调整。', example: '当前规则选中时用红色描边，其他规则仍使用默认蓝色。' },
  '通用文字、Pane 与点击': { meaning: '设置文字长度/多行、图层容器和点击范围，以及屏幕显示阈值。', effect: '决定文字如何简化、几何在哪个 Pane 绘制以及多近可以命中。', edit: '长度按字符/行；偏移和容差用 px，面阈值用 px²。几何 Pane 覆盖优先于扩展 Pane，空值沿用默认。', example: '把点击容差增到 8px，便于点击细线。' },
  '跨要素可见性与上下文关系': { meaning: '按相关要素或当前主结构/附属结构上下文决定显示。', effect: '可按同 ID、重合点、贴线关系或当前楼层抑制重复图形。', edit: '选择模式、目标分类和匹配字段；关系不完整会阻断保存。这里保留明确的分类目标，规则字段条件仍排除分类字段。', example: '存在同 ID 的车站面时隐藏重复车站点。' },
  '面候选点与大面策略': { meaning: '为面内 Label 生成候选锚点，兼顾大面与当前视窗。', effect: '控制候选数量、网格、扫描上限和面内/视窗回退，候选过多会增加布局工作。', edit: '选择固定、网格或视窗策略；屏幕阈值为 px²，世界网格按世界单位；保留上限和默认回退。', example: '大面跨过视窗时，允许在可见面内选择候选。' },
  '面候选权重与切换': { meaning: '控制多个有效面内候选的排序和切换。', effect: '偏好中心或视窗，避免小幅平移时频繁跳动。', edit: '设置评分模式、边缘惩罚、切换阈值和复用加成；阈值是评分差，按模块单位编辑。', example: '提高复用加成，只有明显更好的位置出现时才切换。' },
  '候选锚点与稳定性': { meaning: '调整几何锚点和上次位置的复用方式。', effect: '影响完整中心/各部件位置与平移、缩放后的稳定性，不能用稳定缓存绕过碰撞或预算。', edit: '锚点偏移用屏幕 px：X 正右负左，Y 正下负上；设置复用及真正需要的失效条件。', example: '向右移 12px、向上移 6px：X=12，Y=-6。' },
  '完整贴线 / CJK 标签算法': { meaning: '配置沿线、路径文字、中文竖排/字形及回退。', effect: '控制采样、转角、字距、预算和重定位，兼顾可读性与拥挤时的成本。', edit: '优先使用预设；长度/字距标注 px，角度为度，世界长度按字段单位；失败回退需明确。', example: '弯曲过大时回退为简单线标签，不强行挤入路径。' },
  '碰撞、密度与回退': { meaning: '配置标注避让、每格/每屏配额及放不下时的结果。', effect: '留白扩大碰撞范围；配额控制密度；选中/必显可按保护选项保留。', edit: '留白和网格用 px，配额为数量；密度降低按编号执行，失败后采用明确回退。', example: '每格最多两条普通标签，仍保留选中的目标。' },
  '自定义候选偏移': { meaning: '增加相对当前锚点的屏幕候选位置。', effect: '默认位置碰撞时可尝试这些位置，并沿用同一碰撞与点击算法。', edit: '输入候选名称及 X/Y；X 正右负左，Y 正下负上，单位 px。', example: '候选“右上”：X=20，Y=-12。' },
  '检测碰撞对象': { meaning: '决定当前 Label 需要避让哪些对象。', effect: '所选对象参与当前 Label 的碰撞检查，未选对象不由该列表要求避让。', edit: '按需要选择符号、不同角色标签或几何；恢复继承使用全局列表，选择顺序不影响结果。', example: '只避让点符号和必显标签，允许经过软标签。' },
  '阻挡标签对象': { meaning: '决定当前已放置 Label 会阻挡哪些后续标签。', effect: '这是向外施加的阻挡，与当前 Label 检测谁是两个方向。', edit: '选择可选、弱、POI、结构等类型；恢复继承使用全局设置。', example: '重要地标阻挡普通 POI，减少重叠。' },
  '缓存失效条件': { meaning: '说明稳定位置在什么变化发生后需要重新选择。', effect: '在可复用时减少位置跳动；实际数据、投影和布局依赖仍必须正确更新。', edit: '选择文本、几何、世界、模式、Zoom 桶或持续失败等变化；恢复继承使用默认策略。', example: 'Label 名称改变后重算，避免旧尺寸导致点击范围不一致。' },
  '密度降低顺序（按选择顺序）': { meaning: '决定标注预算失败后依次尝试哪些降级动作。', effect: '按 1、2、3 执行；不适用项跳过，成功或隐藏/仅几何等终止动作停止。缩略也要重新通过配额。', edit: '点击编号框选择/取消；只用手柄拖动或上下移按钮排序；恢复继承显示实际全局顺序。空覆盖直接采用最终回退。', example: '“隐藏可选”排在“缩略可选”前面时，不会先尝试缩略。' },
  '有效扩展值与来源': { meaning: '核对全局默认、当前规则本地设置及静态合成值。', effect: '便于识别哪个覆盖导致参数改变；不是具体要素全部条件、关联颜色和交互态的最终值追踪。', edit: '此处只读；到对应模块修改本地覆盖或恢复继承，到全局区域修改默认。', example: '全局留白 4px、本规则 8px，静态有效值为 8px。' },
  '全局扩展默认': { meaning: '为该几何类型设置共用的候选、密度和稳定性默认。', effect: '未在具体规则覆盖的参数使用这些值，影响所有相应继承规则。', edit: '按模块单位编辑；想仅影响一个分类时改该规则本地覆盖，恢复规则继承后重新使用全局值。', example: '全局密度网格 96px，单个规则可覆盖为 128px。' },
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
    <p><strong>意义：</strong>{content.meaning}</p><p><strong>效果：</strong>{content.effect}</p><p><strong>编辑：</strong>{content.edit}</p><p><strong>示例：</strong>{content.example}</p>
  </div>, document.body) : null}</>;
}
