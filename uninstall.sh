#!/usr/bin/env bash
# Uninstall the dsh-bash-escalation plugins from every DSH profile.
#
# Per profile this:
#   1. Removes the node_modules/@dsh-local symlinks (the installed link points
#      back to ~/code/dsh-bash-escalation/plugins/*).
#   2. Removes the `bash-escalation-guidance` and `bash-redundant-escalation-noop`
#      entries from cordis.patch.yml (handles both `./plugins/...` and
#      `@dsh-local/...` name forms), while leaving other entries (e.g. the
#      taobao MCP client) intact. If a profile's insert list becomes empty it
#      is reset to the original `[]`.
#   We deliberately do NOT touch "$dir/plugins/..." — that shared directory
#   may hold plugins created by others; any orphaned copies are harmless.
#
# Usage:
#   bash ~/code/dsh-bash-escalation/uninstall.sh
# then restart every DSH terminal (the in-memory wrap disappears on reboot).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES="web dsh-tui headless"

for p in $PROFILES; do
  dir="$HOME/.dsh/profiles/$p"
  [ -d "$dir" ] || { echo "skip: $dir not found"; continue; }
  echo "== $p =="

  # 1) symlinks (only our own @dsh-local links)
  rm -f "$dir/node_modules/@dsh-local/bash-escalation" \
        "$dir/node_modules/@dsh-local/bash-redundant-escalation-noop"
  rmdir --ignore-fail-on-non-empty "$dir/node_modules/@dsh-local" 2>/dev/null || true

  # 2) drop the loader entries (id-based, comment-preserving)
  python3 - "$dir/cordis.patch.yml" <<'PY'
import re, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    lines = f.readlines()

SKIP = {"bash-escalation-guidance", "bash-redundant-escalation-noop"}
out = []
i = 0
removed = False
while i < len(lines):
    line = lines[i]
    m = re.match(r"^\s*- id:\s*([A-Za-z0-9_-]+)\s*$", line)
    if m and m.group(1) in SKIP:
        # drop indented comments that belonged to this entry (keep header cmts)
        while out and not out[-1].startswith("#") and out[-1].lstrip().startswith("#"):
            out.pop()
        i += 3  # id, name, config
        removed = True
        continue
    out.append(line)
    i += 1

if not removed:
    sys.exit(0)

text = "".join(out)
# empty insert list -> restore the original top-level `[]`, but ONLY when no
# `- id:` entry remains anywhere (otherwise other entries, e.g. mcp-taobao,
# would be wrongly truncated).
if re.search(r"^-\s*insert:\s*$", text, re.M) and not re.search(r"^\s+- id:", text, re.M):
    text = text.split("- insert:", 1)[0] + "[]\n"

with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY
  echo "   removed plugin entries from cordis.patch.yml"
done

echo
echo "Done. Restart every DSH terminal to drop the in-memory bash wrap."
echo "Verify: grep -n 'bash-escalation' ~/.dsh/profiles/*/cordis.patch.yml  (should be empty)"
