# dsh-bash-escalation

Local DSH plugins that stop models from sending **redundant / non-widening**
`sandbox_permissions` on the `bash` tool, which previously hard-failed with:

```
Error: sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode
```

Two plugins, both installed per DSH profile (`web`, `dsh-tui`, `headless`):

| Plugin | Package name | Type | What it does |
|---|---|---|---|
| `bash-escalation` | `@dsh-local/bash-escalation` | prompt | Adds a system-prompt section: only set `sandbox_permissions` when the requested mode is STRICTLY WIDER than the session's current mode; equal/narrower → omit it. |
| `bash-redundant-escalation-noop` | `@dsh-local/bash-redundant-escalation-noop` | mechanism | Injects directly into the real `bash` tool: wraps its `execute` in place so `sandbox_permissions`/`justification` are stripped ONLY when requested ≤ current (never a real escalation). Genuine escalation passes through untouched. |

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
~/code/dsh-bash-escalation/
├── install.sh            # idempotent installer (no pnpm, no network)
├── README.md
└── plugins/
    ├── bash-escalation/            → @dsh-local/bash-escalation
    └── bash-redundant-escalation-noop/  → @dsh-local/bash-redundant-escalation-noop
```

## Install

```bash
bash ~/code/dsh-bash-escalation/install.sh
```

Then **restart every DSH terminal** (web / tui / headless).

What the installer does per profile:
1. `ln -s` the project plugins into `~/.dsh/profiles/<p>/node_modules/@dsh-local/`.
2. Rewrites `cordis.patch.yml` `name:` from `./plugins/...` to `@dsh-local/...`.

It **never touches `~/.dsh/profiles/<p>/plugins/`** — that directory is a
shared convention others may put plugins in, so we leave it alone. Any old
`./plugins/...` copies simply become orphaned (no longer referenced), which is
harmless. The uninstaller likewise only removes our `@dsh-local` links and the
loader entries.

## Notes

- Survives `npm update --global @deepseek-ai/dsh` (profiles are under `~/.dsh`,
  not the global CLI node_modules).
- Re-run `install.sh` to re-install after a profile is recreated.

## GitHub

Upload to GitHub (owner `sailoflight`, same repo name `dsh-bash-escalation`):

1. On GitHub, create an **empty** repo named `dsh-bash-escalation`
   (GitHub does not auto-create on push).
2. In your real terminal:
   ```bash
   bash ~/code/dsh-bash-escalation/git-push.sh
   ```

The script uses your GitHub SSH key `~/.ssh/id_ed25519_github` via
`GIT_SSH_COMMAND` (no global SSH config changes), sets the git identity to
`lijq <lijq@localhost>` (matching taobao-mcp), and is idempotent.
