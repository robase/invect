/**
 * @invect/user-auth — Backend Entry Point
 *
 * Wraps a better-auth instance as an Invect plugin, providing:
 * - Session-based identity resolution
 * - Proxied auth routes (sign-in, sign-up, OAuth, etc.)
 * - Authorization hook integration
 * - Express/NestJS middleware helpers
 *
 * The `auth` parameter is optional — when omitted, the plugin creates an
 * internal better-auth instance using Invect's database configuration.
 *
 * @example
 * ```ts
 * // Simple — no separate auth setup needed:
 * import { betterAuthPlugin } from '@invect/user-auth';
 *
 * createInvectRouter({
 *   databaseUrl: 'file:./dev.db',
 *   plugins: [betterAuthPlugin()],
 * });
 * ```
 *
 * @example
 * ```ts
 * // Advanced — provide your own instance:
 * import { betterAuth } from 'better-auth';
 * import { betterAuthPlugin } from '@invect/user-auth';
 *
 * const auth = betterAuth({ ... });
 *
 * createInvectRouter({
 *   databaseUrl: 'file:./dev.db',
 *   plugins: [betterAuthPlugin({ auth })],
 * });
 * ```
 *
 * @packageDocumentation
 */
export { betterAuthPlugin, BETTER_AUTH_SCHEMA } from './plugin';
export type {
  BetterAuthPluginOptions,
  BetterAuthPassthroughOptions,
  BetterAuthInstance,
  BetterAuthUser,
  BetterAuthSession,
  BetterAuthSessionResult,
} from './types';
