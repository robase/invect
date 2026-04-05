/**
 * Invect configuration — used by the Express server and the Invect CLI.
 *
 * Run `npx invect-cli generate` to regenerate the Drizzle schema files
 * whenever plugins are added or removed.
 */

import { userAuth } from '@invect/user-auth';
import { rbacPlugin } from '@invect/rbac';
import { webhooksPlugin } from '@invect/webhooks';
import { defineConfig } from '@invect/core';

const webhookBaseUrl = process.env.INVECT_WEBHOOK_BASE_URL || 'http://localhost:3000/invect';

export const invectConfig = defineConfig({
  database: {
    id: 'main',
    type: 'sqlite',
    connectionString: process.env.DB_FILE_NAME || 'file:./dev.db',
  },
  logging: {
    level: 'info',
  },
  defaultCredentials: [
    ...(process.env.SEED_ANTHROPIC_API_KEY
      ? [
          {
            name: 'Anthropic API Key',
            type: 'llm',
            authType: 'apiKey',
            config: { apiKey: process.env.SEED_ANTHROPIC_API_KEY },
            description: 'Anthropic Claude API credential for AI model nodes',
            isShared: true,
            metadata: { provider: 'anthropic' },
          },
          {
            name: 'OpenRouter API Key',
            type: 'llm',
            authType: 'apiKey',
            config: { apiKey: process.env.SEED_OPENROUTER_API_KEY },
            description: 'OpenRouter API credential for AI model nodes',
            isShared: true,
            metadata: { provider: 'openrouter' },
          },
          {
            name: 'Linear OAuth2',
            type: 'http-api',
            authType: 'oauth2',
            config: {
              clientId: process.env.SEED_LINEAR_CLIENT_ID,
              clientSecret: process.env.SEED_LINEAR_CLIENT_SECRET,
              oauth2Provider: 'linear',
            },
            description: 'Linear OAuth2 credential for issue tracking',
            isShared: true,
            metadata: { provider: 'linear' },
          },
        ]
      : []),
  ],
  plugins: [
    userAuth({
      onSessionError: 'continue',
      trustedOrigins: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
      betterAuthOptions: {
        secret: process.env.BETTER_AUTH_SECRET || 'invect-dev-secret-do-not-use-in-production',
      },
      globalAdmins: [
        {
          email: process.env.INVECT_ADMIN_EMAIL,
          pw: process.env.INVECT_ADMIN_PASSWORD,
          name: 'Admin',
        },
      ],
    }),
    rbacPlugin(),
    webhooksPlugin({
      webhookBaseUrl,
    }),
  ],
});
