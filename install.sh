#!/usr/bin/env bash
# Install the local DSH bash-escalation plugins into every DSH profile.
#
# It links the canonical plugin source (this project) into each profile's
# node_modules as @dsh-local/<name> and switches the loader entries in
# cordis.patch.yml from './plugins/...' to clean '@dsh-local/...' names.
#
# - No pnpm, no network: a plain symlink is enough for Node to resolve the
#   bare package name from the profile.
# - Survives `npm update --global @deepseek-ai/dsh` (that only touches the
#   global CLI node_modules, not the profile).
# - Idempotent: safe to re-run (e.g. after a profile is recreated).
#
# Usage (run from your normal terminal, once per machine):
#   bash ~/code/dsh-bash-escalation/install.sh
# then restart every DSH terminal (web / tui / headless).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES="web dsh-tui headless"

for p in $PROFILES; do
  dir="$HOME/.dsh/profiles/$p"
  [ -d "$dir" ] || { echo "skip: $dir not found"; continue; }
  echo "== $p =="
  mkdir -p "$dir/node_modules/@dsh-local"
  ln -sfn "$PROJECT_DIR/plugins/bash-escalation"                     "$dir/node_modules/@dsh-local/bash-escalation"
  ln -sfn "$PROJECT_DIR/plugins/bash-redundant-escalation-noop"      "$dir/node_modules/@dsh-local/bash-redundant-escalation-noop"
  ls -l "$dir/node_modules/@dsh-local"

  # NOTE: we deliberately DO NOT touch "$dir/plugins/..." — that directory is
  # a shared convention other people may put plugins in, and we cannot
  # guarantee its contents are ours. Any old ./plugins copies simply become
  # orphaned (no longer referenced once the names below are switched), which
  # is harmless.

  # Switch loader names to the package names (idempotent).
  sed -i "s|'\./plugins/bash-escalation/index\.js'|'@dsh-local/bash-escalation'|g" "$dir/cordis.patch.yml"
  sed -i "s|'\./plugins/bash-redundant-escalation-noop/index\.js'|'@dsh-local/bash-redundant-escalation-noop'|g" "$dir/cordis.patch.yml"
done

echo
echo "Done. Restart every DSH terminal now."
echo "Verify names: grep -n \"name: '@dsh-local\" ~/.dsh/profiles/*/cordis.patch.yml"
