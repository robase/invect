import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const dbUrl = process.env.DB_FILE_NAME?.replace(/^file:/, '') || './dev.db';

export default defineConfig({
  out: './drizzle',
  schema: './db/schema-sqlite.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbUrl,
  },
});
