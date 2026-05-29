# Preset 编写指南

Preset 是可复用配置包，用于承载可复用的 Class、Workflow 和 Shared 配置。当前项目中的 rail、road、building、teleport、warp、trade、core-structures 都属于 preset。

常见位置：

```text
project-config/presets/<preset-name>/
```

## 1. Preset 应该包含什么？

| 内容 | 是否适合放入 preset |
|---|---|
| 可复用 Class | 是 |
| 可复用 Workflow | 是 |
| 可复用 Shared 配置 | 是 |
| 项目专属世界 / 数据源 / 瓦片源 | 通常否 |
| OpenRIAMap RIA 专属环境配置 | 通常放 project package |

Preset 默认不放 `environment/`。

## 2. 推荐结构

```text
project-config/presets/rail/
  package.json
  classes/
  workflows/
  shared/
```

不是每个 preset 都必须有全部目录。是否存在应与 `package.json` 的 `contains` 基本一致。

## 3. package.json 示例

```json
{
  "schemaVersion": "cairnmap.config-package.v1",
  "packageId": "preset-rail",
  "packageType": "preset",
  "displayName": "Rail Preset",
  "defaultEnabled": true,
  "nativePreset": true,
  "contains": {
    "environment": false,
    "shared": true,
    "classes": true,
    "workflows": true
  }
}
```

## 4. 加入 Assembly

新增 preset 后，需要在 assembly 中加入 loadOrder：

```json
{
  "path": "../packages/presets/rail",
  "enabled": true
}
```

实际路径以当前 `project-config/assemblies/*.json` 的相对路径为准。

## 5. 优先级与冲突

规则：

```text
native preset 优先级低于 non-native project package。
```

如果 native preset 与 project package 定义了相同 `classCode`，应由 audit / diagnostics 捕获，不能静默覆盖。

## 6. 常见操作

### 新增 preset

1. 新建 `project-config/presets/<name>/`。
2. 添加 `package.json`。
3. 根据需要添加 `classes/`、`workflows/`、`shared/`。
4. 更新 assembly `loadOrder`。
5. 运行 validate / audit / build。

### 往 preset 中新增 Class

1. 在 `classes/` 中新增 `<CLASS>.json`。
2. 确认 `classCode` 全局唯一。
3. 如需 workflow，在 `workflows/` 中新增 workflow JSON。
4. 绑定 display profile、card layout、workflowId。

## 7. 禁止项

- 不要把项目专属数据源放进通用 preset。
- 不要让两个 preset 定义同一个 `classCode`。
- 不要用 preset 覆盖 project package 的专属环境配置。
- 不要绕过 assembly 直接在代码中加载 preset。
