# V3.2 前端、运行时与编辑器实施记录

用户已于本轮明确授权按[整合蓝图](G:/RIAWebGIS/NewPRES/CairnMap_Codex/wt/cairnmap-config-runtime-v32-migration-20261007/docs/90_roadmap-and-history/RuntimeV32_Frontend_Runtime_Editor_Implementation_Blueprint_2026-10-09.md)生成功能。仅本地提交，不推送，不改 main/RIA；基线 `0c659f99288f3bf33cf0b8c0678c0b6ab1e57c72`。

状态：**BP01–BP10 已实施，本轮自动核验通过；等待用户人工验收。首次转正未执行。**

源码及可复现核验脚本提交：`a64c04c51a6ad9ace730f3eb279f5d1b2650880f`。后续交付归档提交只补文档与证据。新交付为原生 contract r7、包 revision 3；历史 r6/r2 仍保留。

## BP01：实验室模块入口

- 所有工作区统一挂载一份按需模块启用弹窗和加载反馈；弹窗有可访问身份并限制高度。
- 补手机“模式工具”的测绘/测量入口。真实冷启动还发现 Mtools 挂载时把初始 closeSignal 当成关闭请求，取消待打开动作；改为只响应后续变化。恢复手机测量操作/结果面板。
- 截图复核发现整个模块原先位于桌面隐藏容器中，手机面板仍不可见；模块主体现移到公共位置，仅将启动按钮 portal 到桌面工具栏。手机测绘菜单也独立显示。可见性验收已从 DOM 存在加强为真实尺寸和绘制后截图。
- `npm run verify:config-v32`、`npm run build` 通过。真实 App/ConfigLab 的 V3 桌面测绘、V3 390×844 测量及测绘、V1 桌面测量首次启用/取消/重新启用以及 V3 热缓存免重复弹窗通过，未发现运行异常。
- 证据：[module-entry-result.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/module-entry-result.json)，同目录保存截图和 BP01 核验/构建日志。工具入口和手机菜单通过实际 DOM 处理器；弹窗按钮使用鼠标事件。检查实际尺寸及绘制后的截图，避免隐藏祖先或菜单动画导致误判。
- 加载失败/重试、实际工作流提交/临时挂载的完整浏览器链路留待 BP10 综合验收；不会将本阶段已通过项冒充全部入口场景通过。

## BP02：有效配置编译快照和继承索引

- 有效活动配置与编辑对象分离并冻结；配置对象身份隔离同 revision 的不同内容。分类按 Class 索引，祖先、有效字段、几何/信息卡继承、可选字段及扩展合成结果缓存，不反复扫描全树。
- 编辑对象保留原生解释路径，修改后必须经过新的激活快照，避免缓存与可变草稿混用。未知数据分类路径缓存有界，不无限增长。
- 新专项逐分类对照旧解释路径、快照隔离、同修订号编辑、热命中和缓存上限通过，已加入统一核验。`npm run verify:config-v32`、`npm run build` 通过。
- 后续 BP03/BP04 衔接 Zoom 候选桶和动态要素绑定；本阶段不声称整套性能目标已达成。

## BP03：动态绑定与刷新

- 同一活动配置、记录、数据版本、FeatureStore 和上下文复用一次要素绑定；交互值、排序键和原生规则复用，比较器不再解析配置。配置编译补齐九级 Zoom 桶。
- 几何包围盒按记录/投影/数据版本缓存，在完整规则构造之前保守裁剪，纳入文字、图标、偏移及各部件，保留选中/搜索目标。禁用 hover 的事件不再写视觉状态。保留既有增量图层更新，并阻止旧地图卸载后的排队刷新访问已删除 pane。
- 缓存专项覆盖同 ID 替换、字段/数据 epoch、FeatureStore 与楼层变化；完整核验和构建通过。
- 真实 App/ConfigLab、463 记录、同相机、三轮六次缩放：V1 脚本中位数 0.090936s，V3 0.066397s，比例约 0.73；均无长任务，末次均六个 Label，运行异常零。证据：[runtime-performance.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/runtime-performance.json)。这是开发构建阶段结果，生产构建/开卡 P95/放大数据及最终独立回归仍须 BP10 完成。

## BP04：r7 条件与无损迁移核心

- r7 单一 when.zoom、受控 all/any/not 字段组合，末项完整规则优先；分类存储别名/映射、危险路径、未知根字段、空组与可证明矛盾阻断。旧 r5/r6 输入仍由原生内核支持。
- 迁移为基础＋完整例外/必要组合，保留原累积局部覆盖；剪除可证明不可能的组合，超过 64 条或存在无法等价处理的旧分类/面积/Zoom 条件时，只返回隔离诊断。源包不被改变。
- 5,130 个分类/方向/关联状态/Zoom 的 r6/r7 原生渲染结果逐项相等；同条件两分支的线宽＋Label 合成、未知/分类路径阻断和失败隔离通过。新检查加入统一核验；schema 已重新生成，完整核验与构建通过。
- 本阶段是模型/执行/迁移核心，r7 编辑入口与新版默认交付在后续 BP05/BP06 接入。

## BP05：r7 编辑器与单规则模板

- 新工厂编辑包为 r7/r3，保留原 r6 工厂 API 作独立迁移参照。读取有效 r6 时生成等价 r7 草稿并递增包 revision，原活动/保存版本在保存前保留，原文另存会话备份。
- 必填 Zoom 和受控字段组合在同条规则中编辑，支持枚举显示/保存值分离；手柄及键盘按钮调整规则顺序。新增面板完整复制内容而保留独立目标条件，支持 8–8，不分割源规则。
- 校验有效预览才生成独立编译快照，非法草稿不落回 V1。编译公共入口也校验非法条件。
- 模板专项、完整核验和构建通过。真实 Studio 复制单级规则、目标条件保持、非分类字段保存核验、未保存切标签阻断通过，零运行异常。跨分类未知 NofFloor 引用在实际页面被正确阻断，兼容模板正例通过。证据：[r7-editor-result.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/r7-editor-result.json)。

## BP06：分类继承和完整组模板

- 新分类创建面板支持父级继承/系统默认与任何兼容分类的有效显示组；同父级平级优先，几何、多部件和规范化锚点过滤。整组保留 Zoom、非分类条件与顺序，独立节点/规则 ID；字段、卡片、工作流与上下文仍属于目标父级体系。
- 尊重关闭继承；首次本地显示编辑生成独立组，取消不留下节点，失配模板/引用和祖先几何约束阻断保存。
- 专项、完整核验和构建通过。真实界面取消、父级继承、新分类核验、兼容组模板和草稿切标签阻断通过；实际候选组含 9 个优先平级、1 个父级、14 个其他兼容分类，运行异常零。证据：[category-editor-result.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/category-editor-result.json)。

## BP07：统一扩展规则

- 主区保留基础 A/B/C；三个高级模块进入同一默认折叠入口。显示权重指标、合成/边界归 C 子模块；Pane/zIndex 属于通用层级，Label 每屏配额属于碰撞/密度，Label 独立碰撞指标保持独立。
- 仅重组编辑入口与控件归属，未改变保存路径、默认值或规则效果。完整核验和构建通过，实际页面各规则只有一个默认折叠总入口，三个高级模块均嵌套其内。证据：[extensions-grouping-result.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/extensions-grouping-result.json)。

## BP08：密度编号与严格执行

- 选择框显示连续编号，按有效顺序排列；仅 grip 发起拖动，附键盘上/下移，恢复继承不固化默认数组，显式空顺序采用最终失败回退。
- 布局引擎按序执行，终止隐藏不再提前缩略或被 forceShow 反转；缩略重新检查真实预算。先隐藏符号后成功缩略的结果也正确保持符号隐藏。
- 实际布局验收：hideOptional 在前时缩略调用零、目标隐藏；缩略在前时调用一次、目标缩略显示；同格硬配额仍隐藏；空数组不缩略；UI 显示 1、2，零运行异常。证据：[density-order-result.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/density-order-result.json)。完整核验/构建通过。

## BP09：菱形模块帮助

- 所有指定模块、扩展子模块、独立碰撞指标及全局对应模块使用统一菱形问号；各自维护意义、效果、编辑/继承方式、单位和例子。有效扩展来源仍明确是静态检查。
- 支持 hover、键盘 focus/Escape、触屏点击停留和关闭，浮层 portal 避免滚动裁切；不改变父级折叠或草稿。锚点 X/Y 的输入也允许正负值。
- 实际页面模块标题无缺失帮助，键盘与手机编辑器全屏的真实 touch 通过，浮层在 390×844 视窗内，草稿和折叠状态未改变，零异常。已视觉检查截图。证据：[module-help-result.json](G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-frontend-runtime-editor-20261009/module-help-result.json)。完整核验与构建通过。

## BP10：综合验收中补齐的问题

- 实际网络故障注入发现浏览器缓存失败的动态导入。失败按钮明确为“重新加载并重试”，保存原测绘/测量请求，重载后继续打开该工具。错误状态和弹窗原子发布，防止短暂空隙被误判为取消；已启用模块的失败也有反馈，不留下未处理 Promise。
- 继承的候选、碰撞、稳定及密度值在编辑器中显示实际有效值；旧 r6 分支高级控件也复用统一扩展入口。允许在仍保留其他规则时删除首条规则。
- 放大数据 CPU 采样发现布局缓存逐 Label 扫描完整结果数组，以及高 Zoom 每个建筑扫描全世界寻找楼层。布局复用既有 ID 索引；通用主从关系按有效配置与 FeatureStore 快照建立分类、引用索引，保持原顺序、多值去重和首项匹配语义。独立解释路径、同 ID 替换及 2,000 个无楼层建筑的线性读取上限通过。
- 实际 App/Lab 已经由原工具入口完成标准工作流、真实地图绘制、提交、全局挂载、enabled 启停、Label 真实点击开卡、删除选择与恢复、实际切世界清理。字段/几何及同 ID 覆盖的存储/event 测试单列为补充，不冒充完整编辑 UX。
- 双部件压力探针：1,000 条/2,000 部件六次缩放脚本约 1.82s；5,000 条/10,000 部件约 6.09s，未再出现修复前约 47s 的高 Zoom 主从扫描阻塞。编译 epoch 保持、分类缓存 95，卸载后渲染记录清空。此受控开发探针仍有密集布局开销，不声称 5,000 条任意配置都达到基准交互延迟；GC 数字不等于所有应用世界源缓存被释放。

### 最终验收结果

| 核验 | 本轮结果与范围 |
| --- | --- |
| 构建及确定性检查 | `npm run verify:config-v32` 的 25 组检查、`npm run build` 通过；原有大 chunk 提示不是错误 |
| 独立 V1 参照 | 冻结提交 `0b82863d4fea3791f98917ba6d13f70e1f27eb15` 的 520 个文件指纹一致；冻结源码没有变更 |
| 显示 | 909＋252＝1,161 场景零差异，覆盖 95 分类；6 个密集混合场景通过；BUD 真点＋Label 的六级对照、45 个九方向/正负偏移、SVG 偏移、每部件及整体中心、低 Zoom 瓦片、主图/预览一致通过 |
| 工作流 | 17 个标准 composed 工作流的 34 次真实 Runner 提交，完整最终 record 对照通过；3 个 external 工作流的 7 条记录相等。external 参照是冻结组件/格式化器捕获桥，不是整个冻结宿主的完整回放 |
| 编辑及交互 | 未保存草稿切标签阻断；未知 token、非法 target 阻断保存；单级规则/模板/新分类继承与平级优先；密度正反顺序；菱形帮助键盘和触屏；英文空值；真实各部件及偏移 Label 点击通过 |
| 实际入口和挂载 | 冷/热/版本变化、取消、两工具故障重试、桌面/窄屏通过；真实 App 工作流创建、挂载启停、开卡、删除恢复、世界切换通过。字段/几何及同 ID 替换另以原存储/event 协议补充 |
| 生产性能 | 冻结 V1 与候选 V3 均用生产构建、463 记录和同相机；各五轮六次缩放，ScriptDuration 中位数 V1 0.068739s、V3 0.055922s，比例 **0.81354**；原生 Label disabled hover 图层增删为零，独立玩家悬停未纳入此断言 |
| 实际开卡 | 各 30 次真实鼠标点击同一个可见要素，卡片内容出现并进入下一帧；V1 P95 37.2ms，V3 **28.7ms**。没有声称所有卡片或硬件均达到该延迟 |
| 包 | 新 r7/r3 校验零错误，JSON/ZIP 往返及磁盘 ZIP 通过真实 Studio 文件输入导入，保存内容相等；性能实测配置与交付配置仅 `/parity/generatedAt` 生成时间不同 |
| 参数清单 | 最新类型清单 680 个成员，其中 532 项有可编辑归属与能力族证据；其他包含身份/世界系统字段、兼容元数据、受控能力、external 例外和诊断结构。没有声称每个参数的全部取值已端到端穷举 |

证据及文件摘要：[验收汇总](./runtime-v32-frontend-runtime-editor-20261009/acceptance-summary.json)、[交付 manifest](./runtime-v32-frontend-runtime-editor-20261009/delivery-manifest.json)、[生产性能明细](./runtime-v32-frontend-runtime-editor-20261009/production-performance.json)、[迁移来源](./runtime-v32-frontend-runtime-editor-20261009/render-migration-sources.json)。JSON 小证据随交付提交；完整日志、CPU 栈与截图位于根目录 `migration-audits/runtime-v32-frontend-runtime-editor-20261009`。

自动核验没有替代用户的实际地图与编辑习惯验收。完整编辑 UX 的所有组合、所有自定义参数及大数据平滑性仍须按人工清单复核；5,000 双部件压力场景保留实测开销，不以“测试结束”宣称无卡顿。首次转正须用户后续确认。本轮没有 push、PR、main 或 RIA 同步，原 V32 仍为 `5447e117…` 的原有脏工作树，不声称精确回退至 12:04。

### 本地可回退提交

| 提交 | 主题 |
| --- | --- |
| `0176dfa`、`1fee241` | 公共模块启用、手机模块主体可见 |
| `40d6d42`、`d40bd45` | 常驻编译与动态绑定、裁剪及 hover 刷新 |
| `7253410` | r7 条件和等价迁移 |
| `2f678fa`、`bef1dbe` | 单规则内容复制、新分类继承/显示组模板 |
| `d8029e1`、`9485554`、`e720b5d` | 扩展收纳、密度严格顺序、菱形帮助 |
| `8b9b8f9` | 有效继承值和兼容编辑入口 |
| `e152d17` | 失败动态导入的明确重载重试与工具意图恢复 |
| `841faba` | 通用主从引用索引、布局结果索引 |
| `a64c04c` | 本轮 r7 独立对照、真实入口、性能及交付脚本 |

使用保留的有效历史包恢复配置；代码按主题 commit 做针对性 revert。不要用 reset --hard 清掉草稿或原工作树。

### 开始人工验证

在本工作树运行 `npm run dev -- --host 127.0.0.1 --port 5188 --strictPort`，打开 `http://127.0.0.1:5188/?workspace=config-lab&configMode=v3`。本轮服务已在 5188 运行时可直接使用；若端口被占用，请先确认占用者，不重复启动同端口。

点击实验室“上传版本”，选取 [CairnMap_V32_RuntimeEditor_r3.zip](./runtime-v32-frontend-runtime-editor-20261009/CairnMap_V32_RuntimeEditor_r3.zip)，确认当前为 `cairnmap-config-v32-semantic r3`，再检查工作台为契约 r7。旧本地 r2/用户草稿不会被默认工厂替换；已有同 ID/r3 的不同内容会阻断历史覆盖，请保留原包并在工作台递增 revision。

按[人工验收单](./runtime-v32-frontend-runtime-editor-20261009/Manual_Acceptance.md)检查主图效果、模块、编辑与临时挂载。报告链接和 ZIP 均来自本次交付，不替换历史 r2 归档。
