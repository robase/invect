#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# "pkg..." = package + all its transitive workspace dependencies (upstream).
# This auto-discovers the full dependency graph for both example apps:
#   invect-express-simple  → @invect/core, @invect/express, plugins (auth, rbac, webhooks, mcp)
#   flow-executor          → @invect/ui, plugins (auth, rbac, webhooks)
DEV_FILTERS=(
  --filter "invect-express-simple..."
  --filter "flow-executor..."
)

# Phase 1: Build only the workspace library deps (exclude the apps themselves
# since their dev scripts handle startup directly).
echo "==> Building workspace packages (topological order)"
pnpm "${DEV_FILTERS[@]}" \
  --filter "!invect-express-simple" --filter "!flow-executor" \
  --workspace-concurrency=1 run --if-present build

# Phase 2: Start everything in watch/dev mode.
#   - Library packages run tsdown --watch / vite build --watch → rebuild dist/ on change
#   - express-drizzle's nodemon watches pkg/*/dist and restarts on change
#   - vite-react-frontend's dev server picks up @invect/ui dist changes
echo ""
echo "==> Starting full-stack watch mode"
pnpm "${DEV_FILTERS[@]}" --parallel --stream run dev
