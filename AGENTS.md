<!-- agent-project-guides:v3:start -->
## Project governance routing

Project ID: `dsh-bash-escalation`; variant: `shared-runtime.pinned`; pinned release: `3.0.3` / `sha256:f3dc0ca9cd50d27deac2b4e9c063d243dd3ce20127edc88d9f8b4c3aac4bd603`; manifest: `sha256:5d06293b2c85022ccdf61ffb32423b35fbda795371a8bf9158225908fbc16e88`.

Before work, run `apg context --target . --task <current-task> --format context` and use only the returned governance content. Resolve any ambiguity before protected work. The shared CLI and exact packed digest are runtime dependencies; missing content fails explicitly and never falls back to `latest`. Returned sources are intended context and do not prove model-effective context.
<!-- agent-project-guides:v3:end -->

## Project scope

`dsh-bash-escalation` 提供两个可复用的本地 DSH 插件包（`plugins/bash-escalation` 提示层 + `plugins/bash-redundant-escalation-noop` 机制层），阻止模型对 `bash` / fs `write`/`edit` / `pwsh` 工具发送冗余（非严格变宽）的 `sandbox_permissions`；随附无依赖的 `install.sh`/`uninstall.sh` 安装脚本与 Node 回归测试。主类型：library（可复用插件包），安装 CLI 为投递便捷面。

## Repository map

| Area | Owns | Start at |
|---|---|---|
| `plugins/bash-redundant-escalation-noop/` | 机制：运行时原位包装升级工具、剥离冗余升级、变体失败报错、HMR/dispose 恢复 | `docs/modules/bash-redundant-escalation-noop.md` |
| `plugins/bash-escalation/` | 提示层：一条模型可见的升级规范提示段 | `docs/modules/bash-escalation.md` |
| `install.sh` / `uninstall.sh` | 安装/卸载 CLI：复制插件、写相对 `cordis.patch.yml`、清理旧 symlink | `docs/usage/CLI.md` |
| `test/` | 机制插件回归测试 | `docs/verification/MATRIX.md` |

## Instruction scope

- 选中根文件对整个仓库生效；更近的目录级 `AGENTS.md` 只加子树局部差异（当前无）。
- 项目细节经 `docs/INDEX.md` 路由；不预读文档树。

## Global invariants

- 机制插件 `bash-redundant-escalation-noop` 绝不剥离真实（严格变宽）升级：requested > 当前 mode 时必须原样透传给真实 execute 的审批/严格变宽检查；策略解析失败时透传而非猜测剥离。
- 包装必须原位进行并委托给捕获的真实 execute（不复制 schema/参数、不递归、HMR/dispose 可恢复）；不得把 `inferred/unknown` 写成已验证事实。
- 插件包 `package.json` 的 `name`/`main`/`type` 与 `index.js` 实际导出必须一致；版本号变更需同步 `package.json`。
- 支持运行时：Node >= 18（ESM，无依赖），DSH 宿主（web/tui/headless profile）按插件契约装载；`install.sh`/`uninstall.sh` 需要 `bash` 与 `python3`。
- 安装脚本保持无依赖：不写 node_modules/pnpm/网络请求或绝对路径；只触碰自有目录与 `cordis.patch.yml` 相对引用。
- 不改动 managed routing block 与适配状态，除通过 `agent-project-guides/scripts/install.sh`。
- 保留用户和其他 agent 在授权范围外的并行修改。

## Risk gates

| Action | Default | Required authorization/evidence |
|---|---|---|
| 写入真实 `~/.dsh/profiles/`（安装/卸载） | forbidden | 用户明确要求 + 沙箱冒烟先验证 |
| 生产/网络/真实数据/迁移/发布 | forbidden | 本仓库无此类动作 |
| 修改 managed routing / 适配状态 | forbidden | 仅经 `agent-project-guides/scripts/install.sh` |

## Authoritative entrypoints

| Need | Authority |
|---|---|
| Development setup and commands | `docs/development/START.md` |
| Current boundaries | `docs/architecture/OVERVIEW.md` |
| Change verification | `docs/verification/MATRIX.md` |
| Role/task routing | `docs/INDEX.md` |
