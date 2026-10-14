# Runtime V3.2 Node 24 部署修复 — 2026-10-14

Vercel 新部署拒绝项目原有的 Node 20 声明。上游基线 `aa0bc688649dddc9fbc7ba55481e5ad5d312cc6a` 与下游基线 `7e8ae94908596bab0e949b01cbb734af9feb5cf4` 均仍指定 Node 20。本次独立提交将两侧运行环境升级为 Node 24。

## 修改范围

- 两侧 `package.json` 和 lockfile 根包的 `engines.node` 改为 `24.x`。逐项 JSON 对比确认依赖版本、完整性摘要及其他设置未变。
- 两侧配置核验 CI 使用 Node 24；下游 Native RelayPackage 预检和接收 CI 同步改为 Node 24。
- Vite 开发监听排除 `**/.cache/**`。Node 24 开发启动时曾因独立验收浏览器锁定缓存中的 Cookies 文件而报 EBUSY；排除本地缓存后实际启动通过。
- 默认配置仍为契约 r9 / 配置 r5，SHA256 为 `999d4afee9e1bfe9daf86639d95e2dae721d6c887cef3771fb1afa0d79df816e`。

## 本地验证

使用 Node 官方 Windows x64 便携包 **v24.21.0 / npm 11.19.0**，下载包按官方 SHASUMS256 校验；ZIP SHA256 为 `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`。系统安装的 Node 20 未被覆盖。

| 验证 | 上游 | 下游 |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | 通过 | 通过 |
| `npm run verify:config-v32` | 38 组通过 | 39 组通过 |
| 最终 `npm run build`（包括 prebuild 核验） | 通过 | 通过 |
| 工作台、工作流设计及 V3 Lab 实际挂载 | 5188 开发、5208 生产预览通过 | 5191 开发通过 |
| 下游原有审核、数据、工作区等回归 | — | 23 项通过 |
| relay 接收守卫及配置解析 | — | 2 项通过 |

6 项浏览器启动检查均通过，未记录未捕获运行异常。开发服务运行期间保留了独立浏览器的锁定缓存，用于验证缓存监听修复。原有 5188/5191 开发入口及 5208/5209 预览入口已恢复；共享依赖的 5189 V1 对照服务也已恢复。

本地命令日志在各工作树 `.cache/node24-upgrade/`，包括 npm-ci.txt、verify-config-v32.txt、build.txt；下游另有 downstream-regression.json、browser-smoke.json。npm 11 的 install-scripts 提示和既有构建分块提示仍存在，所有已列核验和构建均成功。

## 交付与边界

上游修复追加到 [PR #26](https://github.com/Ozstk639/CairnMap-Web/pull/26)，远端 CI 与 Vercel 成功状态以该提交的检查记录为准；本报告的本地通过结果不替代远端部署结果。下游修复保留本地提交。main 和下游远端均未更新。

本次未重新验证真实账户审核、外部瓦片及 COS 跨域，也未实施下一阶段蓝图功能；SYNC-01 原报告的相应限制继续保留。撤销升级可常规 revert 本次独立提交，历史 Node 20 在 Vercel 的新部署限制仍会存在。

运行环境政策参考：[Vercel Node 20 停用公告](https://vercel.com/changelog/node-js-20-is-being-deprecated)、[Node 24.21.0 官方发行目录](https://nodejs.org/dist/v24.21.0/)。
