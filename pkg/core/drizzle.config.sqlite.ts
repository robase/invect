import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema-sqlite.ts',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: './dev.db'
  },
  verbose: true,
  strict: true,
});
