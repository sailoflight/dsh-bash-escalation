# Development start

## Supported environments

| Runtime/platform | Supported range | Evidence |
|---|---|---|
| Node.js | >= 18（ESM，`node:assert/strict`，无第三方依赖） | `test/mechanism.test.mjs` 头部注释；`plugins/*/package.json` 的 `"type": "module"` |
| Shell | bash（`set -euo pipefail`） | `install.sh` / `uninstall.sh` shebang 与首部 |
| Python | python3（仅安装/卸载脚本改写 `cordis.patch.yml` 用） | `install.sh` / `uninstall.sh` 内嵌 heredoc |
| DSH 宿主 | web / tui / headless profile 的本地插件装载契约 | `README.md` Install 一节 |

## Bootstrap

```text
无需安装依赖：仓库内没有任何 node_modules / pnpm / 网络步骤。
克隆后直接可用：node 和 bash 即可跑测试与语法检查。
```

- 工作目录：仓库根（`node test/mechanism.test.mjs`、`node --check ...` 均以根为 cwd）。
- 网络行为：offline；不触发网络、不下载。
- 凭据：无；本仓库不涉及任何密钥。

## Entrypoints

| Purpose | Command/path | Scope/output | Side effects |
|---|---|---|---|
| Run（安装到 DSH profile） | `bash install.sh` | 写 `~/.dsh/profiles/<web,dsh-tui,headless>/plugins/` 与 `cordis.patch.yml` | 写真实 profile（见 `../usage/CLI.md`；默认 forbidden，需用户授权 + 沙箱冒烟） |
| Run（卸载） | `bash uninstall.sh` | 删除自有插件目录与 `cordis.patch.yml` 条目 | 写真实 profile（同上） |
| Fast check（语法） | `node --check plugins/bash-redundant-escalation-noop/index.js` 与 `node --check plugins/bash-escalation/index.js` | 插件模块 | none |
| Fast check（脚本语法） | `sh -n install.sh` / `sh -n uninstall.sh` | 安装脚本 | none |
| Test | `node test/mechanism.test.mjs` | 机制插件回归（redundant/genuine/策略失败/HMR/dispose/变体/非 bash 工具） | 无（纯 fake，不触碰宿主） |
| Generate | 无生成产物；插件导出由源码直接定义 | — | — |

## Task routing

| Change area | Contract/entry | Matching verification |
|---|---|---|
| 机制插件 | `plugins/bash-redundant-escalation-noop/index.js` | `../verification/MATRIX.md` 机制插件行 |
| 提示层插件 | `plugins/bash-escalation/index.js` | `../verification/MATRIX.md` 提示层行 |
| 安装/卸载 CLI | `install.sh` / `uninstall.sh` | `../verification/MATRIX.md` 安装/卸载行 |
| 公共导出/package.json | 各 `plugins/*/package.json` | `../verification/MATRIX.md` 公共导出行 |

## Configuration, state, and data

| Item | Owner/source | Committed? | Local/test rule |
|---|---|---|---|
| 插件 `package.json`（name/version/type/main） | 各插件目录 | yes | 与 `index.js` 实际导出一致 |
| 沙箱 `~/.dsh` 冒烟目录 | 测试时临时创建 | no | 只在临时/沙箱路径测试安装脚本 |
| 无 secrets / 无外部状态 | — | — | 本仓库离线、无凭据 |

## Generated artifacts

| Output | Source | Regenerate | Check drift |
|---|---|---|---|
| （无） | — | — | 插件导出不复制进文档；`docs/modules/*.md` 只链接权威源码 |

## Common failures

| Symptom | Cheapest check | Exact detail/runbook |
|---|---|---|
| 机制测试失败 | `node test/mechanism.test.mjs` | `../verification/MATRIX.md` 机制插件行 |
| `sandbox escalation ... is not strictly wider` 复现 | 确认插件已装、终端已重启 | `../usage/CLI.md` 安装/重启步骤 |
| 安装脚本报 python3 缺失 | `command -v python3` | `README.md` Install 一节 |
