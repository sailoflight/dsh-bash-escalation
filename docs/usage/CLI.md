# Install / uninstall CLI usage

Audience: DSH 用户（在自己的终端安装本地插件）
Supported version/range: 本仓库当前版本（插件 `@dsh-local/bash-escalation`、`@dsh-local/bash-redundant-escalation-noop`，见各 `plugins/*/package.json`）
Reference source: `install.sh` / `uninstall.sh`（仓库根）；本页描述稳定工作流，不复制脚本内部实现

## Preconditions and access

- 环境：`bash`（`set -euo pipefail`）+ `python3`（脚本改写 `cordis.patch.yml` 用）；无网络、无 pnpm、无 node_modules。
- 目标：已存在的 DSH profile（`web`、`dsh-tui`、`headless`）在 `~/.dsh/profiles/` 下；不存在的 profile 会被跳过。
- 凭据：无；本安装不涉及任何密钥/账号。

## Supported workflows

| Goal | Entry/capability | Result | Side effect/gate |
|---|---|---|---|
| 安装插件 | `bash <path>/install.sh` | 两个插件复制进每个存在的 profile 的 `plugins/`；`cordis.patch.yml` 写入相对 `./plugins/...` 引用；清理旧 `@dsh-local` symlink | 写 `~/.dsh/profiles/`；需重启 DSH 终端生效 |
| 卸载插件 | `bash <path>/uninstall.sh` | 按精确名删除两个插件目录；按 id 移除 `cordis.patch.yml` 条目；清理旧 symlink | 写 `~/.dsh/profiles/`；重启终端后内存包装消失 |
| 验证安装 | `grep -n "plugins/" ~/.dsh/profiles/*/cordis.patch.yml` | 显示相对引用 | 只读 |
| 验证卸载 | `grep -n 'bash-escalation' ~/.dsh/profiles/*/cordis.patch.yml` | 应为空 | 只读 |

## Inputs and outputs

- 输入：无参数，仅脚本路径；无交互。
- 输出：逐 profile 打印 `== <p> ==`、复制/更新/清理信息，结尾 `Done. Restart every DSH terminal now.`（卸载为 `Done. Restart every DSH terminal to drop the in-memory bash wrap.`）。
- 语义规则：源目录运行时从脚本自身路径推导，不持久化绝对路径；只触碰自有目录/条目，他人插件不动。

## Errors and recovery

| Error/condition | Meaning | Safe next action |
|---|---|---|
| `skip: <dir> not found` | 某 profile 不存在 | 无需处理；安装其它存在的 profile |
| `command not found: python3` | 缺少 python3 | 安装 python3 后重跑脚本 |
| 安装后行为未生效 | 插件已复制但 DSH 终端未重启 | 重启每个 DSH 终端 |
| 行为仍异常（如仍出现 strictly-wider 报错） | 可能旧插件/缓存 | 重跑 `install.sh` 后重启；必要时卸载再装 |

## Security, data, and cost boundaries

- 默认只写 `~/.dsh/profiles/` 下的自有内容；禁止在沙箱外对真实 profile 做破坏性实验（见 `docs/verification/MATRIX.md` 的 live/destructive 小节）。
- 无网络、无真实数据、无费用副作用；卸载幂等、可安全重跑。

## Examples

```bash
# 安装（每台机器一次；profile 重建后重跑）
bash ~/src/dsh-bash-escalation/install.sh

# 卸载
bash ~/src/dsh-bash-escalation/uninstall.sh

# 验证
grep -n "plugins/" ~/.dsh/profiles/*/cordis.patch.yml
```

## Compatibility and deprecation

- 插件随仓库演进；`npm update --global @deepseek-ai/dsh` 不删除 `~/.dsh` 下的 profile 插件。
- 卸载条目兼容 `./plugins/...` 与旧 `@dsh-local/...` 两种 name 形式；回滚 = 重跑 `uninstall.sh` 后重启终端。
