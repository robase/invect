import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(currentDir, 'db', 'schema-sqlite.ts');

const source = readFileSync(schemaPath, 'utf8');

function dedupeNamedImport(code: string, modulePath: string): string {
  const singleLine = new RegExp(
    `import \\{([^}]*)\\} from ['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"];?`,
  );

  return code.replace(singleLine, (_match, specifiers: string) => {
    const unique = Array.from(
      new Set(
        specifiers
          .split(',')
          .map((specifier) => specifier.trim())
          .filter(Boolean),
      ),
    );
    return `import { ${unique.join(', ')} } from '${modulePath}';`;
  });
}

let normalized = source
  .replace(
    ".$type<FlowRunStatus>().notNull().default('PENDING')",
    '.$type<FlowRunStatus>().notNull().default(FlowRunStatus.PENDING)',
  )
  .replace(
    ".$type<NodeExecutionStatus>().notNull().default('PENDING')",
    '.$type<NodeExecutionStatus>().notNull().default(NodeExecutionStatus.PENDING)',
  );

normalized = dedupeNamedImport(normalized, 'drizzle-orm');
normalized = dedupeNamedImport(normalized, 'crypto');
normalized = dedupeNamedImport(normalized, 'drizzle-orm/sqlite-core');

if (normalized.includes('AnySQLiteColumn') && !normalized.includes('type AnySQLiteColumn')) {
  normalized = normalized.replace(
    "import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';",
    "import { sqliteTable, text, integer, primaryKey, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';",
  );
}

if (normalized !== source) {
  writeFileSync(schemaPath, normalized);
}
