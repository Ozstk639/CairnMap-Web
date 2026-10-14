# Runtime-v32 迁移交接（2026-10-07）

## 0. 此文档的用途与优先级

这是给下一次 Codex 对话使用的工程交接记录。它把此前对话中已经确认的产品约束、当前代码核查结果、待修复蓝图和安全边界写入仓库，避免下一次对话只依据旧页面或过时说明文件而返祖。

后续实现的资料优先级如下：

1. 用户在当前及此前对话中明确确认的约束，以及本文件中逐条转录的验收标准。
2. 当前 runtime-v32 工作树的实际 TypeScript 实现和 V1 源实现。
3. V1 的真实配置、schema、渲染规则、信息卡和工作流输出组装器。
4. docs 下已有的历史文档。它们提供背景，但不少 Workflow 文档仍描述旧的 component-executor 时代，不能覆盖 V3.2 的原生组合式工作流目标。

不要把本文件理解为“已经完成”的证明。它记录的是下一轮必须继续完成的规范和经过代码核查的缺口。

## 1. 项目目标

CairnMap 是面向 Minecraft/Dynmap/瓦片世界的结构化 WebGIS 制图与调查框架。当前默认验证项目是 OpenRIAMap RIA。

长期目标：

- 将 V1 的真实要素、显示、信息卡和绝大多数工作流，完整映射到可编辑、可校验、可导入导出的 V3 配置包。
- V3 编辑器不是“选择一个既有 TS 成品包”的壳；除明确保留的极少数专用模块外，用户必须能在表单中编辑字段、卡片、工作流、输出组装与渲染规则。
- 运行器、主地图、Config Lab 和显示规则验证器必须使用同一份 V3 语义与坐标/Zoom 规则。
- 完成并验证上游更新到下游的受控同步；同步只迁移 Config Studio、实验室和相关配置运行时的改动，不覆盖上游其他正常地图、审核、登录、导航等模块。

下一次对话的短期工作：

1. 将当前 runtime-v32 复制到新的独立工作区。
2. 先建立可回滚的 Git/CI 基线和逐项提交链路。
3. 在新工作区重新完成本文件第 8、9 节的修复，优先恢复工作流输出分类字段绑定与组装编辑。
4. 之后再按验收门逐步完成 V1 到 V3 的全量语义迁移、卡片迁移、工作流迁移和上游/下游同步。

## 2. 当前工作树事实（必须先保护）

核查时间：2026-10-07，未对业务代码做本次修改。

| 项目 | 当前值 |
| --- | --- |
| 工作树 | G:/RIAWebGIS/NewPRES/CairnMap_Codex/wt/cairnmap-config-runtime-v32 |
| 分支 | codex/cm-config-runtime-v32 |
| 当前 HEAD | 5447e117a86d01f833bea012c1e0c09440489ff6 |
| HEAD 信息 | 2026-09-28，Merge pull request #25 from Ozstk639/codex/cm-config-studio-v3-parity |
| 工作树状态 | 非干净；在写入本交接文档前已有 28 个已跟踪修改和 15 个未跟踪的 V3.2 文件/目录 |
| 已知基线测试 | npm run build 曾在此前手工回退后通过；其 prebuild 会运行 V1 render baseline、Config Studio V3 和 V3 semantic parity 三组检查 |

重要限制：

- 12:04 的旧状态不是一个 Git 提交、stash 或可验证快照。此前所谓“回退”是逐文件的外科式回退，不能宣称为严格、可证实的完全回退。
- Codex UI 的“撤销”对同一大文件后续又被修改的补丁可能无法套用；此前曾跳过 src/configStudio/ConfigStudio.tsx。它不是 CI/CD 层面的时间点恢复。
- 现有自动化检查通过，只说明当前测试覆盖的契约成立，**不证明**截图中的预览、布局、工作流组装入口等人工体验已经正确。
- 本轮交接不授权 reset --hard、强推、覆盖 main、删除当前 V32 工作树或立即向上游/下游同步。

下一次开始实施前的强制安全步骤：

1. 用当前 V32 创建一个新的独立 worktree/分支，不在这里直接做不可逆操作。
2. 复制完成后，记录 git status、HEAD、diff 统计，并运行 npm run build。
3. 经用户确认后，创建一个明确标注为“迁移前冻结”的本地提交；随后每一修复主题单独提交。
4. 只向新分支推送，不 force-push，不触碰 main。远端 CI 是否存在必须实测，不能假定。

## 3. 关键目录、源文件与可信度

### 3.1 当前 V3.2 实现（下一轮直接维护）

| 路径 | 用途 |
| --- | --- |
| src/configStudio/types.ts | V3 包、分类、字段、渲染、Card、Workflow 的类型契约。WorkflowOutput 已含 classification、assignments、geometry。 |
| src/configStudio/runtime.ts | 包和工作流校验、有效字段解析、分类/几何解析、搜索配置校验。 |
| src/configStudio/package.ts | V3 包导入、升级和序列化兼容层。 |
| src/configStudio/legacyProjectAdapter.ts | V1 真字段/显示/卡片/工作流 schema 到 V3 的迁移器。 |
| src/configStudio/ConfigStudio.tsx | Config Studio 主编辑器。目前是单一要素设计壳，需恢复为“要素设计 / 工作流设计”双标签入口。 |
| src/configStudio/V3WorkflowEditor.tsx | V3 组合式工作流编辑器。控件、选项、搜索、重复组已在这里；**输出 assignments 的可编辑 UI 缺失**。 |
| src/configStudio/WorkflowWorkbench.tsx | 独立草稿的工作流读入、新建、核验、保存、导入导出壳。要整合进 Config Studio 标签页，而非删除其模型。 |
| src/configStudio/WorkflowStudioPage.tsx | 当前独立 workspace 页面。下一轮应改为兼容跳转，不得形成第二套脱节状态。 |
| src/configStudio/V3WorkflowRunner.tsx | 无 eval 的表达式执行、slots、World、tags/extensions 和 outputs 运行预览。 |
| src/configStudio/ConfigLab.tsx、ConfigRuntimePreview.tsx | Config Lab 和显示规则预览；低 Zoom 瓦片、样例多部件、主图一致性都在其边界附近修。 |
| src/configStudio/RenderRuleExtensionsEditor.tsx、v32Defaults.ts | 扩展规则、通用交互和 V3.2 默认值。 |
| src/components/Rules/configRuntime/ | V3 运行时接入层。 |
| src/components/Rules/rendering/ | 当前 V1 渲染、label、碰撞、点击和 Zoom 规则的真实基线。 |

### 3.2 V1 真源（迁移和对照的依据）

| 路径 | 用途 |
| --- | --- |
| src/components/Rules/rendering/featureRenderRules.ts | V1 显示规则真源；由 test-v1-render-baseline.ts 的 hash 和 probes 冻结。 |
| src/components/Common/workflowEditorRegistry/index.ts | V1 标准工作流 schema 汇总。 |
| src/components/Common/workflowEditorRegistry/schema_BUD.ts、schema_FLR.ts、schema_ISG.ts、schema_ISL.ts、schema_ISP.ts、schema_RAIL.ts、schema_ROD.ts、schema_TPP.ts、schema_TRP.ts、schema_WRP.ts | V1 真实字段、输入控件、搜索、重复组、选项、ID 组装相关定义。 |
| src/core/project/workflowTypes.ts | V1 workflow output 的 fieldMappings、computedFields、tagMappings、extensionMappings、idAssembly 类型。 |
| src/core/project/workflowOutputAssembler.ts | V1 输出路径与组装行为的对照源。 |
| src/core/project/workflowPageRuntime.ts、workflowRuntimeResolver.ts | V1 页面/运行时解析对照源。 |
| src/core/project/openriamapRiaWorkflows.ts | V1 项目工作流配置入口。 |
| src/components/Mapping/Workflow/workflowComponentExecutorRegistry.tsx | V1 专用工作流 component executor 注册表。 |

### 3.3 文档目录（背景资料，需辨别年代）

| 目录 | 内容与使用方式 |
| --- | --- |
| docs/00_quick-start | 配置编辑手册、术语、检查清单。可用作编辑习惯参考。 |
| docs/10_authoring-guides | Class、Shared、Workflow、Environment、Preset、Assembly 编辑指南。WorkflowConfigEditingGuide.md 描述旧的 component-executor 模型，不能限制 V3.2 原生工作流。 |
| docs/20_config-reference | 项目包、Preset、Assembly 的格式背景。 |
| docs/30_runtime-contracts | Render/Card/Workflow runtime 边界。WorkflowRuntime.md 亦主要是旧兼容模型。 |
| docs/40_validation-and-audit | 配置、显示、schema、最终清理的审计思路。 |
| docs/50_legacy-compatibility | V1 legacy 兼容说明。用来定位旧行为，不是让标准工作流继续退回 component executor 的授权。 |
| docs/90_roadmap-and-history | 框架抽取路线和本交接文件。 |

根目录 README.md 与 FrameworkExtractionRoadmap.md 明确说旧文档来自框架抽取早期阶段；它们不等于当前 V3.2 产品规范。

### 3.4 验证脚本

package.json 当前相关脚本：

~~~text
npm run test:v1-render-baseline
npm run test:config-studio-v3
npm run test:v3-semantic-parity
npm run verify:config-v32
npm run build
~~~

其中 verify:config-v32 依次跑前三项；build 为 TypeScript/Vite 构建，并通过 prebuild 间接运行上述检查。新修复必须扩展这些测试，不能只维持当前绿灯。

## 4. 已确认的 V3.2 架构决策与不可违反项

### 4.1 分类、字段与 World

- 一条分类链是 Class / Kind / Skind / Skind2；每层可有标识与中文语义，例如 ROD 是道路，ROD/NOM 是普通。这个分类可读性不能丢失。
- 一个分类只选择一种几何类型；若继承父级几何类型，子级保持一致。父级可以暂不指定几何，但最终叶分类在保存总包时必须解析到确定几何。
- World 是必填的系统自动字段，由活动地图世界注入，也是世界读取依据；不能在每条渲染规则中重复手填。
- tags 和 extensions 是默认、不可删除的可选字段组容器。用户自定义字段必须以 tags.xxx 或 extensions.xxx 写入，而不是把 tags/extensions 当作普通顶层文本字段。
- 中文和英文是独立值。en 为空就保持为空，绝不能以 zh 显示或存储作隐式兜底；导入旧草稿/历史 r5 时应清理“英文等于中文”的迁移残留，但保留真实英文。
- Classification 是系统维护的输出分类控件，不是用户可新建的普通表单控件。
- 布尔开关的 UI 表达应是互斥的“是 / 否”，不是只出现一个“是”复选框。

### 4.2 显示与交互

- 一条渲染规则的主体是一个逻辑 Zoom 区间，逻辑 Zoom 范围统一为 0–8；样式、Label、层级、权重和该规则的扩展都归属该区间。
- Point、Line、Polygon 都必须有完整候选/锚点/标签入口；BUD 不能再依赖“近乎不可见点 + 标签装饰圆点”的兼容骗局，而要用真实的 V3 点或面中点渲染。
- ROD 的道路贴线应是可供线要素复用的 route-aligned/贴线能力，并与 ISL 水系贴线的语义区分清楚。
- Label 使用“样式”而不是简单字体。应覆盖 gm-bw-*、gm-outline-*、gm-wtb、structure-label、泡泡/pill 等族；斜体、下划线只在无外框纯文字样式适用时生效。
- 常见默认视觉族：大多数面为白填色黑描边；ROD 为黑填色白描边；水域为蓝描边；另有泡泡风格。迁移审计必须查漏补缺。
- hover、selected、search-result、editing、deleting 的点/线/面交互基准、端点/转角/Pane/点击容差、全局屏幕面积/长度阈值等是跨要素引擎默认或扩展规则覆盖，不应该每条主渲染规则重复提供 editing/navigation 开关。
- profile 与例外覆盖：共用值应进全局引擎默认；真正例外才进各规则的扩展规则。

### 4.3 上下文、建筑/楼层与预览

- 所有要素默认在主地图状态；楼层/建筑关系由“属于楼层/单元、指示字段”等 Context Binding 绑定，而不是逐渲染规则的 floor/editing/navigation 状态。
- 任意楼层状态要素可绑定任意建筑状态要素，反向也可；关系必须可配置。
- 编辑主结构时只显示主结构，不把附属结构作为同尺度预览叠上来；编辑单元时才显示外部主结构预览，且二者必须视觉可分离。
- 预览与真实地图应共享渲染器、Zoom 映射、样例规则和坐标规则。验证器不是只展示一个静态图。

### 4.4 Cards 与工作流

- TRP 和铁路/车站的复杂专用工作流可保留为受控外部整体模块。
- 除此以外，标准工作流必须是 V3 原生组合式、表单可编辑、可核验、可保存、最终效果与 V1 一致；不能以旧 React executor 或占位链接代替。
- 标准信息卡也必须以 V3 组装方式可编辑；TRP 等确有复杂专用卡的例外可保留。
- Workflow 页面顺序固定语义：填写人第一页，若干基本信息页，tags/extensions 尾部区，然后每个输出的一张固定绘制页；基础信息页与控件可拖排，但拖动必须只由手柄触发。
- 选择下拉项的显示文本与最终存储值独立，例如“上行”写入 1、“下行”写入 0。
- 要素搜索没有第二套“粗搜索”概念：搜索字段可多选、展示格式独立（例如 {{ID}} ({{Name}})）、返回字段只能选择一个（通常 ID）。
- 重复字段组支持对象数组与纯值数组。对象数组如 [{ key: value }]；当纯值数组时保存键为空，保存为 [value]。组内字段仍须拥有 select、featureSearch 等各自的详细配置。

### 4.5 操作安全

- 不可通过复制 V3.1 旧 UI 覆盖当前 V3.2 设计。
- 不可将“迁移成功”伪装为仅保留 legacy package、预制包或占位符。
- 任何修复先保持现有 V32 工作树的内容；后续在新工作区操作。
- 当前不做上游/下游同步。同步必须以范围清单和差异审计为前提，避免曾经发生的右上角 panel、审核、登录、导航模块消失式回归。

## 5. 当前实现状态与已经核实的缺口

### 5.1 已存在但不能当作完成

- V3 config contract 已定义 WorkflowOutput：classification、assignments、geometry。
- legacyProjectAdapter 已把 V1 的 fieldMappings、computedFields、tagMappings、extensionMappings、idAssembly 投影到 output.assignments。
- V3WorkflowRunner 已可执行受限表达式，例如 A+"_"+B 以及 join("_",WorldPrefix+Class,A)，写入普通字段、tags、extensions，并注入 World。
- V3WorkflowEditor 已具备：页面顺序、常规控件、select 显示值/存储值、feature search、重复组对象/纯值数组、V3 runner 预览。
- runtime.ts 已对 output 分类、固定几何、assignment target、slot、搜索和组结构做了部分校验。
- current semantic parity 脚本检查了 ROD、ISL、ISG、BUD/FLR 等若干迁移样例，且要求仅铁路、车站、TRP 保留为 external。

这些事实说明“数据结构和部分运行时已经存在”，不说明所有数据都可被用户编辑或屏幕行为正确。

### 5.2 最紧急缺陷：工作流输出字段绑定/组装 UI 丢失

代码核查结论：

- src/configStudio/V3WorkflowEditor.tsx 目前在每个输出区只显示“分类”和“此绘制页固定类型”。
- output.assignments 没有对应的可读、可加、可删、可改、可排序的编辑面板。
- 因而 V1 迁移来的 fieldMappings、computedFields、tagMappings、extensionMappings、idAssembly 虽然仍在 V3 数据中，用户却看不见、不能编辑，视觉上如同“全量丢失”。
- ConfigStudio.tsx 当前把 V3WorkflowEditor 作为兼容入口，显示“工作流设计已移至独立页面”；WorkflowStudioPage 又建立了独立 workspace。这个拆分使工作流保存/草稿和要素设计的连续性不符合既定设计。

这不是应通过“重新挂回旧 component executor”解决的问题。必须补齐原生 V3 输出编辑 UI，并把现有 Workbench 的草稿模型整合回 Config Studio 双标签页。

### 5.3 渲染和预览待修复项

1. Label/点/图片锚点大偏移：
   - 原生 V3 的 center 有时被隐式改成 near。
   - CSS 的方向位移和碰撞布局使用两套不同公式。
   - Y 轴符号反向，center 的布局又忽略 Y 偏移，导致 -12.5px 这种偶然抵消看似正确。
   - 图片 marker 的 iconAnchor、几何点、Label 原点未统一。

2. Config Lab 在 Zoom 0–2 灰屏：
   - 逻辑 Zoom 已映射 0–8，但 Leaflet 允许缩到 -3，而预览瓦片最低只加载 0，故不是规则失效而是 tile range 配置不一致。

3. 多部件“各部件中心”不完整：
   - 已能算多个中心，但 label 缓存只保留第一/一个 Label，后续部件互相覆盖。
   - 需要 feature -> multiple part labels；每个部件独立候选、碰撞、权重、偏移、点击，命中后仍回到同一原要素/信息卡。

4. 显示规则验证器和实际渲染不一致：
   - 外部 Zoom 区间、验证器规则、显示模式/宽度/透明度及地图输出必须互相驱动，不能预览永远沿用旧样式。
   - 容器对齐、左上缩放文案、低 Zoom、样例多部件均需修。

5. BUD：
   - 改为真实 V3 点或面中点规则；不再使用近乎不可见点 + Label 锚点装饰圆点。
   - 以 V1 BUD 在 logical Zoom 0、2、3、5、6、8 做视觉和坐标对照。

6. 字段编辑：
   - 第一行只能是字段名、数据类型、值数量、输入控件。
   - 第二行固定放必填、建立覆盖、删除；控件不能挤出容器。
   - en 迁移/显示必须彻底去掉 zh 兜底。

7. Config Studio 工作流入口：
   - 需要在 workspace=config-studio 顶部恢复“要素设计 / 工作流设计”标签。
   - 任一标签有活跃草稿时，必须保存或放弃才能切换。
   - 工作流面板要有受限高度、真实滚动容器和正常鼠标滚轮。
   - workspace=config-workflow 仅保留兼容跳转，不能拥有另一套未同步草稿。

8. 其他还未验收的 UI/语义问题：
   - tags/extensions 必须是默认字段组，而非顶层具体字段。
   - 统一交互基准的 range 与 number 输入曾重叠，须分开。
   - 预览中主结构/单元尺寸与显示语义需按第 4.3 节修正。
   - DnD 不能劫持输入框选择文字，只允许 grip handle 起拖。

## 6. 工作流恢复与 V1 等效迁移蓝图（优先实现）

### 6.1 不可退化的目标

恢复的是“V3 原生组合式工作流的完整可编辑能力”，不是恢复 V3.1 的旧页面，也不是把标准工作流改回 legacy executor。

保留外部整体模块的唯一范围：

| 外部 reason | componentKey | 覆盖范围 |
| --- | --- | --- |
| railway-integrated | railwayWorkflow | 铁路一体流程 |
| station-integrated | stationWorkflow | 车站/站台等车站一体流程 |
| trp-integrated | tradePointWorkflow | TRP 专用流程 |

其他如 ROD、ISP、ISL、ISG、BUD、FLR、TPP、WRP 及常规通用几何流程必须保持 composed，并由 V3 表单和 output assignments 驱动。

### 6.2 恢复后的页面结构与操作体验

在 Config Studio 顶部增加同一工作区内的两个标签：

~~~text
[ 要素设计 ] [ 工作流设计 ]
~~~

- 两个标签共享同一个已保存 V3 package 和同一草稿生命周期协调器。
- 要素设计保留当前 V3.2 分类、字段、显示、Card、Context Binding 设计，不以旧 V3.1 页面覆盖。
- 工作流设计复用并整合当前 WorkflowWorkbench 的“选择/读取、新建、导入、核验、保存、导出”模型。
- 切换标签时，如果任一侧有活跃草稿，给出明确的保存或放弃操作；未处理不得切换。
- 保存工作流时，先对草稿 workflow 及最终 package 做核验，再写回 workflows，结束活动草稿；不得只缓存 sessionStorage 而不写入包。
- workspace=config-workflow 跳转到 config-studio 并选中工作流标签；可保留 URL 兼容，但不可创建第二个独立编辑状态。
- 工作流编辑区域使用明确的 max-height/min-height/overflow-y-auto，包含鼠标滚轮测试。

工作流内部维持已确认的页面语义：

1. 填写人（固定第一步）。
2. 一个或多个可排序的基本信息页。
3. tags/extensions（固定在绘制前的尾部）。
4. 每个输出一张固定尾部绘制页。

只允许拖动手柄开始拖动页面、控件、组行；input、textarea、select 内的鼠标拖选、滚动和文本选择不得触发卡片拖拽。

### 6.3 新增“输出分类、字段绑定与组装”编辑面板

每一个 WorkflowOutput 都必须有完整的、折叠可收起但默认可见的“输出分类、字段绑定与组装”面板，位于该输出的固定绘制页配置附近。它直接编辑 WorkflowOutput.assignments。

每个输出展示：

- 输出编号和当前分类路径。
- 分类选择器：选择输出默认分类范围；如该分类存在子层，系统自动生成对应 Classification N 控件，用户不可将其作为普通控件新增/删除。
- 固定绘制类型：点、线、面之一，需与目标分类有效几何一致。
- 组装行列表，可添加、删除、排序、复制，并显示校验错误。

每条组装行至少包括：

| 列 | 行为 |
| --- | --- |
| 目标 | 从当前输出的有效字段、tags.xxx、extensions.xxx、允许的系统字段中选择；可通过受控路径编辑 tags/extension 子字段。 |
| 来源/表达式 | 受控表达式构造器：输入槽位、系统字段、固定文本、join 片段。允许保留和编辑既有文本表达式，但禁止 JavaScript eval。 |
| 预览 | 使用当前 runner slots 和 World 显示本行计算结果及最终 record 路径。 |
| 排序/删除 | 仅手柄拖动排序；删除需立即更新 validation，不能无声丢弃其它行。 |

表达式能力需与 V3WorkflowRunner 对齐，而不是另写一个 UI 专用解释器：

- 直接 slot，例如 A。
- 系统字段，例如 World、WorldPrefix、Class、Kind、Skind、Skind2、Creator，以及带输出编号的系统值。
- 文本拼接，例如 A+"_"+B。
- 可选段 join，例如 join("_",WorldPrefix+Class,A,B)。
- tags/extensions 的结构化 JSON/组字段值通过现有受控 runner 解析。

分类变更后的行为：

- 重新计算可选有效字段；目标字段已失效的组装行标记错误并阻止保存。
- 不自动删除旧 assignments，更不能把 V1 迁移映射静默清空。
- 目标分类、固定几何、classification picker 和输出页一对一关系继续由 runtime.ts 验证。

### 6.4 控件、字段与输出的完整映射

下列 V1 语义都应在 V3 editor 中既可查看又可编辑：

| V1 来源 | V3 表达 | 要求 |
| --- | --- | --- |
| fieldMappings | output.assignments 指向普通有效字段 | 字段控件 slot 到目标字段的映射可编辑。 |
| computedFields | output.assignments + 受限表达式 | 不能只展示结果，必须显示表达式和可用 token。 |
| idAssembly | 指向 ID 的 assignment + join/拼接 | 按 V1 各 Class 的公式保留可选段语义。 |
| tagMappings | target=tags.xxx | tags 是默认组，路径和表达式可编辑。 |
| extensionMappings | target=extensions.xxx | extensions 是默认组，路径和表达式可编辑。 |
| 搜索输入 | featureSearch + SearchProfile | 搜索字段多选、展示模板独立、返回字段单选。 |
| 下拉选项 | SelectOption label 与 value | 显示值和保存值必须独立。 |
| 重复组 | group.itemFields + storage | 保留 select/search 配置；对象数组或纯值数组必须正确序列化。 |
| 分类分支 | system classificationPicker | 由输出分类树自动生成，不允许当作一般控件。 |
| 绘制 | 每 output 一个 geometry step | 固定尾部，精确绑定 outputId。 |

V1 的默认 ID 公式当前迁移器已有显式分支，必须保留并增加 fixture：

- BUD / FLR / ROD：WorldPrefix + Class + 可选分类简称 + abbr。
- ISG / ISL / ISP：WorldPrefix + Kind + Skind + Skind2 + abbr。
- TPP / WRP：WorldPrefix + Class + Kind + Skind + abbr。

不得把仅服务 ID 的输入错误写回 extensions.workflow；它们可以作为可编辑 slot 存在，但 persist=false 语义必须完整保持。

### 6.5 V1 到 V3 的迁移实施顺序

1. 盘点：
   - 从 WORKFLOW_EDITOR_SCHEMAS 和 openriamapRiaWorkflows 收集每个 V1 schema/workflow。
   - 为每项记录：分类、几何、页面/控件顺序、字段、选项、搜索、重复组、默认值、必填、ID 公式、tags/extensions、输出路径、是否外部特殊流程。
   - 生成可审计的 manifest；不允许“未识别项默认包容”。

2. 完成 V3 output editor 后，先读取现有迁移结果：
   - 确认每个 output.assignments 均可见、可编辑、可运行预览。
   - 将 V1 旧结构与 V3 assignment 做双向报表：缺失、额外、无法解析、落到不允许路径的项都报错。

3. 逐类 fixture 对照：
   - 针对 BUD、FLR、ISG、ISL、ISP、ROD、TPP、WRP 和通用点/线/面建立输入 slots。
   - 分别执行 V1 输出组装和 V3WorkflowRunner，比较分类、World、ID、普通字段、tags、extensions、重复组、几何。
   - 单独检查 ROD ConnectL 等 group 内的 mode 标签/存储值、tgt featureSearch、数组对象序列化。

4. 特殊工作流：
   - 铁路、车站、TRP 保持 external，但编辑器必须清楚展示其受控原因和覆盖分类，不能伪装成已经可组合编辑。
   - 对它们的配置、最终输出和与 V1 的一致性仍要建立专门对照；“external”不是免于验收。

5. Card 迁移与 Workflow 迁移分开审计：
   - 标准 Card 用 V3CardRenderer/V3CardEditor 组装；TRP 等专用卡例外单列。
   - 不允许因为工作流 UI 修复而破坏 Card、Review、Map、Settings 等上游既有模块。

### 6.6 工作流验收门

在宣布工作流恢复前必须同时满足：

- 选中任一标准 V1 工作流，能看到对应输出分类、固定绘制类型和所有 assignments。
- 任意 assignment 可改目标/表达式，保存后导出、重新导入和 runner 输出一致。
- V1 所有标准 schema 的 fixture 均通过 V1/V3 输出对照。
- ROD 的 select 显示/存储映射、ConnectL group、tgt featureSearch 实测通过。
- 搜索只保留 featureSearch 语义，返回字段单选。
- 空 en 不显示 zh，tags/extensions 不被变成顶层字段。
- 无法保存无效分类、无效几何、无效 target、未知 token、重复 slot、无效搜索或无效 group。
- 仅铁路/车站/TRP 为 external；其他标准工作流不可悄悄退回 legacy component。
- Config Studio 两标签草稿门、滚动、导入导出、保存/放弃行为实际操作通过。

## 7. 渲染、预览、字段与工作区修复蓝图

### 7.1 统一锚点、九方向与 X/Y 偏移

创建并强制复用一个共享 anchor/placement 函数。它的输入至少为 feature 或 part 的渲染锚点、Label/marker 尺寸、九方向位置、offsetX、offsetY；输出为真实 CSS/Leaflet 坐标、碰撞包围盒、点击区域所用的同一坐标。

统一定义：

- offsetX 正数向右、负数向左。
- offsetY 正数向下、负数向上。
- 支持中心、上、下、左、右、左上、右上、左下、右下九个位置。
- center 不得自动改写为 near。
- 图片 marker 的 iconAnchor、几何点、Label、碰撞、点击、Config Lab 预览和主地图都调用此算法。

用表驱动测试覆盖九方向和 X/Y 正负值；再以 V1 BUD 在 Zoom 0、2、3、5、6、8 进行人工截图/坐标对照。

### 7.2 Config Lab 低 Zoom 与主图一致性

- 逻辑 Zoom 固定 0–8；规则区间、按钮文字、Leaflet Map Zoom 和 tile 请求一律通过同一个映射。
- 预览与主地图复用 minZoom、minNativeZoom、maxNativeZoom 等瓦片层参数，避免 Leaflet 可缩至 -3 而无底图。
- 低 Zoom 0、1、2 不得灰屏；若数据源确实无瓦片，显示明确的源错误而不是让规则验证器沉默。
- 容器需随面板尺寸重算；缩放标签应表示逻辑 Zoom，不显示误导性的 Leaflet 原始 Zoom。

### 7.3 多部件

- overall center：只产生一个整体锚点/Label。
- each component center：每个点、线段、面部件独立产生几何显示和 Label，独立参加候选、碰撞、权重、偏移、点击。
- label cache 从 feature -> one label 改为 feature -> many labels，不能互相覆盖。
- 点击任一部件仍定位同一个原始 feature 和信息卡。
- 验证器场景必须有真正的多部件样例，不得用带洞单面代替。

### 7.4 BUD、Label 与预览

- BUD 在点/面中点模式下使用真正的几何符号与标签，不再使用“标签锚点装饰圆点”兼容逻辑。
- 对每个 Label 规则提供明确的锚点、九方向位置、X 偏移、Y 偏移、Label style、主来源、回退来源、截断/候选/密度等配置入口。
- 缺失主来源或字段不存在时 Label 的值应为 Null/空，不得用无关保险字段悄悄兜底。
- 圆点、符号与文字位置是独立可配置职责，不能用“文字前/后”偷换成方向锚点。

### 7.5 字段、tags/extensions、上下文和全局交互

- FieldEditor 用两行布局：第一行四项；第二行固定放必填、建立覆盖、删除。
- 标题、下拉框应紧凑且可换行，避免删除按钮离开容器。
- tags/extensions 永远显示为默认可选组卡片，其容器不可删除，用户只能添加/删改内部字段。
- 统一交互基准的每个数值 slider 与 number input 使用独立布局，不允许轨道跨越其它列。
- 建筑/单元预览按第 4.3 节的主从关系显示，主结构与附属结构不可同尺度叠在一起。

## 8. 建议实施拆分与提交顺序

每一步完成后运行相关测试和 npm run build；不要以一轮巨型改动覆盖所有模块。

1. 建立复制工作区、冻结提交、基线 build 和 CI 分支。
2. 把 WorkflowWorkbench 整合为 Config Studio 双标签，先完成草稿门和滚动，不丢现有 workflow 数据。
3. 新建 WorkflowOutputEditor，恢复 assignments 读写、表达式构造器和输出预览。
4. 为 V1 schema/workflow 建 manifest 和 V1/V3 output fixtures；修迁移器直到标准工作流一致。
5. 提取共享 anchor/placement 算法，修九方向、X/Y、iconAnchor、BUD。
6. 修 Config Lab 低 Zoom 瓦片与主图映射一致性。
7. 重构 multipart labels/cache/click。
8. 修 FieldEditor、en 标准化、tags/extensions、交互滑条和 Context preview。
9. 扩展自动化和人工验收清单，完成前不做上游/下游同步。

每个提交的标题应能说明主题，例如：

~~~text
chore(v32): freeze migration baseline
feat(workflow): restore editable output assignments
test(workflow): add V1 output parity manifest
fix(render): unify label anchor placement
fix(preview): share logical zoom tile bounds
~~~

## 9. 强制验收清单

### 自动化

- V1 frozen render baseline 仍通过，除非有明确 V1 review 更新 hash。
- Config package、workflow、renderer 的 unit/contract tests 覆盖新增行为。
- V1/V3 workflow output manifest 与每项 fixture 对照通过。
- 正负 X/Y、九方向、center 不改 near、低 Zoom 瓦片范围、多部件 label 数量、点击回原 feature、英文空值、未保存草稿阻止切标签都有测试。
- npm run verify:config-v32 与 npm run build 均通过。

### 人工体验

- BUD 在 Zoom 0、2、3、5、6、8 的主图与验证器输出一致。
- 改变渲染规则的显示类型、大小、颜色、描边、透明度、标签位置、X/Y 后，验证器立即以相同规则改变。
- Zoom 0、1、2 有真实底图而非灰屏。
- 多部件各部件中心出现多个 Label；整体中心只一个。
- 字段卡没有溢出，按钮可点击；en 为空确实为空。
- Config Studio 顶部有两个标签；未保存草稿不能切换；工作流区滚轮正常。
- 标准工作流可完整编辑并生成与 V1 相同的 record；外部工作流范围只有铁路、车站、TRP。

## 10. 上游/下游同步的后续策略（本轮不执行）

问题背景：V32 是基于 V31 的 CairnMap 工作树；GitHub main/上游整体应用含有更完整的右上角 panel、审核、登录、导航等 UI。以前将不同历史的仓库/工作树混用会造成这些模块“消失”的严重回归。

未来同步前：

1. 分别列出上游 main、下游运行仓、V32 新工作区的 commit、diff、未跟踪文件和入口路由。
2. 只建立 “Config Studio / Config Lab / V3 runtime / tests / docs” 的迁移清单。
3. 逐文件三方比较，明确每个冲突该以哪个版本为主；不能用一个目录整体覆盖另一个仓库。
4. 每次合并后验证：顶部 panel、审核、登录、导航、地图、Config Studio、Config Lab、V3 workflow 全部仍存在。
5. 保留新分支 CI 成功记录后再提合并；不得 force-push 或用 reset 覆盖上游历史。

## 11. 给下一位实施者的禁止事项

- 不要把 V3.2 工作流重新压缩为“componentKey 选择器”或仅能打开旧页面。
- 不要把 output.assignments 继续藏在 JSON/迁移器里而不给 UI。
- 不要用 V3.1 旧页面覆盖 V3.2 当前布局。
- 不要将 tags/extensions 变为普通顶层字段，不要让 en 从 zh 回退。
- 不要用近乎不可见 BUD 点加标签圆点来伪造点显示。
- 不要让预览器和真实运行器各用一套 zoom、label、collision、anchor 或 tile 参数。
- 不要仅让静态测试绿灯就宣称截图问题解决；需有共享算法测试和人工对照。
- 不要在未建立冻结基线前运行 destructive Git 命令、推送或同步。

## 12. 交接结论

当前 V32 已经具备原生 V3 contract、部分运行器、迁移器与测试骨架，但仍处在“数据存在、编辑入口和运行表现不完整”的中间状态。下一轮第一优先级是安全建立新工作区和 CI 链，再恢复 workflow output assignments 的可编辑 UI 与 V1 等效对照；随后以共享渲染坐标、低 Zoom、多部件、字段规范和双标签工作区为修复主线。
