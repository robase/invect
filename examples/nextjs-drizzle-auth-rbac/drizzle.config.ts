import { defineConfig } from 'drizzle-kit';

const dbUrl = process.env.DATABASE_URL ?? 'postgresql://acme:acme@localhost:5432/acme_dashboard';

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
  verbose: true,
});
