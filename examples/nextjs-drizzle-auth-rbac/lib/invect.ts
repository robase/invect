/**
 * Invect configuration — wired into the Next.js API route handler.
 *
 * This file is ALSO read by the Invect CLI (`npx invect-cli generate`)
 * to discover plugins and their schemas for code generation.
 */

import { authentication } from '@invect/user-auth';
import { rbacPlugin } from '@invect/rbac';
import { invectAuth } from './auth';
import { defineConfig } from '@invect/core';

export const invectConfig = defineConfig({
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY!,
  database: {
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://acme:acme@localhost:5432/acme_dashboard',
    type: 'postgresql',
    name: 'Acme Dashboard DB',
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
        ]
      : []),
    ...(process.env.SEED_LINEAR_CLIENT_ID && process.env.SEED_LINEAR_CLIENT_SECRET
      ? [
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
    authentication({
      auth: invectAuth,
      onSessionError: 'continue',
      globalAdmins: [
        {
          email: process.env.INVECT_ADMIN_EMAIL,
          pw: process.env.INVECT_ADMIN_PASSWORD,
          name: 'Admin',
        },
      ],
    }),
    rbacPlugin(),
  ],
});
