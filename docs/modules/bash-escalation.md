# bash-escalation contract

Status: verified（实现见 `plugins/bash-escalation/index.js`，逻辑简单且为纯提示注入）
Scope: `plugins/bash-escalation/`
Architecture parent: `../architecture/OVERVIEW.md`

## Owns

- 通过 `ctx.systemPrompt.section(...)` 注入一条模型可见的沙箱升级规范：
  - 仅在需要的 mode **严格变宽于** 会话当前 mode 时才写 `sandbox_permissions`，并配一句话 `justification`；
  - 请求 mode 等于或窄于当前 mode 时不写 `sandbox_permissions`（也不写 `justification`）；
  - 拿不准时先不带这些字段运行，读取 `[sandbox: ...]` 标记后再升级。
- 声明 `inject = ['systemPrompt']`，确保宿主先组合该服务再调用 `apply`。

## Does not own

- 任何升级/审批机制与 `sandbox_permissions` 的强制执行 -> owner: DSH 宿主工具。
- 运行时的冗余剥离 -> owner: `bash-redundant-escalation-noop` 机制插件。

## Public surface and entrypoints

| Kind | Path/symbol/schema | Consumer | Stability |
|---|---|---|---|
| runtime/public | `plugins/bash-escalation/index.js` 导出 `name`、`inject`、`apply(ctx)` | DSH 宿主（profile 插件装载器） | public（插件契约稳定） |

## Contracts and invariants

- 只增加系统提示文本；不修改工具 schema、参数或任何审批行为。
- `apply` 幂等：每次只注册一个 `name='bash-escalation-guidance'` 的 section（宿主负责按 name 去重/替换）。
- section `order: 106`（紧跟 `dsh-tool-bash` 自己的 `tool:bash` section 105 之后）——若该 order 语义在宿主中变化，需同步本文件与源码注释。

## Dependencies

- Allowed: 宿主注入的 `ctx.systemPrompt.section(...)`。
- Forbidden: import 其它插件；node_modules/pnpm/网络；修改任何升级/审批行为。需要时改用宿主 authority。

## State, data, configuration, and generated files

| Item | Authority/owner | Read/write behavior | Lifecycle/regeneration |
|---|---|---|---|
| `package.json`（`@dsh-local/bash-escalation`, type module, main index.js） | 插件 | 只读契约元数据 | 源码控制；版本与导出一致 |

## Side effects and failure behavior

| Action/failure | Effect | Idempotency/retry | Required gate |
|---|---|---|---|
| 注入提示段 | 仅系统提示文本变化 | 幂等（按 name 注册） | 无额外权限 |
| 宿主无 `systemPrompt` | 插件不生效（`inject` 声明保证服务先组合） | 不重试 | 无 |

## Verification and change impact

| Change | Required check | Other authority to update |
|---|---|---|
| 提示文本或 order 变化 | `node --check plugins/bash-escalation/index.js` + 人工核对 `index.js` 注释与 `README.md` 表格 | `../architecture/OVERVIEW.md`、`README.md` |
| 导出/package.json 变化 | `node -e "import('./plugins/bash-escalation/index.js').then(m => console.log(m.name, m.inject))"` 与 `package.json` 一致 | 本契约、`../usage/CLI.md`（若影响安装） |

## Unknowns

- 无。
