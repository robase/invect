/**
 * Lazy action definition.
 *
 * Allows providers to defer loading the full {@link ActionDefinition} (and its
 * heavy SDK / runtime dependencies) until the action is actually executed or
 * inspected. This is critical for edge runtimes (Cloudflare Workers,
 * Vercel Workflows, etc.) where eagerly importing 40+ provider SDKs blows past
 * the bundle-size cap on cold start.
 *
 * The lazy descriptor is intentionally minimal — it carries just enough
 * metadata for the registry to:
 *   - report the action id (and optionally provider id) without loading
 *   - lazily resolve the full definition via the `load` thunk on first use
 *
 * Self-hosted backends can still register the eager `allProviderActions` array
 * for full discovery; edge bundles register `allProviderActionsLazy` instead.
 */
export interface LazyActionDefinition {
  /** Action id, e.g. `"gmail.send_message"`. */
  id: string;
  /** Optional provider hint (used for grouping before the action is loaded). */
  provider?: { id: string };
  /** Resolves the full action definition. Called once and cached by the registry. */
  load: () => Promise<import('./action').ActionDefinition>;
}
