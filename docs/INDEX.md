# Documentation index

## Current authorities

| Concern | Authority | Evidence/source |
|---|---|---|
| Current behavior | `plugins/**/index.js` + `test/mechanism.test.mjs` | `plugins/*/package.json`（type module / main） |
| Public contract | 各插件导出 `name`/`inject`/`apply`；`install.sh`/`uninstall.sh` 命令面 | `docs/usage/CLI.md` |
| Module boundaries | `architecture/OVERVIEW.md` + `modules/` | `plugins/**/index.js` 实现 |
| Verification selection | `verification/MATRIX.md` | `test/mechanism.test.mjs`、`node --check`、`sh -n` |
| Historical rationale | 无 ADR；见 `plugins/bash-redundant-escalation-noop/index.js` 头部注释与 `README.md` | 实现注释 |

## Read by role

| Role | Start here | Do not preload |
|---|---|---|
| Developer | `development/START.md` | usage、operations、evidence，除非任务需要 |
| Maintainer | `development/START.md` 或一个模块契约 | production usage 与 operations |
| Reviewer | `verification/MATRIX.md` + 目标 diff/契约 | 包适配流程与生产文档 |
| Field Evaluator | 非生产 usage（`usage/CLI.md`） | production operations、整仓源码 |
| User | `usage/CLI.md`（安装/卸载） | development、内部 architecture、operations |

## Read by task

| Need | First read | Next exact detail |
|---|---|---|
| 修改源码 | `development/START.md` | 一个 `modules/<module>.md` + 匹配测试 |
| 理解边界 | `architecture/OVERVIEW.md` | 一个模块契约 |
| 选择验证 | `verification/MATRIX.md` | 精确测试命令（`node test/mechanism.test.mjs`） |
| 使用公共能力（安装插件） | `usage/CLI.md` | 精确命令与副作用 |
| 查已知行为 | `README.md` + `verification/MATRIX.md` | 命中的测试 |

## Non-authoritative collections

无 `evidence/`、`generated/`、`knowledge/`、`roadmap/` 目录（本仓库无动态生成物与未实现路线图）。
