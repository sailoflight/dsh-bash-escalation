# dsh-bash-escalation architecture

Status: verified
Scope: repository（library——两个可复用 DSH 插件包 + 安装 CLI）
Evidence: `plugins/**/index.js`、`install.sh`/`uninstall.sh`、`test/mechanism.test.mjs`

## System context

当前实现的系统：两个本地 DSH 插件，被 DSH 宿主（web / tui / headless profile）按插件契约装载，阻止模型对 `bash` / fs `write`/`edit` / `pwsh` 工具发送冗余（非严格变宽）的 `sandbox_permissions`。

- 机制插件在工具解析时（wrap-on-access）原位包装任何带 `sandbox_permissions` 的升级工具：剥离冗余请求、透传真实升级、变体失败报错、HMR/dispose 恢复。
- 提示层插件追加一段模型可见的系统提示，指导只在严格变宽时才写 `sandbox_permissions`。
- `install.sh`/`uninstall.sh` 复制/移除插件并维护 `cordis.patch.yml` 相对引用，无 pnpm/网络/绝对路径。

显式排除：DSH 宿主内部的工具注册、预设挂载时序、审批流程实现（属宿主，不在本仓库内）。

## Runtime topology

| Unit/process/package | Responsibility | Lifecycle owner | Communicates through |
|---|---|---|---|
| DSH 宿主 profile（web/tui/headless） | 装载本地插件、解析工具、执行审批/严格变宽检查 | 用户/DSH | 插件契约（`name`/`inject`/`apply`）、`ctx` 服务 |
| `plugins/bash-redundant-escalation-noop` | 原位包装升级工具、剥离冗余、变体失败报错 | 插件实例（HMR 可重载） | `ctx.tools.get`、`ctx.get('sandboxPolicy')`、`ctx.agents`、`ctx.on` |
| `plugins/bash-escalation` | 注入一条升级规范提示段 | 插件实例 | `ctx.systemPrompt.section` |
| `install.sh`/`uninstall.sh` | 复制/移除插件目录、维护 `cordis.patch.yml` | 每台机器一次 | 文件系统（`~/.dsh/profiles/`） |
| `test/mechanism.test.mjs` | 机制插件回归 | 每次运行 | `import { apply }`（fake ctx） |

## Module boundaries

| Module | Owns | Does not own | Entrypoint | Contract |
|---|---|---|---|---|
| `bash-redundant-escalation-noop`（机制） | 原位包装升级工具、剥离冗余升级、变体失败报错、HMR/dispose 恢复 | schema/描述/超时等原始属性、审批流程本身 | `plugins/bash-redundant-escalation-noop/index.js`（`apply`） | `../modules/bash-redundant-escalation-noop.md` |
| `bash-escalation`（提示层） | 一条模型可见的升级规范提示 | 任何升级/审批机制 | `plugins/bash-escalation/index.js`（`apply`） | `../modules/bash-escalation.md` |
| 安装 CLI | 复制插件、写 `cordis.patch.yml`、清理旧 symlink | 插件运行时行为 | `install.sh` / `uninstall.sh` | `../usage/CLI.md` |
| 测试套件 | 机制插件回归（redundant/genuine/HMR/dispose/变体/非 bash） | 宿主集成 | `test/mechanism.test.mjs` | `../verification/MATRIX.md` |

## Dependency direction

```text
DSH 宿主
  -> plugins/**/index.js（apply 接收注入的 ctx 服务）
      -> ctx.tools.get / ctx.get('sandboxPolicy') / ctx.agents / ctx.on / ctx.systemPrompt.section
install.sh / uninstall.sh
  -> plugins/**（复制）-> ~/.dsh/profiles/<p>/plugins + cordis.patch.yml
test/mechanism.test.mjs
  -> plugins/bash-redundant-escalation-noop/index.js（apply）
```

- Allowed：插件依赖宿主注入的 `ctx` 服务契约；测试依赖 `apply()`；安装脚本依赖仓库内插件目录。
- Forbidden：插件互相 import 或依赖 node_modules/pnpm/网络；安装脚本写绝对路径、触碰他人插件目录或冒充真实升级审批；测试访问真实 DSH 宿主。

## Trust and side-effect boundaries

| Boundary/action | Input identity/trust | Effect | Gate/failure rule |
|---|---|---|---|
| 安装/卸载写 `~/.dsh/profiles/` | 用户本地机器上的真实 profile | 写插件目录与 `cordis.patch.yml` | 默认 forbidden；需用户明确授权 + 沙箱冒烟（见 `usage/CLI.md`） |
| 机制插件对 `ctx.tools.get` 的原位 patch | 宿主工具对象（在调用方进程内） | 运行期内存修改 execute | 失败时只记录日志并保持 stock 工具；dispose 恢复 |
| 策略解析 | `sandboxPolicy.resolve`（宿主） | 只读 | 解析失败透传，绝不猜测剥离 |
| 网络/真实数据/凭据 | — | 无 | 本仓库无此类动作 |

## Data and configuration ownership

| Item | Authority/owner | Lifecycle | Consistency/retention rule |
|---|---|---|---|
| `~/.dsh/profiles/<p>/plugins/<自有目录>` | `install.sh`/`uninstall.sh` | 随 profile 生命周期 | 只触碰 `bash-escalation` 与 `bash-redundant-escalation-noop`；卸载按精确名删除 |
| `cordis.patch.yml` 条目 | `install.sh` | 安装/重装 | 仅写相对 `./plugins/...` 引用；卸载按 id 移除并保留他人条目 |
| 各插件 `package.json`（name/version/type/main） | 各插件 | 源码控制 | 与 `index.js` 实际导出一致 |
| 策略模式（`read-only`/`workspace-write`/`danger-full-access`） | `sandboxPolicy`（宿主） | 运行时 | 机制插件只读取、不修改 |

## Failure and recovery model

- 机制插件包装失败：记录 warning 并保持 stock 工具不动（fail-safe），不崩溃宿主。
- 策略解析失败：透传，不错误剥离（避免绕过真实审批）。
- 变体无升级能力 + 真实升级：抛出上游措辞错误，命令不执行（fail loud，避免静默降权运行）。
- 卸载后内存中的包装在 DSH 终端重启后消失（幂等重跑）。
- 重装/重跑安装脚本幂等；profile 重建后需重跑 `install.sh`。

## Invariants

- 机制插件绝不剥离真实（严格变宽）升级：requested > 当前 mode 时原样透传给真实 execute（测试覆盖）。
- 策略解析失败（无 `sandboxPolicy` 或抛错）时透传，绝不猜测剥离（测试覆盖）。
- 包装原位进行、委托给捕获的真实 execute；同一对象不重复/不链式包装；dispose 恢复原始 `get`；HMR 重装得到全新闭包（测试覆盖）。
- 安装脚本无 node_modules/pnpm/网络/绝对路径副作用；卸载只删除自有内容（`sh -n` + 沙箱冒烟）。

## Unknowns and decisions

- Unknown：用户自定义 agent 预设（如 `liangshen` 的 PTY 持久/终端 bash）具体实现细节在仓库外；机制插件依据该变体自身参数 schema 推导无升级能力并失败报错，行为由测试覆盖。
- Decision：暂无 ADR；wrap-on-access 而非 wrap-on-discovery 的设计理由见 `plugins/bash-redundant-escalation-noop/index.js` 头部注释与 `README.md`。
