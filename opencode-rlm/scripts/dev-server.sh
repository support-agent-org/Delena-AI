#!/usr/bin/env bash
# Dev server wrapper - uses isolated directories to avoid conflicts with main server

# Load GOOGLE_GENERATIVE_AI_API_KEY from .env file if available
if [ -f "../.env" ]; then
  export $(grep GOOGLE_GENERATIVE_AI_API_KEY ../.env | xargs)
fi

export XDG_DATA_HOME="$HOME/.local/share-dev"
export XDG_CONFIG_HOME="$HOME/.config-dev"
export XDG_STATE_HOME="$HOME/.local/state-dev"
export XDG_CACHE_HOME="$HOME/.cache-dev"

# Create directories
mkdir -p "$XDG_DATA_HOME/opencode"
mkdir -p "$XDG_CONFIG_HOME/opencode"
mkdir -p "$XDG_STATE_HOME/opencode"
mkdir -p "$XDG_CACHE_HOME/opencode"

# Copy auth from main instance if it doesn't exist
if [ ! -f "$XDG_DATA_HOME/opencode/auth.json" ]; then
  cp "$HOME/.local/share/opencode/auth.json" "$XDG_DATA_HOME/opencode/auth.json" 2>/dev/null || true
fi

# Copy config from main instance if it doesn't exist
if [ ! -f "$XDG_CONFIG_HOME/opencode/opencode.json" ]; then
  cp "$HOME/.config/opencode/opencode.json" "$XDG_CONFIG_HOME/opencode/opencode.json" 2>/dev/null || true
fi

# Start server (uses "bun dev serve" which sets --cwd packages/opencode correctly)
exec bun dev serve --port 4200 --hostname 127.0.0.1 "$@"
