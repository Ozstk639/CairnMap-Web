# Class 模板命令指南

`create:class` 用于快速生成一个合法的 Class JSON 模板，避免从旧 Class 文件复制后手动删改造成遗漏。

## 适用场景

适合在已有 preset 中新增一个地物类型，例如新增一个点、线或面要素 Class。

不适合用于批量迁移旧配置，也不负责自动生成复杂 workflow block。

## 命令

```bash
npm run create:class -- --preset rail --classCode MET --classKey metroLine --geometry LineString --labelZh 地铁线路 --labelEn "Metro Line"
```

常用参数：

| 参数 | 说明 |
|---|---|
| `--preset` | 目标 preset，例如 `rail`、`road`、`building` |
| `--classCode` | Class 代码，建议使用 2–16 位大写字母或数字 |
| `--classKey` | 稳定 key，例如 `metroLine` |
| `--geometry` | `Point`、`LineString`、`Polygon`、`MultiPolygon` 等 |
| `--labelZh` | 中文显示名称 |
| `--labelEn` | 英文显示名称，可选 |
| `--displayProfile` | 指定 shared display profile，可选 |
| `--labelStyle` | 指定 label style，可选 |
| `--cardLayout` | 指定 card layout，可选 |
| `--dry-run` | 只打印生成内容，不写入文件 |
| `--force` | 允许覆盖已存在的 Class 文件 |
| `--no-register` | 不把 classCode 写入 preset.json 的 `providedClasses` |

## 生成内容

默认会生成：

```text
project-config/presets/<preset>/classes/<CLASS_CODE>.json
```

并把 `classCode` 追加到：

```text
project-config/presets/<preset>/preset.json
```

如果使用 `--no-register`，则只生成 Class JSON，不更新 preset metadata。

## 建议流程

```bash
npm run create:class -- --preset road --classCode BRG --classKey bridge --geometry LineString --labelZh 桥梁 --dry-run
npm run create:class -- --preset road --classCode BRG --classKey bridge --geometry LineString --labelZh 桥梁
npm run validate:project-config
npm run audit:project-config
```

## 注意事项

- 生成命令只负责创建最小合法 Class 模板。
- 字段、classification、display、card 和 workflow 绑定仍需要后续人工完善。
- 不要在 `featureFormats.ts` 中补写 Class 字段定义。
- 不要把生成工具当作完整的可视化编辑器。
