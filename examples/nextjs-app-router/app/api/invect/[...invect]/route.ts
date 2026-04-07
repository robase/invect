import { createInvectHandler, type InvectConfig } from '@invect/nextjs';

const config: InvectConfig = {
  encryptionKey: process.env.INVECT_ENCRYPTION_KEY!,
  database: {
    connectionString: 'file:./invect.db',
    type: 'sqlite' as const,
    name: 'Main Database',
  },
  logging: {
    level: 'info' as const,
  },
  defaultCredentials: [
    ...(process.env.SEED_ANTHROPIC_API_KEY
      ? [
          {
            name: 'Anthropic API Key',
            type: 'llm' as const,
            provider: 'anthropic',
            authType: 'apiKey' as const,
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
            type: 'http-api' as const,
            authType: 'oauth2' as const,
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
};

const handler = createInvectHandler(config);

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH };
