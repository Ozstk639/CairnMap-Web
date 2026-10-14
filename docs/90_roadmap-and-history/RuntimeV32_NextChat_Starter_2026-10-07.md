# 新对话启动提示：Runtime-v32 迁移与修复

请先完整阅读仓库中的交接文档：

~~~text
G:/RIAWebGIS/NewPRES/CairnMap_Codex/wt/cairnmap-config-runtime-v32/docs/90_roadmap-and-history/RuntimeV32_Migration_Handoff_2026-10-07.md
~~~

你正在维护 CairnMap 的 V3.2 配置工作台。目标不是退回旧的 component-executor 或 V3.1 页面，而是完成可编辑、可校验、可导入导出的 V3 新规范，并保持 V1 的真实行为和结果。

当前基线事实：

- 现有 V32 工作树路径：G:/RIAWebGIS/NewPRES/CairnMap_Codex/wt/cairnmap-config-runtime-v32
- 分支：codex/cm-config-runtime-v32
- HEAD：5447e117a86d01f833bea012c1e0c09440489ff6
- 工作树不是干净状态，且 12:04 没有可证明的 Git 快照。不要声称它已被精确回退。
- 先复制 V32 到新的 worktree/分支，再记录 status/HEAD/diff、运行 npm run build，并在获得授权后创建迁移前冻结提交。
- 本轮不要直接同步上游/下游，不要 reset --hard、force-push、覆盖 main 或用 V3.1 旧界面替换 V3.2。

第一优先级任务：

1. 恢复 Config Studio 内的两个顶级标签：要素设计、工作流设计。
   - 复用当前 V3.2 ConfigStudio、WorkflowWorkbench、V3WorkflowEditor 的模型；
   - 工作流草稿和要素草稿必须在保存或放弃后才能切标签；
   - workspace=config-workflow 仅作兼容跳转，不能有独立脱节草稿；
   - 工作流面板必须限制高度并可滚轮滚动。

2. 恢复完整的工作流“输出分类、字段绑定与组装”编辑 UI。
   - 当前 V3 数据/runner 中的 WorkflowOutput.assignments 仍在，但 V3WorkflowEditor 只显示分类和固定几何，导致用户无法查看或编辑 V1 迁移的 fieldMappings、computedFields、tagMappings、extensionMappings、idAssembly。
   - 为每个 output 设计可编辑 assignment 面板：目标字段或 tags/extensions 路径、受控表达式/slot/system token、预览、添加/删除/排序和保存校验。
   - 不使用 eval；保持 V3WorkflowRunner 的安全表达式语义。
   - 保留 select 的显示文本与保存值分离、featureSearch 的多搜索字段/展示模板/单返回字段、重复组对象数组或纯值数组。
   - 仅铁路、车站、TRP 可维持 external；ROD、BUD、FLR、ISP、ISL、ISG、TPP、WRP 等标准工作流必须是原生 composed。
   - 基于 V1 workflow schema 和 workflowOutputAssembler 建立逐项 fixture 对照，不允许只有迁移“看起来有数据”。

接着修复显示与预览：

- 统一 Label/图片/几何锚点、九方向、X/Y 偏移：X 正右负左，Y 正下负上；center 不得改 near；render、collision、click、Config Lab、主图共享同一算法。
- BUD 改为真实 V3 点/面中点显示，不可再靠近乎不可见点加标签圆点；在 V1 Zoom 0、2、3、5、6、8 对照。
- 修 Config Lab Zoom 0–2 灰屏：逻辑 Zoom 0–8、主图/预览 tile minZoom/minNativeZoom/maxNativeZoom 与显示规则必须共享映射。
- 完成多部件各部件中心：每个部件独立几何/Label/候选/碰撞/点击，缓存为 feature -> multiple labels；整体中心仍只有一个。
- FieldEditor 第一行只保留字段名/类型/值数量/输入控件，第二行放必填/建立覆盖/删除；en 永远不从 zh 兜底；tags/extensions 是默认不可删除字段组。

关键限制：

- World 是活动世界自动注入的系统字段，不要在每条渲染规则重复设置。
- 渲染规则按逻辑 Zoom 区间（0–8）组织；全局交互和通用阈值放全局引擎/扩展规则。
- 页面/输入拖动只能由 grip handle 触发。
- 无法保存无效分类、几何、assignment target、未知 token、重复 slot、无效搜索或无效重复组。
- 不要将旧/过时 docs 中“workflow 只能调度 component executor”的说法当作 V3.2 限制；交接文档和当前代码/用户要求优先。

每个修复主题单独提交并运行：

~~~text
npm run verify:config-v32
npm run build
~~~

完成前必须提供自动化和人工验收：正负 X/Y、九方向、低 Zoom、多个部件 Label、英文空值、未保存草稿切标签阻断、主图/验证器同规则输出，以及 V1/V3 工作流最终 record 对照。
