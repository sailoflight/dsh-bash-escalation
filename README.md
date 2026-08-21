# dsh-bash-escalation

Local DSH plugins that stop models from sending **redundant / non-widening**
`sandbox_permissions` on the `bash` tool, which previously hard-failed with:

```
Error: sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode
```

Two plugins, both installed per DSH profile (`web`, `dsh-tui`, `headless`):

| Plugin | Referenced as (relative) | Type | What it does |
|---|---|---|---|
| `bash-escalation` | `./plugins/bash-escalation/index.js` | prompt | Adds a system-prompt section: only set `sandbox_permissions` when the requested mode is STRICTLY WIDER than the session's current mode; equal/narrower → omit it. |
| `bash-redundant-escalation-noop` | `./plugins/bash-redundant-escalation-noop/index.js` | mechanism | Wraps the `execute` of **every escalation-capable tool** (bash, the fs `write`/`edit` tools, pwsh — anything whose parameter schema declares `sandbox_permissions`) in place, at **resolution time**, so global and per-agent (preset-mounted) definitions are covered no matter when they appear — and strips `sandbox_permissions`/`justification` ONLY when requested ≤ current (never a real escalation). Genuine escalation passes through untouched. Bash **variants without escalation support** (PTY-backed persistent/terminal bash from custom agent presets) fail loud with the stock message instead of silently ignoring a genuine escalation. |

## Why the mechanism plugin wraps at resolution time

The plugin patches `ctx.tools.get` on the tools registry and overwrites the
resolved `bash` definition's `execute` method **in place**. Wrapping on
**access**, not on discovery, is the whole point:

- **The `bash` a session sees is not one stable object.** In the web profile
  the global `tool-bash` row is disabled; each session mounts an agent preset
  that registers a **fresh** bash definition into that agent's scope layer.
  TUI/headless keep a process-global one. Objects appear and disappear at
  runtime — session creation, preset (re)mount, HMR re-registration.
- Wrapping only the objects visible at apply / `agent/created` /
  `tools/change` time occasionally missed one (the preset's bash not mounted
  yet when `agent/created` fired; an agent not yet in `agents.list()` during a
  `tools/change` sweep), so a session whose effective bash then **degraded to
  that unwrapped object** hard-failed again with
  `sandbox escalation ... is not strictly wider ...`.
- Every dispatch re-resolves the tool through `ctx.tools.get(name, scope)` at
  call time, so patching `get` itself covers **any** bash that can ever
  execute — global or per-agent, whenever it appears, including a replacement
  object after HMR — the moment it is first resolved. The eager apply-time
  sweep and the `agent/created` / `tools/change` listeners stay as
  belt-and-braces.
- **Nothing is copied**: schema, description, parameters, presentation and
  timeout remain the original's own live properties. The wrapper delegates to
  the **captured real execute**, so there is no recursion and normal calls /
  genuine escalations are byte-for-byte the real tool's behaviour.
- **HMR / re-apply safe**: the wrap marker records `{ real, wrapped }`, so a
  reloaded module restores the original `execute` and re-wraps with fresh
  closures (no stale wrapper over a disposed ctx), and the `get()` patch is
  restored on dispose and re-installed fresh on re-apply.
- **Fail-safe**: any problem logs a warning and leaves the stock bash
  untouched. If the session's effective sandbox mode cannot be resolved we pass
  through rather than guess — wrongly stripping would bypass a REAL user
  approval.

## Bash variants (custom agent presets)

A session's `bash` is not always the stock `@deepseek-ai/dsh-tool-bash`.
Custom agent presets can disable that row and mount a different implementation
under the **same tool name** `bash`:

- `@deepseek-ai/dsh-terminal-bash` + `@deepseek-ai/dsh-tool-bash-persistent`
  (a PTY-backed persistent shell), e.g. the user-installed `liangshen` preset
  (`~/.dsh/.agent-presets/liangshen/agent.cordis.yml`): its
  `- id: tool-bash ... disabled: true` row plus a `persistent-shell` group
  mounting `persistent-bash` / `terminal-bash`.

These variants' parameter schema declares **only** `command` — the tool has no
escalation machinery at all. The mechanism plugin derives escalation support
from the definition's **own parameter schema** (`sandbox_permissions`
declared or not), so behaviour follows whatever bash the composition actually
mounts.

The plugin is **not bash-only**: the same redundant-escalation failures occur
on the filesystem tools (`dsh-tool-fs`'s `write`/`edit` — the observed
"not strictly wider" and "invalid justification" errors came from `edit`/
`write`, not bash) and on `dsh-tool-pwsh`. The `get()` patch wraps **any tool
whose parameter schema declares `sandbox_permissions`** (plus `bash` always,
so schema-less PTY variants still fail loud), so `write`/`edit`/`pwsh` get
the identical strip/pass-through treatment with no per-tool configuration.

Behaviour per tool:

| Case | Stock bash | Persistent / terminal bash variant |
|---|---|---|
| No `sandbox_permissions` in args | passes through | passes through |
| Redundant (requested ≤ session mode) | stripped, runs | stripped, runs |
| Genuine (requested > session mode) | passes through → approval flow + strict-widening check | **fails loud**: `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)` |

Failing loud (instead of letting the variant silently ignore the request)
matters: a genuine escalation handed to a PTY-backed bash would run the
command under the standing, narrower mode, the sandbox would deny it again,
and the model would see no reason why. The error is the stock tool's own
message for a composition that cannot escalate.

## Layout

```
dsh-bash-escalation/
├── install.sh            # clean installer (no pnpm, no network, no absolute paths)
├── uninstall.sh          # clean uninstaller
├── README.md
├── test/
│   └── mechanism.test.mjs          # regression tests (node test/mechanism.test.mjs)
└── plugins/
    ├── bash-escalation/            → copied to each profile's plugins/
    └── bash-redundant-escalation-noop/
```

## Install

```bash
bash <path-to>/dsh-bash-escalation/install.sh
```

Then **restart every DSH terminal** (web / tui / headless).

What the installer does per profile:
1. Copies our two plugins into `~/.dsh/profiles/<p>/plugins/` (the standard
   DSH local-plugin directory). Only our own named dirs are touched.
2. Writes `cordis.patch.yml` entries as **relative** `./plugins/...` references.
3. Cleans up any old `node_modules/@dsh-local` symlinks.

**No node_modules, no pnpm, no network, and no absolute paths are written
anywhere.** The source location is derived at runtime from the script's own
path, so it works no matter where the project is cloned, and it never interferes
with other people's plugins or their `pnpm install`.

## Testing

The mechanism plugin ships with a dependency-free regression suite:

```bash
node test/mechanism.test.mjs
```

It covers the failure the wrap-on-access design fixes — a fresh per-agent bash
mounted AFTER apply, invisible to `agent/created` / `tools/change`, must be
wrapped on its first `get()` resolution — plus redundant vs genuine
escalation, policy-resolution failure (pass-through, never a wrong strip),
HMR re-apply (fresh wrapper, no chained patches), dispose (get() restored),
bash **variants without escalation support** (redundant stripped, genuine
escalation fails loud with the native message, plain calls pass through), and
**non-bash escalation tools** (an fs-style `write` gets wrapped by schema,
redundant escalations stripped, genuine ones passed through; a tool without
the escalation fields stays untouched).

## Notes

- Survives `npm update --global @deepseek-ai/dsh` (profiles are under `~/.dsh`,
  not the global CLI node_modules).
- Re-run `install.sh` to re-install after a profile is recreated.

## GitHub

Hosted at `github.com/sailoflight/dsh-bash-escalation` (SSH remote
`git@github.com:sailoflight/dsh-bash-escalation.git`). Changes are committed
and pushed from your real terminal with normal `git` commands (using the GitHub
SSH key `~/.ssh/id_ed25519_github`).
