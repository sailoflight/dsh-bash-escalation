# Verification matrix

## Defaults and boundaries

- Default network: offline（本仓库无任何网络步骤）
- Default production write: forbidden（本地开发插件，不涉及生产/真实数据/凭据）
- Default data: synthetic（`test/mechanism.test.mjs` 全部使用 fake ctx/工具）
- Supported verification platforms: Node >= 18（ESM）、bash、python3（仅安装脚本冒烟用）；证据见 `docs/development/START.md`
- Broader checks trigger on: 公共导出变化、安装脚本行为变化、机制插件边界变化

## Command authorities

| Check family | Command/config source | Working directory | Expected evidence |
|---|---|---|---|
| 机制插件回归 | `node test/mechanism.test.mjs` | 仓库根 | 全部 `ok`，结尾 `All mechanism tests passed.` |
| 插件语法 | `node --check plugins/bash-redundant-escalation-noop/index.js`、`node --check plugins/bash-escalation/index.js` | 仓库根 | 退出 0 |
| 安装脚本语法 | `sh -n install.sh`、`sh -n uninstall.sh` | 仓库根 | 退出 0 |
| 公共导出一致 | `node -e "import('./plugins/<p>/index.js').then(m => console.log(m.name, m.inject))"` | 仓库根 | 与 `package.json` 导出一致 |
| 适配状态/路由 | `agent-project-guides/scripts/install.sh check` | 仓库根 | `Routing and adaptation state are valid.` |

## Change matrix

| Change type/scope | Fast check | Required checks | Broader trigger | External risk/cost |
|---|---|---|---|---|
| 文档/README 仅变更 | `git diff --check`（尾随空白） | 无 | 生成参考/索引变化 | 0 |
| 机制插件内部逻辑 | `node --check plugins/bash-redundant-escalation-noop/index.js` | `node test/mechanism.test.mjs`（必须全绿） | 共享边界变化 | 0（不得在真实 DSH 会话中误测） |
| 提示层插件 | `node --check plugins/bash-escalation/index.js` | 人工核对提示段语义（无独立测试） | order 语义变化 | 0 |
| 安装/卸载 CLI | `sh -n install.sh` / `sh -n uninstall.sh` | 沙箱 `~/.dsh` 冒烟（复制 + `cordis.patch.yml` 相对引用） | 真实 profile 重装 | 只写沙箱/自有目录 |
| 公共导出/package.json | `node -e "import(...)"` | 与 `index.js` 实际导出一致 | 兼容性/安装面 | 0 |
| 适配状态/路由 | `agent-project-guides/scripts/install.sh check` | `check-update` 只读对比 | 包版本变化 | 0（脚本只读） |

## Live, destructive, and costly checks

| Check | Environment/data | Approval | Budget/stop condition | Cleanup/rollback |
|---|---|---|---|---|
| 安装/卸载冒烟 | 临时/沙箱 `~/.dsh`（或临时 HOME） | 无（本地沙箱） | 只写沙箱；出界即停 | 删除沙箱目录 |
| 真实 `~/.dsh/profiles/` 安装 | 真实用户 profile | 用户明确要求 + 沙箱冒烟先通过 | 只触碰自有目录；失败即停 | 重跑 `uninstall.sh` |

## Evidence and incomplete verification

报告实际运行/跳过的命令、范围、环境、结果与产物。跳过或失败时说明原因、剩余风险和后续步骤；绝不把未运行的检查写成通过。当前已运行（本轮 readapt）：`install.sh check`、`check-update`、`node --check` 两个插件、`sh -n` 两个脚本、`node test/mechanism.test.mjs`（见最终报告）。
