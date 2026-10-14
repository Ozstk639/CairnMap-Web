# SYNC-01 执行准备记录

2026-10-14（Asia/Shanghai）。状态：准备完成，尚未推送、建 PR 或覆盖下游。

执行依据：[增量蓝图 v0.3](../RuntimeV32_Incremental_Revision_Blueprint_2026-10-13.md)。历史 v0.1/v0.2 原样保留。此记录不是主体功能或远端发布验收报告。

## 固定参照

| 项目 | 值 |
| --- | --- |
| 当前业务交付 HEAD | e81683c89ed1fe0a0153155932b02a76c7ad11d4 |
| 上游仓库 / main | Ozstk639/CairnMap-Web / 5447e117a86d01f833bea012c1e0c09440489ff6 |
| 下游仓库 / main | OpenRIAMap/OpenRIAMap-Cairn-Web / 0f075e4c3075e1210c812f90932c8a47abb1fbc9 |
| 首个上游 PR head 分支 | codex/cm-config-runtime-v32-migration-20261007 |
| 当前上游 ahead / behind | 75 / 0 |
| 当前远端迁移分支 / 对应 PR | 均不存在；已只读核验 |
| 下游建议新分支 | codex/ria-config-runtime-v32-integration-20261014 |
| source 专属单元文件 | Studio 90 + configRuntime 1，共 91 |
| 下游旧 Studio 文件 | 5；目前均在新源中存在，无现成额外旧文件待删 |
| 其他 src 升级候选 | 40 个；逐项整合，不整文件盲目覆盖 |

当前 remote 名称与目标不同：`upstream` 指上游 Ozstk639/CairnMap-Web，`origin` 指下游 OpenRIAMap/OpenRIAMap-Cairn-Web。首推必须使用上游目标。GitHub CLI 认证/读取已确认；本记录不保存任何凭据。

当前仓库为浅克隆，现有对象中未找到双方共同祖先，不将此误称为历史无关。不把 75 个上游提交直接合并到下游；按固定文件树、依赖闭包和共享文件职责迁入。

## 准备好的 PR 与覆盖清单

- 建议标题：**feat(config): deliver verified V3.2 r9/r5 studio and runtime baseline**。
- PR 正文文件：[Upstream_PR_Body.md](Upstream_PR_Body.md)。下一执行用 `gh pr create --repo Ozstk639/CairnMap-Web --base main --head codex/cm-config-runtime-v32-migration-20261007 --body-file ...`，发布前补充最终 head；本次未执行该命令。
- 精确源文件 blob 清单与共享升级候选：[sync01-preparation-manifest.json](sync01-preparation-manifest.json)。专属目录按整树覆盖，共享宿主保留下游审核、UI、正式数据/媒体、状态恢复与互斥。
- 本地构建日志：[config-v32-build.log](config-v32-build.log)。业务源码在准备前后未修改；运行环境与远端 main 已核验。

## 验证结果

Node 20.14.0，`npm run build` 通过；其 prebuild 的 `verify:config-v32` 38 组全部通过。初次 sandbox 的 Vite/esbuild spawn EPERM 已通过正常权限复跑排除。现有分块体积/静态动态导入提示保留，不把它们隐藏为零风险。

尚未发生：远端 CI、PR 创建/审阅/合并，下游 worktree 创建/覆盖、下游集成后的构建/浏览器/服务验收，以及本轮主体功能生成。下一执行必须使用最终源码 head 重验清单，不能把当前准备文件当其已通过证明。

## 下一执行顺序

1. 固化蓝图/准备文档提交，记录最终 source HEAD，重新检查远端状态；非强制推送上游分支并创建可审阅 PR，检查 CI 与 diff。
2. 从核验后的下游 main 建独立 worktree/分支并冻结；Studio/Lab 专属单元整套覆盖，依赖闭包及共享文件按清单接入，保留其现役功能。
3. 在下游基线验证并记录覆盖结果，按后续主体生成指令完成 v0.3 全部要求。
4. 将下游成品固定后覆盖回上游；保留前端/本地模块，生产接口为空/禁用，审核所有远端入口零请求；退役数据接口无正常配置项/回退。

分支推送/PR不等于 main 合并或部署；这些动作依对应阶段指令处理。本次仅完成规划和预备。
