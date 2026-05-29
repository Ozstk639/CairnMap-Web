# Workflow 配置编辑指南

当前 CairnMap workflow JSON 的职责是：**用配置调度 TS component executor**。它不是完整 block runner 页面定义。

常见位置：

```text
project-config/presets/*/workflows/*.json
```

## 1. 当前运行模型

```text
Class.workflowBindings
  -> workflowId
  -> workflows/*.json
  -> runtimeMode: componentExecutor
  -> componentKey
  -> TS workflow component executor
```

因此，workflow JSON 只描述入口、目标 Class、目标 geometry 和组件 key。

## 2. 最小结构示例

```json
{
  "schemaVersion": "cairnmap.workflow.v1",
  "projectId": "openriamap-ria",
  "id": "station-basic",
  "label": "Station workflow",
  "runtimeStatus": "active",
  "targetClass": "STA",
  "targetGeometry": "Point",
  "runtimeMode": "componentExecutor",
  "componentKey": "stationWorkflow",
  "legacyWorkflowKey": "车站",
  "blockRunnerReady": false,
  "futureBlockTemplateRef": "basic-point-3step",
  "executorDispatch": "configComponentKey",
  "legacyFallback": true
}
```

## 3. 字段说明

| 字段 | 含义 |
|---|---|
| `id` | workflow ID，供 Class `workflowBindings` 引用 |
| `label` | UI 显示名称 |
| `targetClass` | 目标 Class，例如 `STA` |
| `targetGeometry` | 目标 geometry，例如 `Point` |
| `runtimeMode` | 当前应为 `componentExecutor` |
| `componentKey` | TS workflow component key |
| `legacyWorkflowKey` | 旧 workflow 名称或兼容 key |
| `blockRunnerReady` | 当前应为 `false` |
| `futureBlockTemplateRef` | 未来 block runner 模板引用 |

## 4. componentKey

`componentKey` 必须在 shared workflow 配置中声明：

```text
project-config/presets/core-structures/shared/workflow/workflowComponents.json
```

JSON 只保存 key，不保存 React component 本身。

## 5. 添加 workflow 的流程

1. 在合适的 preset `workflows/` 中新增 workflow JSON。
2. 确认 `targetClass` 已存在。
3. 确认 `targetGeometry` 与目标 Class 的 geometry 一致。
4. 确认 `componentKey` 已声明。
5. 在目标 Class JSON 的 `workflowBindings` 中绑定 workflowId。
6. 运行 validate / audit / build。

## 6. 绑定到 Class

在目标 Class JSON 中：

```json
{
  "workflowBindings": [
    { "workflowId": "station-basic", "default": true }
  ]
}
```

## 7. 禁止项

当前 workflow JSON 不允许恢复以下结构：

```text
pages
blocks
output
review block
fieldInput 堆砌
runtimeValue 堆砌
classificationPicker 堆砌
```

原因：当前 runner 不是 block runner，而是 component executor 调度模式。

## 8. 常见错误

| 错误 | 原因 |
|---|---|
| workflowId 找不到 | Class 绑定了不存在的 workflow |
| componentKey 找不到 | 没有在 shared workflow 配置中声明 |
| targetClass 找不到 | 引用了不存在的 Class |
| audit 失败 | workflow JSON 恢复了 pages / blocks / output |
