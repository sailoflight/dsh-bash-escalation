#!/usr/bin/env bash
# Create the local git repo and push `dsh-bash-escalation` to GitHub
# (owner: sailoflight — same as your taobao-mcp).
#
# 前置条件：先在 GitHub 网页端建一个空的同名仓库 "dsh-bash-escalation"
#   （GitHub 不会在 push 时自动建仓）。
#
# 说明：
#   - 使用你的 GitHub SSH 密钥 ~/.ssh/id_ed25519_github（非默认文件名），
#     通过 GIT_SSH_COMMAND 显式指定，不改动全局 ~/.ssh/config。
#   - git 身份沿用 taobao-mcp 的 lijq / lijq@localhost。
#   - 幂等：可重复运行（已有 remote/提交会跳过）。
#
# 用法：
#   bash ~/code/dsh-bash-escalation/git-push.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="${HOME}/.ssh/id_ed25519_github"
REMOTE="git@github.com:sailoflight/dsh-bash-escalation.git"
IDENTITY_NAME="lijq"
IDENTITY_EMAIL="lijq@localhost"

# 用非默认命名的 GitHub 密钥
export GIT_SSH_COMMAND="ssh -i ${SSH_KEY} -o IdentitiesOnly=yes"

cd "$PROJECT_DIR"

if [ ! -d .git ]; then
  echo "== git init =="
  git init -b main
fi

git config user.name "$IDENTITY_NAME"
git config user.email "$IDENTITY_EMAIL"

echo "== remote =="
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi
git remote -v

echo "== add + commit =="
git add -A
if git diff --cached --quiet; then
  echo "   (nothing to commit)"
else
  git commit -m "feat(dsh): bash-escalation plugins (prompt + in-place mechanism) + install/uninstall/git-push scripts"
fi

echo "== push =="
git push -u origin main

echo
echo "Done: pushed to $REMOTE"
