/**
 * Frozen semantic inventory for the V1 renderer.
 *
 * It intentionally records the production rule identities and visual
 * families, not a converted V3 package.  The later semantic migrator must
 * consume this inventory and prove V1/V3 equivalence; V32 must not silently
 * treat a partial adapter output as that proof.
 */
export const V1_BEHAVIOR_BASELINE = {
  schemaVersion: 'cairnmap.v1-render-baseline.v1',
  /** Any V1 rule-source change must be an explicit, separately reviewed decision. */
  featureRuleSourceSha256: 'fcbbb9c64e817c04e7c4c883c9badb7e64ad360536acf869dadcfb643a9f30e9',
  zoomModel: { leafletZoomToLevel: 'round(leafletZoom + 3), clamp 0..8' },
  displayContexts: ['normal', 'navigation', 'floor', 'editing', 'preview', 'debug'],
  labelFamilies: [
    'gm-bw',
    'gm-outline',
    'gm-wtb',
    'structure-label',
    'bubble-dark',
    'rle-line',
    'rle-pill',
  ],
  probes: [
    { classCode: 'RLE', geometry: 'Polyline', ruleName: '铁路 RLE：direction 缩放控制', note: '线路方向、线路色沿线文字与线路色胶囊' },
    { classCode: 'ROD', geometry: 'Polyline', ruleName: '道路 ROD：缩放阈值控制 + 沿线 label', note: '道路缩放门控与 gm-bw 沿线文字' },
    { classCode: 'PFB', geometry: 'Polygon', ruleName: '站台轮廓 PFB：按线路色渲染（补#）', note: '按关联线路颜色描边的站台轮廓' },
    { classCode: 'STB', geometry: 'Polygon', ruleName: '车站建筑 STB：zoom 3-5 点+label；zoom>5 结构轮廓 + label', note: '建筑结构低缩放点/高缩放轮廓' },
    { classCode: 'BUD', geometry: 'Polygon', ruleName: '建筑 BUD：zoom 3-5 点+label；zoom>5 结构轮廓 + label', note: '建筑结构与楼层上下文' },
    { classCode: 'STA', geometry: 'Points', ruleName: '车站点 STA：zoom 4-5 正常显示；zoom>=6 若与可显示 PLF 重合则兜底显示', note: '站点与站台重叠时的兜底显示' },
    { classCode: 'PLF', geometry: 'Points', ruleName: '站台点 PLF：zoom>=6 点颜色读取所属第一个线路 color', note: '站台点按所属线路颜色渲染' },
    { classCode: 'STF', geometry: 'Polygon', ruleName: '楼层 STF：楼层视角下按 NofFloor 选择（同 NofFloor 允许多面同时显示）', note: '当前默认楼层分类的多面选择' },
    { classCode: 'FLR', geometry: 'Polygon', ruleName: '楼层 FLR：楼层视角下按 NofFloor 选择（兼容 STF/FLR 上行索引）', note: '楼层选择器与附属结构筛选' },
    { classCode: 'SBP', geometry: 'Points', ruleName: '车站建筑点 SBP：外部图标 + 存在性隐藏（示例，可按需改写）', note: '建筑点图标与存在性隐藏' },
    { classCode: 'ISP', geometry: 'Points', ruleName: '地物点 ISP：圆点 + label', note: '点符号与气泡标签' },
    { classCode: 'ISL', geometry: 'Polyline', ruleName: '地物线 ISL：线 + label', note: '通用地物线分类样式' },
    { classCode: 'ISG', geometry: 'Polygon', ruleName: '地物面 ISG：面 + label', note: '通用地物面分类样式' },
    { classCode: 'TRP', geometry: undefined, ruleName: '交易点 TRP：STA 风格（绿色圆心，zoom>4）', note: 'TRP 专用交易点逻辑' },
    { classCode: 'TPP', geometry: undefined, ruleName: '传送点 TPP：STA 风格（橙色圆心，zoom>4）', note: '传送点专用逻辑' },
    { classCode: 'WRP', geometry: undefined, ruleName: '传送点 WRP：STA 风格（橙色圆心，zoom>4）', note: '世界传送点专用逻辑' },
    { classCode: undefined, geometry: 'Points', ruleName: '点要素（示例）：若 featureInfo.iconUrl 存在则使用外部图标，并在附近显示 name label', note: '未分类点的默认兜底' },
    { classCode: undefined, geometry: 'Polyline', ruleName: '通用：Polyline 默认样式', note: '未分类线的默认兜底' },
    { classCode: undefined, geometry: 'Polygon', ruleName: '通用：Polygon 默认样式', note: '未分类面的默认兜底' },
  ],
} as const;

export type V1BehaviorBaseline = typeof V1_BEHAVIOR_BASELINE;
