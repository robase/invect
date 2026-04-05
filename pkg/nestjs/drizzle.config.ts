import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './database/drizzle/schema.ts',
  out: './database/drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DRIZZLE_DB_URL || './database/drizzle/dev.db',
  },
  verbose: true,
  strict: true,
});
