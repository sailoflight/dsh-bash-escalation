# bash-redundant-escalation-noop contract

Status: verified（由 `test/mechanism.test.mjs` 覆盖）
Scope: `plugins/bash-redundant-escalation-noop/`
Architecture parent: `../architecture/OVERVIEW.md`

## Owns

- 在工具解析时（wrap-on-access）原位包装升级工具：patch `ctx.tools.get(name, scope)`，使任何在调用时可解析到的带 `sandbox_permissions` 的工具（bash、fs `write`/`edit`、`pwsh` 等）在首次解析瞬间被包装——无论它何时出现（apply 之后挂载的 agent preset、HMR 替换对象、全局或 per-agent 作用域）。
- 原位修改解析对象的 `execute` 为包装器，并委托给捕获的真实 execute（不复制 schema/描述/参数/超时，不递归）。
- 仅在 `requested <= 当前有效 mode`（冗余/非变宽）时删除 `sandbox_permissions` + `justification`；其余一律原样透传。
- bash 变体（参数 schema 无 `sandbox_permissions`，如 PTY 持久/终端 bash）的冗余剥离；真实升级失败报错（上游措辞）。
- 兜底扫描：apply 时 sweep 全局 + 已知 agent，并监听 `agent/created`、`tools/change`。
- HMR/re-apply 安全：`WRAP_KEY` 记录 `{ real, wrapped }`，重装先恢复再重包；`PATCH_KEY` 使 dispose 恰好一次恢复原始 `get`。
- 失败安全：任何异常只记录日志并保持 stock 工具不动；策略解析失败时透传而非错误剥离。

## Does not own

- 真实审批流程与严格变宽检查本身 -> owner: DSH 宿主工具 + `sandboxPolicy`。
- 工具 schema、描述、展示与超时属性（始终是原始对象自己的 live 属性） -> owner: 各宿主工具。
- 提示层的模型可见规范 -> owner: `bash-escalation` 提示层插件。
- DSH 宿主的工具注册/预设挂载时序 -> owner: DSH 宿主（只能通过 wrap-on-access 覆盖）。

## Public surface and entrypoints

| Kind | Path/symbol/schema | Consumer | Stability |
|---|---|---|---|
| runtime/public | `plugins/bash-redundant-escalation-noop/index.js` 导出 `name`、`inject`、`apply(ctx)` | DSH 宿主（profile 插件装载器） | public（插件契约稳定） |
| test | `test/mechanism.test.mjs`（`import { apply }`） | 开发/CI | internal |

## Contracts and invariants

- 模式排序 `MODE_RANK = { 'read-only': 0, 'workspace-write': 1, 'danger-full-access': 2 }`；未知 mode 记为 -1。
- 仅当 `requested !== undefined && effectiveMode !== undefined && (MODE_RANK[requested] ?? -1) <= (MODE_RANK[effectiveMode] ?? -1)` 才剥离；绝不在此条件之外剥离。
- 无 `sandboxPolicy` 服务或 `resolve()` 抛错 → 透传，不崩溃、不错误剥离。
- `bash` 一律按名包装（含无 schema 的变体）；其他工具仅当自身 schema 声明 `sandbox_permissions` 才包装。
- 变体（无升级 schema）+ 真实升级 → 抛出 `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`；冗余 → 剥离后运行；普通调用 → 直通。
- 包装原位进行且幂等（`WRAP_KEY`）；re-apply 时若仍持有旧 wrapper 则先恢复真实 execute 再重包（新闭包、不链式）；dispose 恢复原始 `get`。
- 包装器委托给捕获的真实 execute，无递归、无副本。

## Dependencies

- Allowed: 宿主注入的 `ctx.tools.get`、`ctx.get('sandboxPolicy')`（可选）、`ctx.agents.list()`、`ctx.on('agent/created'|'tools/change'|'dispose')`、`ctx.logger`（可选）。
- Forbidden: import 其它插件模块；node_modules/pnpm/网络；修改工具 schema/描述/超时；绕过或冒充真实审批。需要这些能力时改用宿主或其它 authority。

## State, data, configuration, and generated files

| Item | Authority/owner | Read/write behavior | Lifecycle/regeneration |
|---|---|---|---|
| `package.json`（`@dsh-local/bash-redundant-escalation-noop`, type module, main index.js） | 插件 | 只读契约元数据 | 源码控制；版本与导出一致 |
| `WRAP_KEY` / `PATCH_KEY` 标记 | 插件实例 | 运行期写在 live 对象上，可配置、dispose 清理 | 运行期；重载重装 |
| `MODE_RANK` 模式排序 | 插件 | 运行期只读常量 | 源码内 |

## Side effects and failure behavior

| Action/failure | Effect | Idempotency/retry | Required gate |
|---|---|---|---|
| patch `ctx.tools.get` / 包装 execute | 运行期内存修改 | 幂等（`WRAP_KEY`/`PATCH_KEY`）；re-apply 恢复再重包 | 无额外权限（本地内存） |
| 包装/扫描异常 | 记录日志，stock 工具保持不动 | fail-safe 不重试 | 无 |
| 策略解析失败 | 透传参数 | 不重试 | 无（绝不猜测剥离） |
| 变体 + 真实升级 | 抛上游措辞错误，命令不执行 | 调用方自行处理 | 无 |

## Verification and change impact

| Change | Required check | Other authority to update |
|---|---|---|
| 任何逻辑/边界变化 | `node test/mechanism.test.mjs`（必须全绿）+ `node --check plugins/bash-redundant-escalation-noop/index.js` | `../architecture/OVERVIEW.md`、`README.md` 行为表 |
| 导出/package.json 变化 | `node -e "import('./plugins/bash-redundant-escalation-noop/index.js').then(m => console.log(m.name, m.inject))"` 与 `package.json` 一致 | 本契约、`../usage/CLI.md`（若影响安装） |

## Unknowns

- DSH 宿主内部预设挂载时序与 PTY 变体（如 `liangshen`）具体实现细节未知且不属本仓库；机制插件以自身 schema 推导行为，测试用 fake 覆盖该场景。
