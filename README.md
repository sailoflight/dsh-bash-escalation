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
| `bash-redundant-escalation-noop` | `./plugins/bash-redundant-escalation-noop/index.js` | mechanism | Injects directly into the real `bash` tool: wraps its `execute` in place so `sandbox_permissions`/`justification` are stripped ONLY when requested ≤ current (never a real escalation). Genuine escalation passes through untouched. |

## Why the mechanism plugin is an in-place injection, not a copy

The plugin grabs the **actual global `bash` definition object** held by the
tools registry and overwrites its `execute` method in place:

- The registry stores that same object reference, so every consumer (all
  agents) automatically sees the wrapper — no shadow, no re-registration, no
  agent hooks needed.
- **Nothing is copied**: schema, description, parameters, presentation and
  timeout all remain the original's own live properties. An upstream update to
  the real tool can never be stale, because we modify the very object it
  updates.
- The wrapper delegates to the **captured real execute** (`realExecute`), so
  there is no recursion and normal calls / genuine escalations are byte-for-byte
  the real tool's behaviour.
- A stable marker key keeps the wrap idempotent across HMR / re-apply.

If anything fails, it logs a warning and leaves the stock bash untouched
(fail-safe).

## Layout

```
dsh-bash-escalation/
├── install.sh            # clean installer (no pnpm, no network, no absolute paths)
├── uninstall.sh          # clean uninstaller
├── README.md
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

## Notes

- Survives `npm update --global @deepseek-ai/dsh` (profiles are under `~/.dsh`,
  not the global CLI node_modules).
- Re-run `install.sh` to re-install after a profile is recreated.

## GitHub

Hosted at `github.com/sailoflight/dsh-bash-escalation` (SSH remote
`git@github.com:sailoflight/dsh-bash-escalation.git`). Changes are committed
and pushed from your real terminal with normal `git` commands (using the GitHub
SSH key `~/.ssh/id_ed25519_github`).
