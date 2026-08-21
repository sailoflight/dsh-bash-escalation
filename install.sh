#!/usr/bin/env bash
# Install the dsh-bash-escalation plugins into every DSH profile — CLEAN
# local-plugin install.
#
# How it works:
#   - Copies our two plugins into each profile's `plugins/` directory (the
#     standard local-plugin location DSH uses).
#   - cordis.patch.yml references them as RELATIVE `./plugins/...` (the loader
#     resolves these against the profile dir).
#   - NO node_modules, NO pnpm, NO network, NO absolute paths written anywhere.
#   - Only our own named dirs under plugins/ are touched; other people's
#     plugins are left alone.
#
# The source location is derived at runtime from this script's own path — it is
# never persisted into any file, so the script works no matter where the project
# is cloned.
#
# Usage (run from your normal terminal, once per machine):
#   bash <path-to>/install.sh
# then restart every DSH terminal (web / tui / headless).
set -euo pipefail

# Runtime-only source dir (nothing absolute is persisted).
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES="web dsh-tui headless"

for p in $PROFILES; do
  dir="$HOME/.dsh/profiles/$p"
  [ -d "$dir" ] || { echo "skip: $dir not found"; continue; }
  echo "== $p =="

  # 1) Copy OUR plugins into the profile's standard local-plugin dir.
  mkdir -p "$dir/plugins/bash-escalation" "$dir/plugins/bash-redundant-escalation-noop"
  cp -R "$SRC/plugins/bash-escalation/."                "$dir/plugins/bash-escalation/"
  cp -R "$SRC/plugins/bash-redundant-escalation-noop/." "$dir/plugins/bash-redundant-escalation-noop/"

  # 2) Clean up the old @dsh-local node_modules symlinks (clean install: none).
  rm -f "$dir/node_modules/@dsh-local/bash-escalation" \
        "$dir/node_modules/@dsh-local/bash-redundant-escalation-noop"
  rmdir --ignore-fail-on-non-empty "$dir/node_modules/@dsh-local" 2>/dev/null || true

  # 3) Ensure cordis.patch.yml has our two entries as ./plugins/... (relative).
  python3 - "$dir/cordis.patch.yml" <<'PY'
import re, sys

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    lines = f.readlines()

OUR = {"bash-escalation-guidance", "bash-redundant-escalation-noop"}

# Drop any existing entries for our ids (any name form) and their comments.
out, i = [], 0
while i < len(lines):
    line = lines[i]
    m = re.match(r"^\s*- id:\s*([A-Za-z0-9_-]+)\s*$", line)
    if m and m.group(1) in OUR:
        while out and not out[-1].startswith("#") and out[-1].lstrip().startswith("#"):
            out.pop()
        i += 3  # id, name, config
        continue
    out.append(line)
    i += 1
text = "".join(out)

entry = (
    "    # dsh-bash-escalation: prompt guidance (set sandbox_permissions only when wider)\n"
    "    - id: bash-escalation-guidance\n"
    "      name: './plugins/bash-escalation/index.js'\n"
    "      config: {}\n"
    "    # dsh-bash-escalation: mechanism backstop (in-place injection)\n"
    "    - id: bash-redundant-escalation-noop\n"
    "      name: './plugins/bash-redundant-escalation-noop/index.js'\n"
    "      config: {}\n"
)

# Ensure an insert list exists (also handle the pristine `[]` form).
if text.strip() == "[]":
    text = text.split("[]", 1)[0] + "- insert:\n"
elif not re.search(r"^-\s*insert:\s*$", text, re.M):
    text = text.rstrip("\n") + "\n- insert:\n"

# Insert our entries right after the `- insert:` line.
out, inserted = [], False
for ln in text.splitlines(keepends=True):
    out.append(ln)
    if not inserted and re.match(r"^-\s*insert:\s*$", ln):
        out.append(entry)
        inserted = True
if not inserted:
    out.append(entry)

with open(path, "w", encoding="utf-8") as f:
    f.write("".join(out))
PY
  echo "   plugins copied, cordis.patch.yml updated (./plugins/...)"
done

echo
echo "Done. Restart every DSH terminal now."
echo "Verify: grep -n \"plugins/\" ~/.dsh/profiles/*/cordis.patch.yml"
