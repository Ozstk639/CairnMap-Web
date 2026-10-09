# V3.2 前端、运行时与编辑器实施记录

用户已于本轮明确授权按[整合蓝图](G:/RIAWebGIS/NewPRES/CairnMap_Codex/wt/cairnmap-config-runtime-v32-migration-20261007/docs/90_roadmap-and-history/RuntimeV32_Frontend_Runtime_Editor_Implementation_Blueprint_2026-10-09.md)生成功能。仅本地提交，不推送，不改 main/RIA；基线 `0c659f99288f3bf33cf0b8c0678c0b6ab1e57c72`。

状态：实施中，尚未完成全部蓝图或首次转正。

## BP01：实验室模块入口

- 所有工作区统一挂载一份按需模块启用弹窗和加载反馈；弹窗有可访问身份并限制高度。
- 补手机“模式工具”的测绘/测量入口。真实冷启动还发现 Mtools 挂载时把初始 closeSignal 当成关闭请求，取消待打开动作；改为只响应后续变化。恢复手机测量操作/结果面板。
- 截图复核发现整个模块原先位于桌面隐藏容器中，手机面板仍不可见；模块主体现移到公共位置，仅将启动按钮 portal 到桌面工具栏。手机测绘菜单也独立显示。可见性验收已从 DOM 存在加强为真实尺寸和绘制后截图。
- `npm run verify:config-v32`、`npm run build` 通过。真实 App/ConfigLab 的 V3 桌面测绘、V3 390×844 测量及测绘、V1 桌面测量首次启用/取消/重新启用以及 V3 热缓存免重复弹窗通过，未发现运行异常。
- 证据：[module-entry-result.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/module-entry-result.json)，同目录保存截图和 BP01 核验/构建日志。工具入口通过实际 DOM 处理器；手机菜单和弹窗按钮使用鼠标事件，避免菜单动画时坐标漂移。
- 加载失败/重试、实际工作流提交/临时挂载的完整浏览器链路留待 BP10 综合验收；不会将本阶段已通过项冒充全部入口场景通过。

## BP02：有效配置编译快照和继承索引

- 有效活动配置与编辑对象分离并冻结；配置对象身份隔离同 revision 的不同内容。分类按 Class 索引，祖先、有效字段、几何/信息卡继承、可选字段及扩展合成结果缓存，不反复扫描全树。
- 编辑对象保留原生解释路径，修改后必须经过新的激活快照，避免缓存与可变草稿混用。未知数据分类路径缓存有界，不无限增长。
- 新专项逐分类对照旧解释路径、快照隔离、同修订号编辑、热命中和缓存上限通过，已加入统一核验。`npm run verify:config-v32`、`npm run build` 通过。
- 后续 BP03/BP04 衔接 Zoom 候选桶和动态要素绑定；本阶段不声称整套性能目标已达成。

后续：BP03–BP10 按蓝图继续实施，逐主题记录验证和本地提交。
