<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/logo-light.svg">
    <img alt="Invect" src="../../.github/assets/logo-dark.svg" width="50">
  </picture>
</p>

<h1 align="center">@invect/nestjs</h1>

<p align="center">
  NestJS module adapter for Invect.
  <br />
  <a href="https://invect.dev/docs/integrations/nestjs"><strong>Docs</strong></a> · <a href="https://invect.dev/docs/quick-start"><strong>Quick Start</strong></a>
</p>

---

Mount Invect into any NestJS app as a module. Provides a controller for all API endpoints and an injectable service for programmatic access.

## Install

```bash
npx invect-cli init
```

Or install manually:

```bash
npm install @invect/core @invect/nestjs
```

## Usage

```ts
import { Module } from '@nestjs/common';
import { InvectModule } from '@invect/nestjs';

@Module({
  imports: [
    InvectModule.forRoot({
      database: {
        type: 'sqlite',
        connectionString: 'file:./dev.db',
      },
      encryptionKey: process.env.INVECT_ENCRYPTION_KEY, // npx invect-cli secret
    }),
  ],
})
export class AppModule {}
```

### Async Configuration

```ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InvectModule } from '@invect/nestjs';

@Module({
  imports: [
    ConfigModule.forRoot(),
    InvectModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        database: {
          type: 'postgres',
          connectionString: config.get('DATABASE_URL'),
        },
        encryptionKey: config.get('INVECT_ENCRYPTION_KEY'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Programmatic Access

Inject `InvectService` to call the core engine directly:

```ts
import { Injectable } from '@nestjs/common';
import { InvectService } from '@invect/nestjs';

@Injectable()
export class MyService {
  constructor(private readonly invect: InvectService) {}

  async runWorkflow(flowId: string, inputs: Record<string, unknown>) {
    return this.invect.getCore().runs.start(flowId, inputs);
  }
}
```

## License

[MIT](../../LICENSE)
