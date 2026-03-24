#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Next.js fullstack: core + nextjs adapter + frontend + Next.js example app
LIB_FILTERS=(
  "@invect/core..."          # core plus every package that depends on it
  "@invect/nextjs..."        # nextjs adapter + its dependents
  "@invect/frontend..."      # frontend package + example apps
)

ALL_FILTERS=(
  "${LIB_FILTERS[@]}"
  "invect-nextjs-example"    # Next.js example app (explicit for clarity)
)

LIB_FILTER_ARGS=()
for filter in "${LIB_FILTERS[@]}"; do
  LIB_FILTER_ARGS+=("--filter" "$filter")
done

ALL_FILTER_ARGS=()
for filter in "${ALL_FILTERS[@]}"; do
  ALL_FILTER_ARGS+=("--filter" "$filter")
done

echo "==> Running dependency-aware initial builds (library packages only)"
echo "    (pnpm orders the work using the workspace graph so dependents rebuild automatically)"
pnpm "${LIB_FILTER_ARGS[@]}" --workspace-concurrency=1 run --if-present build

echo ""
echo "==> Starting Next.js full-stack watch mode"
echo "    (core/nextjs/frontend packages + Next.js example app)"
pnpm "${ALL_FILTER_ARGS[@]}" --parallel --stream run dev
