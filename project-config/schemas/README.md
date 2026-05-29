# CairnMap 配置 Schema

本目录保存 CairnMap 配置文件的轻量 JSON Schema。它们用于说明配置结构、辅助未来编辑器提示，并与 `npm run validate:project-config` 的校验逻辑配合使用。

当前第一版 schema 采用“适度严格”的策略：

- 对 assembly、package、class、workflow、card layout 等核心文件更严格。
- 对 runtime contract、special logic、relation 等扩展性较强的文件保持较宽松。
- 跨文件引用关系主要由 `scripts/validate-project-config.mjs` 检查，而不是完全依赖 JSON Schema。

## 目录

```text
assembly/      Assembly 组装文件
package/       package / preset / project package 元数据
environment/   worlds、tileSources、dataSources、ruleButtons 等环境配置
class/         Class 配置
workflow/      Workflow 配置
shared/        display、format、card、workflow、relation、common 等 shared 配置
```

## 推荐验证命令

```bash
npm run validate:project-config
npm run audit:project-config
npm run build
```

`validate:project-config` 检查配置内容是否正确；`audit:project-config` 检查架构边界是否倒退。
