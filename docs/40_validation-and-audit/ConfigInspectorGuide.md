# Config Inspector 使用指南

`inspect:project-config` 是只读配置索引查看命令，用于快速了解当前 CairnMap 配置包中有哪些 preset、Class、workflow 和 shared 配置项。

它不会修改任何文件，也不替代 `validate:project-config` 或 `audit:project-config`。

## 命令

```bash
npm run inspect:project-config
```

输出内容包括：

- 当前 preset 列表
- Class 总数与按 preset 分组的 Class 列表
- Workflow 总数与按 preset 分组的 Workflow 列表
- shared display/card/workflow 索引数量
- environment 中的 world / data source / rule button 简要信息

## 查看 Class 详情

```bash
npm run inspect:project-config -- --details
```

会额外显示每个 Class 的：

- 文件路径
- `classKey`
- geometry 类型
- 字段数量
- display rule id
- card layout
- workflow 绑定

## 输出 JSON

```bash
npm run inspect:project-config -- --json
```

适合后续给脚本、可视化编辑器或自动化检查工具读取。

## 与其他命令的关系

| 命令 | 作用 |
|---|---|
| `inspect:project-config` | 只读查看配置索引 |
| `validate:project-config` | 检查配置内容是否合法 |
| `audit:project-config` | 检查配置架构是否倒退 |
| `create:class` | 生成 Class 配置模板 |

建议在新增或修改配置前先运行 inspector 了解当前结构，修改后再运行 validate 和 audit。
