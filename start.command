#!/bin/zsh
set -eu

SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR"

RUNTIME_ROOT="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies"
CODEX_APP_NODE="/Applications/Codex.app/Contents/Resources/node/bin"
APP_PORT="38765"

if [[ -x "$RUNTIME_ROOT/node/bin/node" ]]; then
  export PATH="$RUNTIME_ROOT/node/bin:$RUNTIME_ROOT/bin/override:$RUNTIME_ROOT/bin/fallback:$PATH"
elif [[ -x "$CODEX_APP_NODE/node" ]]; then
  export PATH="$CODEX_APP_NODE:$PATH"
elif ! command -v node >/dev/null 2>&1; then
  echo "没有找到可用的Node.js运行环境。"
  echo "请先打开一次Codex，或安装Node.js 22.13以上版本：https://nodejs.org/"
  read -k 1 "?按任意键退出。"
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM_BIN=$(command -v pnpm)
elif command -v corepack >/dev/null 2>&1; then
  corepack prepare pnpm@latest --activate
  PNPM_BIN=$(command -v pnpm)
else
  echo "没有找到pnpm。请安装Node.js后执行：corepack enable"
  read -k 1 "?按任意键退出。"
  exit 1
fi

if curl -fsS "http://127.0.0.1:$APP_PORT/api/state" >/dev/null 2>&1; then
  open "http://127.0.0.1:$APP_PORT"
  exit 0
fi

if [[ ! -d node_modules ]]; then
  "$PNPM_BIN" install
fi

echo "正在启动大学院申请看板，请不要关闭这个窗口……"
(sleep 3; open "http://127.0.0.1:$APP_PORT") &
exec "$PNPM_BIN" dev --host 127.0.0.1 --port "$APP_PORT"
