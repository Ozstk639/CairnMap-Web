# CairnMap 配置校验指南

`validate:project-config` 用于检查配置文件是否写得正确。它与 `audit:project-config` 分工不同：validate 关注配置内容，audit 关注架构边界。

## 1. 使用命令

```bash
npm run validate:project-config
```

成功时输出类似：

```text
CairnMap Project Config Validation

--- parse-json ---
PASS

--- schema-version ---
PASS

--- class-config ---
PASS

Final result: PASS
```

失败时会列出可定位的错误，例如：

```text
Errors:
  [class:STA] card.layoutId "station-card-v2" not found in shared/card/cardLayouts.json
  [workflow:station-basic] componentKey "stationWorkflow2" not declared in workflowComponents.json
```

## 2. validate 检查什么？

| 检查项 | 内容 |
|---|---|
| JSON parse | 所有业务配置 JSON 是否可解析 |
| schemaVersion | 文件结构版本是否符合预期 |
| Assembly | `loadOrder.path`、默认世界、mergePolicy 是否有效 |
| Package | package metadata 与实际目录是否基本一致 |
| Class | `classCode`、字段、geometry、card、display、workflow binding |
| Shared reference | display profile、label style、card layout、componentKey 等引用是否存在 |
| Workflow | targetClass、targetGeometry、componentKey、legacy 禁止项 |
| Environment | worldId、dataSource、tileSource、ruleButtons、navigation 引用 |
| Legacy guard | 不允许 root shared JSON、shadow、workflow pages/blocks/output 回流 |

## 3. validate 与 audit 的区别

| 命令 | 主要问题 | 示例 |
|---|---|---|
| `validate:project-config` | 配置文件是否写对 | 引用了不存在的 `layoutId` |
| `audit:project-config` | 架构是否倒退 | TS 中恢复硬编码 Class registry |
| `build` | 代码是否能构建 | TypeScript 错误 |

推荐顺序：

```bash
npm run validate:project-config
npm run audit:project-config
npm run build
```

## 4. JSON Schema 目录

Schema 文件位于：

```text
project-config/schemas/
```

它们用于：

- 文档化各类配置文件结构。
- 为未来编辑器或 IDE 提示做准备。
- 与 `validate-project-config.mjs` 的检查逻辑保持一致。

当前第一版 validator 不依赖 Ajv，不需要额外安装依赖。

## 5. 处理错误的建议

1. 先看错误前缀，例如 `[class:STA]`、`[workflow:...]`。
2. 打开对应 JSON 文件。
3. 检查是否引用了不存在的 ID / key。
4. 重新运行 `npm run validate:project-config`。
5. validate 通过后，再运行 audit 和 build。
