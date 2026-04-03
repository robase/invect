/**
 * @invect/user-auth — Backend Entry Point
 *
 * Wraps a [better-auth](https://better-auth.com) instance as an Invect plugin,
 * providing:
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
 * import { userAuth } from '@invect/user-auth';
 *
 * createInvectRouter({
 *   databaseUrl: 'file:./dev.db',
 *   plugins: [userAuth()],
 * });
 * ```
 *
 * @example
 * ```ts
 * // Advanced — provide your own better-auth instance:
 * import { betterAuth } from 'better-auth';
 * import { userAuth } from '@invect/user-auth';
 *
 * const auth = betterAuth({ ... });
 *
 * createInvectRouter({
 *   databaseUrl: 'file:./dev.db',
 *   plugins: [userAuth({ auth })],
 * });
 * ```
 *
 * @packageDocumentation
 */
export { userAuth, USER_AUTH_SCHEMA } from './plugin';
export type {
  UserAuthPluginOptions,
  BetterAuthPassthroughOptions,
  BetterAuthInstance,
  BetterAuthUser,
  BetterAuthSession,
  BetterAuthSessionResult,
} from './types';
