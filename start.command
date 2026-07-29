#!/bin/zsh
set -eu

SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  CODEX_NODE="/Applications/Codex.app/Contents/Resources/node/bin"
  if [[ -x "$CODEX_NODE/node" ]]; then
    export PATH="$CODEX_NODE:$PATH"
  else
    echo "请先安装 Node.js 22.13 或更高版本：https://nodejs.org/"
    read -k 1 "?按任意键退出。"
    exit 1
  fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@latest --activate
fi

if [[ ! -d node_modules ]]; then
  pnpm install
fi

(sleep 2; open "http://127.0.0.1:3000") &
exec pnpm dev --host 127.0.0.1 --port 3000
