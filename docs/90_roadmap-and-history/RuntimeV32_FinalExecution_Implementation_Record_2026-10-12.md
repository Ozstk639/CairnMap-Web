# 最终蓝图实施记录

用户于 2026-10-12 授权实施 RuntimeV32_CategoryManagement_Prefill_Editing_FinalExecution_Blueprint_2026-10-12.md。范围为该文件全部要求，只做本地提交，不推送、不更新 main/RIA。

迁移前代码 HEAD：173ec6412e361277393eb573f767266ddded015b。代码干净，只有已批准的完整蓝图和最终蓝图未跟踪。旧 r8/r4 JSON SHA256：ffcf77938eb83ea7054ebde4bdbe42980c36cde73c4cad864af5e329a216a2f5。

证据目录：runtime-v32-final-execution-20261012。baseline-status/head/tracked.diff 与 baseline-verify/build.log 记录实际基线；baseline-isolated-browser-state.json 仅来自独立 CDP 验收浏览器，不是用户浏览器状态。禁止据此声称用户草稿已备份或启用新包。

## 分主题状态

| 主题 | 状态 |
| --- | --- |
| 基线冻结与原件保留 | 30 组 verify 与 build 已通过（保留既有大分块警告） |
| 输入可见性、重复设置 | 已完成：verify/build；真实 1440/390 DOM 边框及单一设置入口通过，零运行错误 |
| 默认种子和活动配置统一 | 已完成：verify/build；独立新浏览器六条持久性路径通过，零运行错误 |
| r9 迁移、一次性预填、纯净字段/卡片 | 已完成：31 组 verify/build；5130 渲染结果、34 完整 V1 records、98 独立 V1 卡片相等；真实控件和卡片预填/保存通过 |
| 唯一分类入口、三模式/四同步/冲突报告 | 已完成：32 组 verify/build；创建/继承/一致跳过/重命名和依赖阻断单测；真实 Class/Kind 创建、失败隔离及保存回读通过 |
| 分类文件、Class 树替换事务 | 已完成：33 组 verify/build；JSON/ZIP、祖先/固定字段/摘要/过期基线单测；真实 ZIP 六条内外保存、刷新、放弃、冲突和原子保存案例通过 |
| 条件公式、值分类设色 | 已完成：34 组 verify/build；真实公式和设色保存刷新通过 |
| 工作流编辑资格、回填、更新状态机 | 已完成标准体系：35 组 verify/build；16 次转换、32 条 V1 记录及真实编辑状态机通过；专用迁移另见后续主题 |
| 铁路/车站七 Class 编辑迁移 | 已完成：36 组 verify/build；七个完整冻结 V1 编辑记录及七类真实前端保存逐一相等，方向反转通过 |
| TRP 外部编辑成品和用途入口 | 待实施 |
| 最终包、默认安装、全量浏览器验收 | 待实施 |

每主题记录本地提交、两项规定检查和浏览器/数据验收证据。未完成项目不能在报告中标为完成，上一轮验收证据不替代本轮新功能验证。

基线冻结提交：58f07d1。主题 01 证据：theme-01-verify/build.log、r9-editor-surface-acceptance.json、r9-editor-visible-inputs.png。测试脚本覆盖真实 DOM 而不是只搜索源码。

主题 01 提交：f18d29b。主题 02 发布原 r8/r4 JSON 为独立资源，SHA256 与原件相同，活动选择和包版本同事务提交，恢复副本不覆盖 latest。六条浏览器证据见 r9-default-config-acceptance.json；CDP 9240 为工作树 .cache 下新独立 Edge profile。

主题 02 提交：35998e3；Windows 摘要资源 EOL 固定提交：f373cdb。主题 03 证据见 theme-03-verify/build.log、r9-prefill-acceptance.json；增加 test:r9-migration-prefill 到统一验证。r9迁移先展开旧有效值再去来源关系；字段默认值/提示移出，TPP 条件记录约束保留。默认资源仍为冻结 r8/r4，最终全部新能力通过后再安装 r9/r5。

主题 03 提交：0eb954e。主题 04 证据见 r9-category-creation-acceptance.json、test:r9-category-initialization 和 theme-04 检查日志。传递中的父级字段作为基底保留；模板仅增量加入；字段 key 冲突重写同次复制的显示/卡片引用。旧重复 Class/子分类入口已移除。

主题 04 提交：f4f3f59。主题 05 证据见 r9-category-tree-acceptance.json 和 test:r9-category-artifact。真实测试修复了内部读取错误复制主包、内部保存未先完成恢复记录写入的问题。外层同 Class 整体替换，范围外内容保留；实际持久事务拒绝过期 expected 配置。草稿用 IndexedDB 保存，避免多层完整树超出 sessionStorage 容量。

## 主题 6：条件公式与字段值设色

- 父提交：2735526。条件在规则头部统一以稳定编号、前置关系和受控公式编辑；自动 NOT 为 AND NOT，手动公式排序不改写。命名组循环、未知引用、分类字段/别名、非法标量值、预算和可证明矛盾阻断。旧 AST 在 r9 迁移时等价展开。
- 公式在配置激活时编译，冻结实例复用 AST/条件索引；按字段保存值设色共享类型严格的索引和回退，编辑入口复用于几何、支持取色的 Label、规则交互覆盖。
- `npm run verify:config-v32`：34 组通过；`npm run build`：通过，仅现有体积告警。新增真假表、解析预算、旧 AST 匹配集合、0/false、非法映射、实际渲染/交互对照验证。
- 独立 Edge 真实 DOM：前置关系、自动/手动模式、稳定编号排序、删除引用报错、记录预览、设色保存及刷新回读通过，运行错误 0；证据 `r9-render-acceptance.json`、`r9-formula-color.png`。
- 后续：标准再编辑、铁路/车站七类模板、TRP 外部编辑、最终 r9/r5 包与全量验收尚待完成；本条不代表整轮已交付。

## 主题 7：标准工作流式再编辑

- 父提交 13bb5c2。独立便捷测绘可见性、编辑资格阻断弹窗、依赖分析与显式回填；只移除真正 ID 专用的控件，复用当前输入/搜索/重复组和固定标签扩展单元。
- 以原记录为基底更新变动字段、最新多部件几何和编辑元信息；不运行创建 ID/默认值重算。世界、ID 占用、无法安全重写的外部引用、记录和几何合法性先校验，再走原图层替换与索引刷新。
- 35 组 `verify:config-v32` 与 `npm run build` 通过。16 个资格转换、32 个完整 V1 原记录无修改/改名保存、元信息/未知内容、世界与 ID/引用阻断测试通过。
- 真实 DOM：WRP 资格成功、TPP 失败且开关保持关闭、模态背景锁定；实际图层编辑 ID 顶行、回填、直接绘制、取消恢复、单图层替换保存、世界暂停/恢复通过。`r9-workflow-edit-acceptance.json`，运行错误 0。
- 实际回归发现 V3 canonical World 字符串被旧 V1 数字 World 导入校验拒绝；增加仅在 V3 上已知世界码的校验转换，输出保留原 canonical World，未知世界不猜测。
- 本主题保留原整体采集与无适用方案的完整编辑入口；铁路/车站七 Class 与 TRP 成品迁移、默认 r9/r5 尚未交付。

## 主题 8：铁路/车站七 Class 编辑迁移

- 父提交 770df82。按冻结 V1 `schema_RAIL` 的 editor 投影迁移 RLE、STA、PLF、PFB、STB、SBP、STF 七个独立 composed 方案，全部专供编辑；普通整体采集不变。
- 使用冻结 V1 实际 parser/formatter/buildFeatureInfo 生成七类独立完整参照（`v1-rail-editing-reference.json`），其控制顺序、布尔/数字/方向保存值、必需性、重复组，以及真实更新记录逐一对照通过。
- 未显示的 Wiki/brief 由通用标签扩展单元保留；缺省 optional 组在显示上为空行组，保存仍保留缺省/空数组的原始区别；铁路反转同时交换新编辑槽位端点。
- 前端发现旧 V1 导入器拒绝复杂 extensions；V3 改用 `prepareNativeFeatureImport` 检查真实分类、字段、世界、几何与安全标签扩展，并保留原记录内容，不经旧表单序列化；V1 导入行为不变。
- 36 组 `npm run verify:config-v32` 与 `npm run build` 通过。真实 DOM 对七类分别回填和保存，完整 record 与冻结 V1 编辑结果相等，0/false 与未知数据保留，始终七个原图层；RLE 实际反转和便捷测绘列表排除通过。证据 `r9-rail-edit-acceptance.json`，运行错误 0。
- 冻结参照代码 SHA256：schema_RAIL 86292b74409837302309c9aeedeef804635d7a9710096db2d25d7b5b5f619626；workflowEditorParser 2b3c26fff1629fa4a88c0f81cf02164d19ee5bd7a7eb12b2e2184567e312c25b；featureFormats bb6bebd36e72dad465bcdc1b2b7cdf644cad72b15eebf90ff24443bfe6a6f8bc。
- TRP 外部成品、默认 r9/r5 发布和最终全量验收仍待完成。
