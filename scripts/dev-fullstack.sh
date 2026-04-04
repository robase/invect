#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Filters combine base packages with their dependents so pnpm automatically
# rebuilds anything downstream that relies on them (core ➜ adapters ➜ apps).
TARGET_FILTERS=(
  "@invect/core..."        # core plus every package that depends on it
  "@invect/express..."     # express adapter + its dependents
  "@invect/user-auth..."   # auth plugin + its dependents
  "@invect/rbac..."        # RBAC plugin + its dependents
  "@invect/ui..."    # frontend package + example apps
  "invect-express-simple"  # example backend (explicit for clarity)
  "flow-executor"             # example frontend (explicit for clarity)
)

FILTER_ARGS=()
for filter in "${TARGET_FILTERS[@]}"; do
  FILTER_ARGS+=("--filter" "$filter")
done

echo "==> Running dependency-aware initial builds"
echo "    (pnpm orders the work using the workspace graph so dependents rebuild automatically)"
pnpm "${FILTER_ARGS[@]}" --workspace-concurrency=1 run --if-present build

echo ""
echo "==> Starting full-stack watch mode"
echo "    (core/express/frontend packages + example apps share the same dependency-aware filters)"
pnpm "${FILTER_ARGS[@]}" --parallel --stream run dev
