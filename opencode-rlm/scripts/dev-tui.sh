#!/usr/bin/env bash
# dev-tui.sh - Attach TUI to dev server on port 4200

export XDG_DATA_HOME="$HOME/.local/share-dev"
export XDG_CONFIG_HOME="$HOME/.config-dev"
export XDG_STATE_HOME="$HOME/.local/state-dev"
export XDG_CACHE_HOME="$HOME/.cache-dev"

cd "$(dirname "$0")"
bun dev attach http://127.0.0.1:4200 "$@"
