# CairnMap 配置编辑手册

本文档是 CairnMap 配置编辑的总入口。它帮助你快速判断：应该修改哪个 JSON、改完运行哪些命令、哪些旧结构不能恢复。

如果你只想完成一次普通配置修改，优先阅读本文件即可。需要字段级细节时，再进入对应分册。

## 1. 快速导航

| 我想做什么 | 阅读 |
|---|---|
| 新增或修改地物类型 | `docs/ClassConfigEditingGuide.md` |
| 修改字段、分类、geometry | `docs/ClassConfigEditingGuide.md` |
| 修改显示、label、信息卡、formatter key | `docs/SharedConfigEditingGuide.md` |
| 修改测绘/编辑入口 | `docs/WorkflowConfigEditingGuide.md` |
| 修改世界、数据源、瓦片源、按钮、搜索、导航 | `docs/EnvironmentConfigEditingGuide.md` |
| 新增或维护 preset | `docs/PresetAuthoringGuide.md` |
| 调整 package 加载顺序 | `docs/AssemblyEditingGuide.md` |
| 查看配置校验机制 | `docs/ConfigValidationGuide.md` |
| 不理解某个术语 | `docs/ConfigGlossary.md` |
| 修改完成前后检查 | `docs/ConfigAuthoringChecklist.md` |

## 2. 配置模型

| 层级 | 作用 | 常见位置 |
|---|---|---|
| Assembly | 决定加载哪些 package / preset | `project-config/assemblies/*.json` |
| Project package | 项目环境配置 | `project-config/packages/openriamap-ria/` |
| Preset package | 可复用地物和工作流配置 | `project-config/presets/*/` |
| Environment | 世界、瓦片源、数据源、按钮、搜索、导航 | `environment/*.json` |
| Shared | 可复用配置积木 | `shared/*/*.json` |
| Class | 具体地物类型定义 | `classes/*.json` |
| Workflow | 测绘入口调度 | `workflows/*.json` |
| TS executor | 执行复杂逻辑 | `src/**/*.ts` / `src/**/*.tsx` |

当前架构要求：**配置定义写在 JSON；TS 只作为 executor / facade。**

## 3. 修改位置速查

| 目标 | 修改位置 | 不要修改 |
|---|---|---|
| 字段名称、字段类型、字段显示场景 | Class JSON `fields` | `featureFormats.ts` |
| 分类选项 | Class JSON `classification.options` | workflow TS |
| 地物 geometry | Class JSON `geometry` | formatter TS |
| 地图显示规则 | Class JSON `display.rules` + `shared/display` | TS display registry |
| 信息卡布局 | `shared/card/cardLayouts.json` + Class `card.layoutId` | 旧 card registry |
| workflow 入口 | `workflows/*.json` + Class `workflowBindings` | workflow `pages/blocks/output` |
| 世界、数据源、瓦片源 | project package `environment` | Class JSON |
| package 组合 | Assembly `loadOrder` | `projectId` 筛选逻辑 |

## 4. 标准工作流

```bash
npm run validate:project-config
npm run audit:project-config
npm run build
npm run dev
```

命令分工：

| 命令 | 作用 |
|---|---|
| `validate:project-config` | 检查 JSON 结构、字段类型、跨文件引用 |
| `audit:project-config` | 检查架构边界，防止 legacy 定义回流 |
| `build` | 检查 TypeScript 与 Vite 构建 |
| `dev` | 本地人工检查地图、信息卡、测绘入口 |

## 5. 常见任务

### 修改字段显示名

编辑 Class JSON：

```json
{
  "key": "Name",
  "label": {
    "zh-CN": "名称",
    "en": "Name"
  }
}
```

运行 validate、audit、build，并在信息卡中确认显示。

### 新增字段

编辑 Class JSON 的 `fields`：

```json
{
  "key": "Operator",
  "label": {
    "zh-CN": "运营方",
    "en": "Operator"
  },
  "type": "text",
  "required": false,
  "scenes": {
    "workflow": true,
    "editor": true,
    "infocard": true,
    "search": false
  }
}
```

不要在 `featureFormats.ts` 中新增字段 registry。

### 修改 label 样式

优先修改：

```text
project-config/presets/core-structures/shared/display/labelStyles.json
```

如果是显示行为或 anchor/collision 规则，则查看：

```text
project-config/presets/core-structures/shared/display/displayProfiles.json
```

### 修改信息卡

优先修改：

```text
project-config/presets/core-structures/shared/card/cardLayouts.json
```

再确认 Class JSON 中的：

```json
{
  "card": {
    "layoutId": "..."
  }
}
```

### 修改 workflow 绑定

Class JSON 中绑定：

```json
{
  "workflowId": "station-basic",
  "default": true
}
```

workflow 文件本身应保持 `runtimeMode: "componentExecutor"`，不要恢复 `pages`、`blocks` 或 `output`。

## 6. 十条安全规则

1. Class 字段只写在 Class JSON。
2. Display 与 label 配置只写在 `shared/display`。
3. Card layout 只写在 `shared/card`。
4. Workflow JSON 当前只负责 component executor 调度。
5. JSON 只能引用 key，不能写函数。
6. TS 可以执行逻辑，但不能保存配置定义。
7. Preset 优先级低于 project package。
8. Assembly `loadOrder` 是实际加载依据。
9. 不允许恢复旧 `shared/*.json` 根目录副本。
10. 每次修改后运行 validate、audit、build。

## 7. TS 修改边界

允许：

- special formatter executor
- display algorithm executor
- card enhancement executor
- workflow component executor
- runtime bridge / facade

禁止：

- Class 字段定义源
- display rule 定义源
- card layout 定义源
- workflow pages/blocks/output 定义源
- build 阶段 schema export 定义源

## 8. validate、audit、build 的区别

| 命令 | 主要回答的问题 | 示例 |
|---|---|---|
| `validate:project-config` | 配置写得对不对 | `card.layoutId` 不存在、`workflowId` 找不到 |
| `audit:project-config` | 架构有没有倒退 | `featureFormats.ts` 又出现硬编码定义源 |
| `build` | 前端能不能构建 | TypeScript 或 Vite 错误 |
| `dev` | 运行体验是否正常 | 地图、信息卡、测绘入口是否正常 |

## 9. 后续阅读

- `ClassConfigEditingGuide.md`
- `SharedConfigEditingGuide.md`
- `WorkflowConfigEditingGuide.md`
- `EnvironmentConfigEditingGuide.md`
- `PresetAuthoringGuide.md`
- `AssemblyEditingGuide.md`
- `ConfigGlossary.md`
- `ConfigAuthoringChecklist.md`
- `ConfigValidationGuide.md`
