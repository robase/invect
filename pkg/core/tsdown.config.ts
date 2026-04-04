import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/database/schema-sqlite.ts',
    'src/database/schema-postgres.ts',
    'src/database/schema-mysql.ts',
    'src/types-export.ts',
  ],
  format: ['cjs', 'esm'],
  // bundle: true, // deprecated
  unbundle: true,
  dts: {
    resolve: false,
    compilerOptions: {
      composite: false,
      declaration: true,
      declarationMap: true,
      emitDeclarationOnly: false,
      skipLibCheck: true,
      baseUrl: '.',
      paths: {
        'src/*': ['src/*']
      }
    }
  },
  sourcemap: true,
  clean: false,
  // Disable size report to reduce noise in dev
  report: false,
  // Bundle most dependencies to avoid ESM/CJS issues in Next.js
  deps: {
    neverBundle: [
      'drizzle-orm',
      'drizzle-zod',
      'postgres',
      'better-sqlite3',
      '@libsql/client',
      'mysql2',
      'zod',
      'json-logic-js',
      // Keep these external as they're large or have native bindings
      '@anthropic-ai/sdk',
      'openai',
      'fsevents', // macOS file watching - should be external
      'chokidar', // File watching
    ],
    alwaysBundle: [
      'nanoid', // Bundle this to fix ESM issues
      'uuid',
      'dotenv',
    ],
  },
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js'
    }
  },
  // Path alias for src/* imports
  alias: {
    'src': './src'
  }
})
