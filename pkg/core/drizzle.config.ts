import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema-*.ts',
  out: './drizzle',
  dialect: 'postgresql', // default, can be overridden by environment
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/invect'
  },
  verbose: true,
  strict: true,
});
