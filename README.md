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
| `bash-redundant-escalation-noop` | `./plugins/bash-redundant-escalation-noop/index.js` | mechanism | Wraps the real `bash` tool's `execute` in place — at **resolution time**, so global and per-agent (preset-mounted) bash definitions are covered no matter when they appear — and strips `sandbox_permissions`/`justification` ONLY when requested ≤ current (never a real escalation). Genuine escalation passes through untouched. |

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
HMR re-apply (fresh wrapper, no chained patches) and dispose (get() restored).

## Notes

- Survives `npm update --global @deepseek-ai/dsh` (profiles are under `~/.dsh`,
  not the global CLI node_modules).
- Re-run `install.sh` to re-install after a profile is recreated.

## GitHub

Hosted at `github.com/sailoflight/dsh-bash-escalation` (SSH remote
`git@github.com:sailoflight/dsh-bash-escalation.git`). Changes are committed
and pushed from your real terminal with normal `git` commands (using the GitHub
SSH key `~/.ssh/id_ed25519_github`).
