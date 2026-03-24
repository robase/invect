import { Module } from '@nestjs/common';
import { InvectModule } from '@invect/nestjs';

/**
 * Example usage of InvectModule in a NestJS application
 */

// Basic usage with static configuration
@Module({
  imports: [
    InvectModule.forRoot({
      baseDatabaseConfig: {
        type: 'sqlite',
        connectionString: 'file:./dev.db',
        id: 'main',
      },
      logging: {
        level: 'info',
      },
    }),
  ],
})
export class AppModule {}

// Async configuration example
@Module({
  imports: [
    InvectModule.forRootAsync({
      useFactory: () => ({
        baseDatabaseConfig: {
          type: 'sqlite',
          connectionString: process.env.DATABASE_URL || 'file:./dev.db',
          id: 'main',
        },
        logging: {
          level:
            (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | 'silent') || 'info',
        },
      }),
    }),
  ],
})
export class AsyncAppModule {}
