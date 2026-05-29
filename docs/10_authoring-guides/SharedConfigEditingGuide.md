# Shared 配置编辑指南

Shared 配置是可复用积木。Class、Workflow、Card 和 Display 通常通过 ID 或 key 引用 shared 配置。

常见根目录：

```text
project-config/presets/core-structures/shared/
```

旧的 `shared/*.json` 根目录副本已经被清理，不允许恢复。当前只使用分层目录。

## 1. 目录结构

| 目录 | 作用 |
|---|---|
| `shared/display` | 显示 profile、label style、显示算法 key、特殊显示逻辑 key |
| `shared/format` | format runtime contract、special formatter key、schema runtime contract |
| `shared/card` | 信息卡 layout、card enhancement、card runtime contract |
| `shared/workflow` | field control、workflow component、legacy executor、workflow template |
| `shared/relation` | 关系绑定、关系动作、关系视图 |
| `shared/common` | icon registry、render-format final contract 等通用配置 |

## 2. Display 配置

常见文件：

```text
shared/display/displayProfiles.json
shared/display/labelStyles.json
shared/display/displayAlgorithms.json
shared/display/specialDisplayLogic.json
shared/display/displayRuntimeContracts.json
```

### displayProfiles.json

定义可复用显示 profile，例如点、线、面、label anchor、collision 策略。

Class 通过 `display.rules[].profile` 引用。

### labelStyles.json

定义 label 样式 token。

Class 通过 `display.rules[].label.styleKey` 引用。

示例：

```json
{
  "id": "gm-outline",
  "fontFamily": "system",
  "fontWeight": 600,
  "fill": "#111111",
  "halo": {
    "enabled": true,
    "color": "#ffffff",
    "widthRatio": 0.18
  }
}
```

### displayAlgorithms.json

只声明算法 key。算法实现仍在 TS executor 中。

不要在 JSON 中写函数。

## 3. Card 配置

常见文件：

```text
shared/card/cardLayouts.json
shared/card/cardEnhancements.json
shared/card/cardRuntimeContracts.json
```

### cardLayouts.json

定义信息卡布局。Class 通过 `card.layoutId` 绑定。

常见 item 类型：

| 类型 | 作用 |
|---|---|
| `classification` | 显示分类信息 |
| `registryDefaultGroup` | 使用 Class 字段默认组 |
| `registryField` | 显示指定字段 |
| `enhancement` | 调用 TS enhancement executor |
| `section` | 分组标题或区块 |

### feature link 示例

```json
{
  "kind": "registryField",
  "path": "BuildingID",
  "transform": "featureLink",
  "linkTarget": {
    "classCode": "BUD",
    "matchField": "ID",
    "displayField": "Name",
    "fallbackDisplay": "raw"
  }
}
```

检查：

- `classCode` 目标 Class 必须存在。
- `matchField` 与 `displayField` 应存在于目标 Class。

## 4. Workflow Shared 配置

常见文件：

```text
shared/workflow/fieldControls.json
shared/workflow/workflowComponents.json
shared/workflow/workflowLegacyExecutors.json
shared/workflow/workflowTemplates.json
shared/workflow/workflowBlocks.json
shared/workflow/workflowRuntimeContracts.json
```

当前 runtime 模型：

```text
workflow JSON -> runtimeMode: componentExecutor -> componentKey -> TS component executor
```

`workflowBlocks` 和 `workflowTemplates` 是未来 block runner 能力入口，不是当前 active runner 的完整页面定义。

## 5. Format 配置

常见文件：

```text
shared/format/formatRuntimeContracts.json
shared/format/formatSpecialFormatters.json
shared/format/schemaRuntimeContracts.json
```

这些文件声明 runtime contract 和 formatter key。实际特殊 formatter 仍由 TS executor 执行。

## 6. Relation 配置

常见文件：

```text
shared/relation/relationBindings.json
shared/relation/relationActions.json
shared/relation/relationViewProfiles.json
```

用于声明地物之间的关系、可视化关系视图或关系操作。

## 7. Common 配置

常见文件：

```text
shared/common/iconRegistry.json
shared/common/renderFormatFinalContracts.json
```

`iconRegistry.json` 声明 JSON 可引用的 `iconKey`。

## 8. 禁止项

- 不要恢复 `project-config/presets/core-structures/shared/*.json` 根目录旧文件。
- 不要在 JSON 中写可执行函数。
- 不要把 display algorithm、card enhancement、formatter 的实现写入 JSON。
- 不要让 Class 或 Workflow 引用不存在的 shared key。
