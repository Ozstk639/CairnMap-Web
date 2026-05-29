# CairnMap 配置术语表

本文档解释 CairnMap 配置手册中常见术语。

| 术语 | 含义 |
|---|---|
| Assembly | 配置组装入口，决定加载哪些 package / preset。 |
| Package | 一个配置包，可包含 environment、shared、classes、workflows。 |
| Project package | 项目专属配置包，通常包含 environment。 |
| Preset | 可复用配置包，通常包含 classes、workflows、shared。 |
| nativePreset | CairnMap 原生/内置风格 preset，优先级低于 project package。 |
| classCode | 地物类型代码，例如 `STA`、`RLE`、`BUD`。 |
| classKey | 更可读的地物类型 key，例如 `station`。 |
| schemaVersion | 配置文件的结构版本号。 |
| runtimeStatus | 运行状态标记，当前正式配置通常应为 `active`。 |
| sourceRuntimeField | 对应旧数据或运行时字段名。 |
| display profile | 可复用显示配置，定义可见性、anchor、label、collision 等。 |
| label style | label 样式 token，例如字体、描边、填充颜色。 |
| card layout | 信息卡布局定义。 |
| card enhancement | 信息卡特殊增强，由 TS executor 实现，JSON 只引用 key。 |
| workflow component | 测绘/编辑工作流组件，由 `componentKey` 引用。 |
| componentKey | JSON 中引用 TS component executor 的 key。 |
| legacyWorkflowKey | 旧工作流名称或兼容 key。 |
| blockRunnerReady | 表示是否已可由未来 block runner 直接运行；当前通常为 `false`。 |
| futureBlockTemplateRef | 未来 block runner 模板引用。 |
| executor | 执行复杂逻辑的 TS 代码。 |
| facade | 对外保持旧 API 形状，但内部转向配置驱动的薄层。 |
| runtime contract | 配置与 runtime 之间的契约说明。 |
| feature link | 信息卡字段链接到另一个地物的配置。 |
| shared root JSON | 旧的 `shared/*.json` 根目录副本，已清理，不允许恢复。 |
| validation | 检查 JSON 结构和引用是否正确。 |
| audit | 检查架构边界是否倒退，例如定义是否回流 TS。 |
