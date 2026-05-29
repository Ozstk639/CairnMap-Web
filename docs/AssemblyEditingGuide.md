# Assembly 编辑指南

Assembly 是 CairnMap 的配置组装入口。它决定加载哪些 package / preset、按什么顺序加载，以及冲突如何处理。

常见位置：

```text
project-config/assemblies/*.json
```

## 1. Assembly 控制什么？

| 字段 | 作用 |
|---|---|
| `assemblyId` | 组装方案 ID |
| `displayName` | 显示名称 |
| `loadOrder` | package / preset 加载顺序 |
| `mergePolicy` | 冲突处理策略 |
| `runtime.defaultPackagePath` | 默认 project package |
| `runtime.defaultWorldId` | 默认世界 |

## 2. loadOrder

示例：

```json
{
  "path": "../packages/presets/rail",
  "enabled": true
}
```

说明：

- `path` 是相对于 assembly 文件的路径。
- `enabled` 控制是否加载。
- 加载顺序会影响 shared / workflow 的覆盖关系。
- `projectId` 只是诊断字段，不是主要加载依据。

## 3. mergePolicy

常见策略：

```json
{
  "presetPriority": "low",
  "classConflict": "nonNativeOverridesPresetWithVisibleError",
  "sharedConflict": "lastWins",
  "workflowConflict": "lastWins",
  "environmentConflict": "projectOnly"
}
```

含义：

| 字段 | 含义 |
|---|---|
| `presetPriority: low` | preset 优先级低 |
| `classConflict` | Class 冲突时 project package 优先，并应可诊断 |
| `sharedConflict` | shared 冲突按后加载覆盖 |
| `workflowConflict` | workflow 冲突按后加载覆盖 |
| `environmentConflict` | environment 只应由 project package 提供 |

## 4. 常见操作

### 启用或禁用 preset

修改对应项：

```json
{
  "path": "../packages/presets/trade",
  "enabled": false
}
```

### 新增 preset 到 assembly

1. 确认 preset package 已存在。
2. 在 `loadOrder` 中添加路径。
3. 运行 validate / audit / build。

### 修改默认世界

修改：

```json
{
  "runtime": {
    "defaultWorldId": "zth"
  }
}
```

并确认该 world 存在于 `environment/worlds.json`。

## 5. 禁止项

- 不要依赖 `projectId` 自动筛选 package。
- 不要把 environment 放进 native preset 后再通过 assembly 合并。
- 不要静默处理 classCode 冲突。
- 不要让 `loadOrder.path` 指向不存在的目录。
