#!/usr/bin/env bash
# Uninstall the dsh-bash-escalation plugins from every DSH profile (clean
# local-plugin install).
#
# Per profile this:
#   1. Removes OUR two plugin dirs `plugins/bash-escalation` and
#      `plugins/bash-redundant-escalation-noop` (by exact name — other
#      people's plugins are untouched).
#   2. Removes the `bash-escalation-guidance` and `bash-redundant-escalation-noop`
#      entries from cordis.patch.yml (handles both `./plugins/...` and
#      `@dsh-local/...` name forms), while leaving other entries (e.g. the
#      taobao MCP client) intact. If a profile's insert list becomes empty it
#      is reset to the original `[]`.
#   3. Cleans up the old `@dsh-local` node_modules symlinks if any remain.
#   No absolute paths are written anywhere.
#
# Usage:
#   bash <path-to>/uninstall.sh
# then restart every DSH terminal (the in-memory wrap disappears on reboot).
set -euo pipefail

PROFILES="web dsh-tui headless"

for p in $PROFILES; do
  dir="$HOME/.dsh/profiles/$p"
  [ -d "$dir" ] || { echo "skip: $dir not found"; continue; }
  echo "== $p =="

  # 1) remove OUR plugin dirs only (exact names, never globs)
  rm -rf "$dir/plugins/bash-escalation" \
         "$dir/plugins/bash-redundant-escalation-noop"

  # 2) clean up old @dsh-local node_modules symlinks (only our own)
  rm -f "$dir/node_modules/@dsh-local/bash-escalation" \
        "$dir/node_modules/@dsh-local/bash-redundant-escalation-noop"
  rmdir --ignore-fail-on-non-empty "$dir/node_modules/@dsh-local" 2>/dev/null || true

  # 3) drop the loader entries (id-based, comment-preserving)
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
