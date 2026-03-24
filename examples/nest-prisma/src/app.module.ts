import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { InvectModule } from '@invect/nestjs';
import { AppController } from './app.controller';
import { AppService } from './app.service';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://invect:invect@localhost:5433/acme_saas';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    InvectModule.forRoot({
      baseDatabaseConfig: {
        id: 'nest-prisma',
        type: 'postgresql',
        connectionString: DATABASE_URL,
      },
      execution: {
        defaultTimeout: 60000,
        maxConcurrentExecutions: 10,
        enableTracing: true,
        flowTimeoutMs: 600_000,
        heartbeatIntervalMs: 30_000,
        staleRunCheckIntervalMs: 60_000,
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
                description:
                  'Anthropic Claude API credential for AI model nodes',
                isShared: true,
                metadata: { provider: 'anthropic' },
              },
            ]
          : []),
        ...(process.env.SEED_LINEAR_CLIENT_ID &&
        process.env.SEED_LINEAR_CLIENT_SECRET
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
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
