import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema';

const configuredBaseUrl =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  `http://localhost:${process.env.PORT ?? '3000'}`;

/**
 * Better Auth instance — single source of truth for authentication.
 *
 * This handles:
 * - Email/password sign-in and sign-up
 * - Session management (cookies)
 * - User storage in the PostgreSQL database via Drizzle
 *
 * The Invect auth plugin wraps this instance to integrate
 * session resolution into the Invect API layer.
 */
export const invectAuth = betterAuth({
  baseURL: configuredBaseUrl,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({
      defaultRole: 'editor',
      adminRoles: ['admin'],
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  trustedOrigins: (request) => {
    const trusted = new Set<string>([configuredBaseUrl]);

    try {
      if (!request) {
        return Array.from(trusted);
      }
      trusted.add(new URL(request.url).origin);
    } catch {
      // Ignore malformed request URLs and fall back to configured base URL.
    }

    return Array.from(trusted);
  },
});
