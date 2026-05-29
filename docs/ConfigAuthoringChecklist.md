# CairnMap 配置编辑检查清单

每次修改 `project-config` 后，建议使用本清单快速确认是否安全。

## 修改前

- [ ] 我确认本次修改属于哪一类：environment / shared / class / workflow / preset / assembly。
- [ ] 我已找到对应 JSON 文件，而不是准备修改 legacy TS 定义源。
- [ ] 我确认当前修改是否属于项目专属配置，还是可复用 preset 配置。
- [ ] 我确认不会恢复已清理的旧结构，例如 `shared/*.json` 根目录副本。

## 修改中

- [ ] Class 字段修改只发生在 `classes/*.json`。
- [ ] Display profile / label style 修改只发生在 `shared/display`。
- [ ] Card layout 修改只发生在 `shared/card`。
- [ ] Workflow JSON 没有恢复 `pages`、`blocks`、`output`。
- [ ] JSON 中没有写入函数或 React component，只引用 key。
- [ ] 新增的 `classCode`、`workflowId`、`layoutId`、`componentKey` 没有重复。
- [ ] 新增引用都能在对应 shared/class/workflow 文件中找到目标。

## 修改后命令检查

```bash
npm run validate:project-config
npm run audit:project-config
npm run build
```

如果修改影响 UI 或运行时行为，再执行：

```bash
npm run dev
```

## 人工检查

- [ ] 地图能正常打开。
- [ ] 数据源能正常加载。
- [ ] 相关 Class 的要素能正常显示。
- [ ] 信息卡字段、顺序、链接、enhancement 正常。
- [ ] 测绘/编辑入口能正常打开。
- [ ] Data Tool Schema 下载仍可用。
- [ ] 浏览器 console 没有新的配置错误。

## 发布前

- [ ] 本次修改的目标已在 commit message 中说明。
- [ ] 如果新增了配置字段，已同步更新相关手册或注释。
- [ ] 如果新增了 preset 或 assembly，已说明加载顺序和冲突策略。
- [ ] 如果新增了 TS executor key，已确认它只是 executor，不是配置定义源。

## 常见失败判断

| 现象 | 通常原因 |
|---|---|
| `validate:project-config` 失败 | JSON 结构、字段类型或引用关系错误 |
| `audit:project-config` 失败 | 配置架构倒退或 legacy 定义回流 |
| `build` 失败 | TypeScript / Vite 构建错误 |
| 地图运行失败但命令通过 | 可能是数据源、运行时逻辑或 UI 行为问题，需要人工检查 |
