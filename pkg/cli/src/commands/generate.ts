/**
 * `npx invect-cli generate` — Generate Drizzle schema files
 *
 * Merges the core Invect schema with all plugin schemas, then generates
 * the three dialect-specific Drizzle ORM schema files:
 *   - schema-sqlite.ts
 *   - schema-postgres.ts
 *   - schema-mysql.ts
 *
 * After generating schema files, optionally runs `drizzle-kit generate`
 * to create SQL migration files — mirrors how better-auth chains to
 * ORM tooling after schema generation.
 *
 * Usage:
 *   npx invect-cli generate                    # Auto-detect config
 *   npx invect-cli generate --config ./my.ts   # Explicit config path
 *   npx invect-cli generate --output ./db      # Custom output directory
 *   npx invect-cli generate --yes              # Skip confirmation
 *   npx invect-cli generate --dialect sqlite   # Generate only one dialect
 */

import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import pc from 'picocolors';
import prompts from 'prompts';
import { execSync } from 'node:child_process';
import { findConfigPath, loadConfig } from '../utils/config-loader.js';
import { generateAllDrizzleSchemas, generateAppendSchema } from '../generators/drizzle.js';
import { generatePrismaSchema } from '../generators/prisma.js';

export const generateCommand = new Command('generate')
  .description('Generate Drizzle or Prisma schema files from core + plugin schemas')
  .option(
    '--config <path>',
    'Path to your Invect config file. Defaults to the first config found.',
  )
  .option(
    '--output <path>',
    'Output directory for generated schema files (used when --schema is not set)',
    './src/database',
  )
  .option(
    '--schema <path>',
    'Path to your existing Drizzle schema file. Invect tables will be appended to this file. ' +
      'If not provided, auto-detected from drizzle.config.ts.',
  )
  .option(
    '--adapter <adapter>',
    'Schema adapter to use: "drizzle" (default) or "prisma"',
  )
  .option(
    '--dialect <dialect>',
    'Database dialect (sqlite, postgresql, mysql). Required when using --schema. Auto-detected from drizzle.config.ts when possible.',
  )
  .option('-y, --yes', 'Skip confirmation prompt and generate directly', false)
  .action(generateAction);

/** @internal — exported for testing */
export async function generateAction(options: {
  config?: string;
  output: string;
  schema?: string;
  adapter?: string;
  dialect?: string;
  yes?: boolean;
}) {
  console.log(pc.bold('\n🔧 Invect Schema Generator\n'));

  // ─── Step 0: Detect adapter ─────────────────────────────────────
  const adapter = (options.adapter || 'drizzle').toLowerCase();
  if (adapter !== 'drizzle' && adapter !== 'prisma') {
    console.error(
      pc.red(`✗ Unknown adapter "${options.adapter}".`) +
        '\n' +
        pc.dim('  Supported adapters: drizzle (default), prisma\n'),
    );
    process.exit(1);
  }

  // ─── Step 1: Find and load config ───────────────────────────────
  const configPath = findConfigPath(options.config);
  if (!configPath) {
    console.error(
      pc.red('✗ Could not find Invect config file.') +
        '\n\n' +
        pc.dim('  Searched for: invect.config.ts in ./, src/, lib/, config/') +
        '\n' +
        pc.dim('  Use --config <path> to specify the config file explicitly.') +
        '\n\n' +
        pc.dim('  You can create one with: ' + pc.cyan('npx invect-cli init')) +
        '\n',
    );
    process.exit(1);
  }

  console.log(pc.dim(`  Config: ${path.relative(process.cwd(), configPath)}`));

  let config;
  try {
    config = await loadConfig(configPath);
  } catch (error) {
    console.error(
      pc.red(`\n✗ Failed to load config.`) +
        '\n' +
        pc.dim(`  ${error instanceof Error ? error.message : String(error)}`) +
        '\n\n' +
        pc.dim('  If your config uses import aliases (e.g., @/ or ~/),') +
        '\n' +
        pc.dim('  try using relative paths instead, then run the CLI again.\n'),
    );
    process.exit(1);
  }

  // ─── Step 2: Route to adapter ────────────────────────────────────
  if (adapter === 'prisma') {
    await runPrismaMode(config, options);
    return;
  }

  // ─── Step 2a: Drizzle — Determine mode (append vs separate files) ─────────
  // If --schema is given, use append mode directly.
  // Otherwise, try to auto-detect the schema path from drizzle.config.ts.
  let schemaFile = options.schema
    ? path.resolve(process.cwd(), options.schema)
    : undefined;
  let dialect = normalizeDialect(options.dialect);

  // Auto-detect from drizzle.config.ts if --schema not explicitly provided
  if (!schemaFile) {
    const detected = detectDrizzleSchema();
    if (detected) {
      schemaFile = detected.schemaPath;
      dialect = dialect || detected.dialect;
      console.log(
        pc.dim(`  Schema: ${path.relative(process.cwd(), schemaFile)}`) +
          pc.dim(` (auto-detected from ${detected.configFile})`),
      );
    }
  } else {
    console.log(pc.dim(`  Schema: ${path.relative(process.cwd(), schemaFile)}`));
  }

  // If we have a schema file, use append mode
  const useAppendMode = !!schemaFile;

  if (useAppendMode && !dialect) {
    console.error(
      pc.red('✗ Cannot determine database dialect.') +
        '\n\n' +
        pc.dim('  When using --schema, provide --dialect (sqlite, postgresql, or mysql).') +
        '\n' +
        pc.dim('  Or ensure your drizzle.config.ts specifies a dialect.\n'),
    );
    process.exit(1);
  }

  // ─── Step 3: Generate schema ────────────────────────────────────
  if (useAppendMode) {
    await runAppendMode(config, schemaFile!, dialect!, options);
  } else {
    await runSeparateFilesMode(config, options);
  }
}

// =============================================================================
// Prisma Mode — generate or merge Prisma schema
// =============================================================================

/**
 * Generate Prisma schema using the prisma-ast merge strategy.
 *
 * Mirrors better-auth's approach:
 * - If schema.prisma exists, merges Invect models into it
 * - If not, creates a complete schema.prisma
 * - Detects Prisma v7+ and adjusts provider/url accordingly
 * - Supports --schema and --dialect options
 */
async function runPrismaMode(
  config: Awaited<ReturnType<typeof loadConfig>>,
  options: { schema?: string; dialect?: string; yes?: boolean },
) {
  const provider = normalizePrismaProvider(options.dialect) || 'postgresql';
  const schemaFile = options.schema
    ? path.resolve(process.cwd(), options.schema)
    : path.resolve(process.cwd(), 'prisma/schema.prisma');

  console.log(pc.dim(`  Adapter: ${pc.cyan('Prisma')}`));
  console.log(pc.dim(`  Provider: ${pc.white(provider)}`));
  console.log(pc.dim(`  Schema: ${path.relative(process.cwd(), schemaFile)}`));

  let result;
  try {
    result = await generatePrismaSchema({
      plugins: config.plugins,
      file: schemaFile,
      provider,
    });
  } catch (error) {
    console.error(pc.red(`\n✗ Prisma schema generation failed:`));
    console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}\n`));
    process.exit(1);
  }

  if (result.code === undefined) {
    console.log(pc.bold(pc.green('\n✓ Prisma schema is already up to date.\n')));
    return;
  }

  const rel = path.relative(process.cwd(), result.fileName);
  console.log('');
  console.log(pc.bold('  Files:'));
  if (result.overwrite) {
    console.log(pc.yellow(`    ~ ${rel}`) + pc.dim(' (will update)'));
  } else {
    console.log(pc.green(`    + ${rel}`) + pc.dim(' (will create)'));
  }

  // Confirm
  if (!options.yes) {
    console.log('');
    const response = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: result.overwrite
        ? `Update ${pc.cyan(rel)}?`
        : `Create ${pc.cyan(rel)}?`,
      initial: true,
    });

    if (!response.proceed) {
      console.log(pc.dim('\n  Cancelled.\n'));
      return;
    }
  }

  // Write file
  const dir = path.dirname(result.fileName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(result.fileName, result.code, 'utf-8');

  console.log(
    pc.bold(pc.green(`\n✓ Prisma schema ${result.overwrite ? 'updated' : 'created'}: ${rel}\n`)),
  );

  // Next steps for Prisma
  console.log(pc.dim('  Next steps:'));
  console.log(
    pc.dim('    1. Run ') +
      pc.cyan('npx prisma db push') +
      pc.dim(' to apply schema changes'),
  );
  console.log(
    pc.dim('    2. Run ') +
      pc.cyan('npx prisma generate') +
      pc.dim(' to regenerate the Prisma client'),
  );
  console.log('');
}

function normalizePrismaProvider(
  dialect: string | undefined,
): 'postgresql' | 'mysql' | 'sqlite' | undefined {
  if (!dialect) return undefined;
  const d = dialect.toLowerCase();
  if (d === 'sqlite') return 'sqlite';
  if (d === 'postgresql' || d === 'pg' || d === 'postgres') return 'postgresql';
  if (d === 'mysql') return 'mysql';
  return undefined;
}

// =============================================================================
// Append Mode — append Invect tables to an existing schema file
// =============================================================================

async function runAppendMode(
  config: Awaited<ReturnType<typeof loadConfig>>,
  schemaFile: string,
  dialect: 'sqlite' | 'postgresql' | 'mysql',
  options: { yes?: boolean },
) {
  let appendResult;
  try {
    appendResult = await generateAppendSchema({
      plugins: config.plugins,
      dialect,
    });
  } catch (error) {
    console.error(pc.red(`\n✗ Schema generation failed:`));
    console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}\n`));
    process.exit(1);
  }

  const { result, stats } = appendResult;

  await printSummary(config, stats);

  // Read existing file (if any)
  const fileExists = fs.existsSync(schemaFile);
  const currentFileContent = fileExists ? fs.readFileSync(schemaFile, 'utf-8') : '';
  let existingContent = currentFileContent;

  // Strip previous Invect generated block if present
  const marker = '// Invect tables — AUTO-GENERATED by @invect/cli';
  const markerIndex = existingContent.indexOf(marker);
  if (markerIndex !== -1) {
    // Find the start of the section marker block (includes the === line above)
    const sectionDivider = '// =============================================================================';
    const dividerIndex = existingContent.lastIndexOf(sectionDivider, markerIndex);
    const stripFrom = dividerIndex !== -1 ? dividerIndex : markerIndex;
    existingContent = existingContent.substring(0, stripFrom).trimEnd();
  }

  // Merge imports: add entirely new imports, or merge missing named specifiers
  const pendingImports: string[] = [];
  let mergedContent = existingContent;

  for (const imp of result.imports) {
    const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (!fromMatch) {
      pendingImports.push(imp);
      continue;
    }

    const modulePath = fromMatch[1];
    const moduleImportRegex = new RegExp(
      `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*['\"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"];?`,
      'm',
    );

    const existingModuleImport = mergedContent.match(moduleImportRegex);
    if (!existingModuleImport) {
      pendingImports.push(imp);
      continue;
    }

    const newSpecifiersMatch = imp.match(/import\s*\{([\s\S]*?)\}\s*from/);
    if (!newSpecifiersMatch) {
      continue;
    }

    const existingSpecifiers = existingModuleImport[1]
      .split(',')
      .map((specifier) => specifier.trim())
      .filter(Boolean);
    const nextSpecifiers = newSpecifiersMatch[1]
      .split(',')
      .map((specifier) => specifier.trim())
      .filter(Boolean);

    const mergedSpecifiers = Array.from(new Set([...existingSpecifiers, ...nextSpecifiers]));
    const replacement = `import { ${mergedSpecifiers.join(', ')} } from '${modulePath}';`;
    mergedContent = mergedContent.replace(moduleImportRegex, replacement);
  }

  // Build the final content
  let finalContent = mergedContent;

  // Insert entirely new imports after existing imports
  if (pendingImports.length > 0) {
    // Find the last import statement position
    const importRegex = /^import\s.*$/gm;
    let lastImportEnd = 0;
    let match;
    while ((match = importRegex.exec(finalContent)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }

    if (lastImportEnd > 0) {
      // Insert after the last import
      finalContent =
        finalContent.substring(0, lastImportEnd) +
        '\n' +
        pendingImports.join('\n') +
        finalContent.substring(lastImportEnd);
    } else {
      // No imports found, add at the top
      finalContent = pendingImports.join('\n') + '\n' + finalContent;
    }
  }

  // Append the generated tables
  finalContent = finalContent.trimEnd() + '\n' + result.code + '\n';

  // Check if content actually changed compared to what's on disk.
  // We only skip when the final assembled content is identical to the file on disk.
  if (currentFileContent === finalContent) {
    printSummaryAlreadyUpToDate();
    return;
  }

  // Show what will happen
  const rel = path.relative(process.cwd(), schemaFile);
  console.log('');
  console.log(pc.bold('  Files:'));
  if (fileExists) {
    if (markerIndex !== -1) {
      console.log(pc.yellow(`    ~ ${rel}`) + pc.dim(' (Invect tables will be regenerated)'));
    } else {
      console.log(pc.green(`    ~ ${rel}`) + pc.dim(' (Invect tables will be appended)'));
    }
  } else {
    console.log(pc.green(`    + ${rel}`) + pc.dim(' (will create)'));
  }

  // Confirm
  if (!options.yes) {
    console.log('');
    const response = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: fileExists
        ? `Append Invect tables to ${pc.cyan(rel)}?`
        : `Create ${pc.cyan(rel)} with Invect tables?`,
      initial: true,
    });

    if (!response.proceed) {
      console.log(pc.dim('\n  Cancelled.\n'));
      return;
    }
  }

  // Write
  const dir = path.dirname(schemaFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(schemaFile, finalContent, 'utf-8');

  // Check if the write actually changed the file on disk.
  // This can happen when the generated output matches the existing file.
  const schemaFileChanged = currentFileContent !== finalContent;

  console.log(
    pc.bold(
      pc.green(
        `\n✓ Invect tables ${markerIndex !== -1 ? 'updated' : 'appended'} in ${rel}\n`,
      ),
    ),
  );

  // Run drizzle-kit push/generate — but only if the schema actually changed.
  // Skipping push when unchanged avoids "index already exists" errors from
  // drizzle-kit push when re-running generate on an already-applied schema.
  if (!schemaFileChanged) {
    console.log(
      pc.dim('  Schema file unchanged after regeneration — skipping drizzle-kit push.\n') +
        pc.dim('  The database is already up to date.\n'),
    );
  } else if (!options.yes) {
    const { runPush } = await prompts({
      type: 'confirm',
      name: 'runPush',
      message: `Run ${pc.cyan('drizzle-kit push')} to apply schema changes?`,
      initial: true,
    });

    if (runPush) {
      await runDrizzleKitPush();
    } else {
      console.log(
        pc.dim('\n  Next: run ') +
          pc.cyan('npx drizzle-kit push') +
          pc.dim(' to apply schema changes.\n'),
      );
    }
  } else {
    await runDrizzleKitPush();
  }
}

// =============================================================================
// Separate Files Mode — generate standalone schema-{dialect}.ts files
// =============================================================================

async function runSeparateFilesMode(
  config: Awaited<ReturnType<typeof loadConfig>>,
  options: { output: string; dialect?: string; yes?: boolean },
) {
  const outputDir = path.resolve(process.cwd(), options.output);

  let generated;
  try {
    generated = await generateAllDrizzleSchemas({
      plugins: config.plugins,
      outputDir,
    });
  } catch (error) {
    console.error(pc.red(`\n✗ Schema generation failed:`));
    console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}\n`));
    process.exit(1);
  }

  const { results, stats } = generated;

  await printSummary(config, stats);

  // Filter by dialect if --dialect specified
  const filteredResults = options.dialect
    ? results.filter((r) => {
        const d = options.dialect!.toLowerCase();
        if (d === 'sqlite') return r.fileName.includes('sqlite');
        if (d === 'postgresql' || d === 'pg' || d === 'postgres')
          return r.fileName.includes('postgres');
        if (d === 'mysql') return r.fileName.includes('mysql');
        return true;
      })
    : results;

  const hasChanges = filteredResults.some((r) => r.code !== undefined);

  if (!hasChanges) {
    console.log(pc.bold(pc.green('\n✓ Schema files are already up to date.\n')));
    return;
  }

  console.log('');
  console.log(pc.bold('  Files:'));
  for (const result of filteredResults) {
    const rel = path.relative(process.cwd(), result.fileName);
    if (result.code === undefined) {
      console.log(pc.dim(`    · ${rel} (unchanged)`));
    } else if (result.overwrite) {
      console.log(pc.yellow(`    ~ ${rel}`) + pc.dim(' (will update)'));
    } else {
      console.log(pc.green(`    + ${rel}`) + pc.dim(' (will create)'));
    }
  }

  // Confirm
  if (!options.yes) {
    console.log('');
    const response = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Generate schema files?',
      initial: true,
    });

    if (!response.proceed) {
      console.log(pc.dim('\n  Cancelled.\n'));
      return;
    }
  }

  // Write files
  let writtenCount = 0;
  for (const result of filteredResults) {
    if (result.code === undefined) continue;

    const dir = path.dirname(result.fileName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(result.fileName, result.code, 'utf-8');
    writtenCount++;
  }

  console.log(
    pc.bold(
      pc.green(`\n✓ Generated ${writtenCount} schema file${writtenCount !== 1 ? 's' : ''}.\n`),
    ),
  );

  // Optionally run drizzle-kit generate
  if (!options.yes) {
    const { runDrizzleKit } = await prompts({
      type: 'confirm',
      name: 'runDrizzleKit',
      message: `Run ${pc.cyan('drizzle-kit generate')} to create SQL migrations?`,
      initial: true,
    });

    if (runDrizzleKit) {
      await runDrizzleKitGenerate();
    } else {
      printNextSteps();
    }
  } else {
    await runDrizzleKitGenerate();
  }
}

// =============================================================================
// Shared Display Helpers
// =============================================================================

function printSummaryAlreadyUpToDate(): void {
  console.log(pc.bold(pc.green('\n✓ Schema is already up to date. Nothing to do.\n')));
}

async function printSummary(
  config: Awaited<ReturnType<typeof loadConfig>>,
  stats: { totalTables: number; coreTableCount: number; pluginTableCount: number },
) {
  const pluginsWithSchema = config.plugins.filter((p) => p.schema);
  const pluginsWithRequiredTablesOnly = config.plugins.filter(
    (p) => !p.schema && Array.isArray(p.requiredTables) && (p.requiredTables as string[]).length > 0,
  );

  console.log(
    pc.dim(
      `  Plugins: ${pc.white(String(config.plugins.length))} loaded` +
        (pluginsWithSchema.length > 0
          ? `, ${pc.cyan(String(pluginsWithSchema.length))} with schema`
          : ''),
    ),
  );

  console.log(
    pc.dim(
      `  Tables:  ${pc.white(String(stats.totalTables))} total` +
        ` (${stats.coreTableCount} core` +
        (stats.pluginTableCount > 0
          ? ` + ${pc.cyan(String(stats.pluginTableCount))} plugin`
          : '') +
        ')',
    ),
  );

  // Show per-plugin schema details
  if (pluginsWithSchema.length > 0) {
    let coreSchema: Record<string, unknown>;
    try {
      const core = await import('@invect/core');
      coreSchema = core.CORE_SCHEMA;
    } catch {
      coreSchema = {};
    }

    console.log('');
    for (const plugin of pluginsWithSchema) {
      const tableNames = Object.keys(plugin.schema!);
      const newTables = tableNames.filter((t) => !(t in coreSchema));
      const extendedTables = tableNames.filter((t) => t in coreSchema);

      console.log(pc.dim(`  Plugin ${pc.cyan(plugin.id)}:`));

      for (const t of newTables) {
        const fields = Object.keys(
          ((plugin.schema![t] as any)?.fields || {}) as Record<string, unknown>,
        );
        console.log(
          pc.green(`    + ${t}`) +
            pc.dim(` (new table, ${fields.length} field${fields.length !== 1 ? 's' : ''})`),
        );
      }

      for (const t of extendedTables) {
        const fields = Object.keys(
          ((plugin.schema![t] as any)?.fields || {}) as Record<string, unknown>,
        );
        console.log(
          pc.yellow(`    ~ ${t}`) +
            pc.dim(` (${fields.length} field${fields.length !== 1 ? 's' : ''} added)`),
        );
      }
    }
  }

  // Show warnings for plugins that need tables but don't provide schema
  if (pluginsWithRequiredTablesOnly.length > 0) {
    console.log('');
    console.log(
      pc.yellow('  ⚠ Some plugins require tables but do not provide schema definitions:'),
    );
    for (const plugin of pluginsWithRequiredTablesOnly) {
      const tables = (plugin.requiredTables as string[]).join(', ');
      console.log(
        pc.dim(`    ${pc.yellow(plugin.id)}: requires `) + pc.white(tables),
      );
      if (plugin.setupInstructions) {
        console.log(pc.dim(`      → ${plugin.setupInstructions}`));
      }
    }
    console.log(
      pc.dim(
        '\n  These tables must be added to your schema manually (or via the plugin\'s own tooling).\n' +
          '  The generated schema files will NOT include them automatically.\n',
      ),
    );
  }
}

// =============================================================================
// Drizzle Config Auto-Detection
// =============================================================================

/**
 * Parse drizzle.config.ts to extract the schema path and dialect.
 * Uses simple regex parsing (no eval) to handle most common patterns.
 */
function detectDrizzleSchema(): {
  schemaPath: string;
  dialect: 'sqlite' | 'postgresql' | 'mysql' | undefined;
  configFile: string;
} | null {
  const configFile = findDrizzleConfig();
  if (!configFile) return null;

  const configPath = path.resolve(process.cwd(), configFile);
  let content: string;
  try {
    content = fs.readFileSync(configPath, 'utf-8');
  } catch {
    return null;
  }

  // Extract schema path: schema: './db/schema.ts' or schema: "./db/schema"
  const schemaMatch = content.match(/schema\s*:\s*['"]([^'"]+)['"]/);
  if (!schemaMatch) return null;

  let schemaPath = schemaMatch[1];
  // Ensure .ts extension
  if (!schemaPath.endsWith('.ts') && !schemaPath.endsWith('.js')) {
    schemaPath += '.ts';
  }
  schemaPath = path.resolve(process.cwd(), schemaPath);

  // Extract dialect: dialect: 'sqlite' or driver: 'better-sqlite3'
  let dialect: 'sqlite' | 'postgresql' | 'mysql' | undefined;
  const dialectMatch = content.match(/dialect\s*:\s*['"]([^'"]+)['"]/);
  if (dialectMatch) {
    const d = dialectMatch[1].toLowerCase();
    if (d === 'sqlite') dialect = 'sqlite';
    else if (d === 'postgresql' || d === 'pg' || d === 'postgres') dialect = 'postgresql';
    else if (d === 'mysql') dialect = 'mysql';
  }

  return { schemaPath, dialect, configFile };
}

function normalizeDialect(
  dialect: string | undefined,
): 'sqlite' | 'postgresql' | 'mysql' | undefined {
  if (!dialect) return undefined;
  const d = dialect.toLowerCase();
  if (d === 'sqlite') return 'sqlite';
  if (d === 'postgresql' || d === 'pg' || d === 'postgres') return 'postgresql';
  if (d === 'mysql') return 'mysql';
  return undefined;
}

// =============================================================================
// Drizzle Kit Commands
// =============================================================================

async function runDrizzleKitGenerate(): Promise<void> {
  console.log(pc.dim('\n  Running drizzle-kit generate...\n'));

  try {
    const configFile = findDrizzleConfig();
    const cmd = configFile
      ? `npx drizzle-kit generate --config ${configFile}`
      : 'npx drizzle-kit generate';

    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });

    console.log(
      pc.bold(pc.green('\n✓ SQL migrations generated.\n')) +
        pc.dim('  Run ') +
        pc.cyan('npx invect-cli migrate') +
        pc.dim(' to apply them.\n'),
    );
  } catch {
    console.error(
      pc.yellow('\n⚠ drizzle-kit generate failed.') +
        '\n' +
        pc.dim('  Make sure drizzle-kit is installed and drizzle.config.ts exists.') +
        '\n' +
        pc.dim('  You can run it manually: ') +
        pc.cyan('npx drizzle-kit generate') +
        '\n',
    );
  }
}

async function runDrizzleKitPush(): Promise<void> {
  console.log(pc.dim('\n  Running drizzle-kit push...\n'));

  try {
    const configFile = findDrizzleConfig();
    const cmd = configFile
      ? `npx drizzle-kit push --config ${configFile}`
      : 'npx drizzle-kit push';

    // Capture stdout/stderr so we can detect "already exists" errors on re-runs.
    // drizzle-kit push for SQLite generates CREATE INDEX without IF NOT EXISTS,
    // which fails when the schema is already applied.
    const output = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    if (output) process.stdout.write(output);

    console.log(
      pc.bold(pc.green('\n✓ Schema pushed to database.\n')),
    );
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    const combinedOutput = [
      execError.stdout || '',
      execError.stderr || '',
      execError.message || '',
    ].join('\n');

    if (/already exists/i.test(combinedOutput)) {
      console.log(
        pc.bold(pc.green('\n✓ Schema is already applied to the database.\n')),
      );
    } else {
      // Print the captured output so the user can see what went wrong
      if (execError.stderr) process.stderr.write(execError.stderr);
      if (execError.stdout) process.stdout.write(execError.stdout);
      console.error(
        pc.yellow('\n⚠ drizzle-kit push failed.') +
          '\n' +
          pc.dim('  Make sure drizzle-kit is installed and drizzle.config.ts exists.') +
          '\n' +
          pc.dim('  You can run it manually: ') +
          pc.cyan('npx drizzle-kit push') +
          '\n',
      );
    }
  }
}

function findDrizzleConfig(): string | null {
  const candidates = [
    'drizzle.config.ts',
    'drizzle.config.js',
    'drizzle.config.sqlite.ts',
    'drizzle.config.postgres.ts',
    'drizzle.config.mysql.ts',
  ];
  for (const file of candidates) {
    if (fs.existsSync(path.resolve(process.cwd(), file))) {
      return file;
    }
  }
  return null;
}

function printNextSteps(): void {
  console.log(pc.dim('\n  Next steps:'));
  console.log(pc.dim('    1. Review the generated schema files'));
  console.log(
    pc.dim('    2. Run ') +
      pc.cyan('npx drizzle-kit generate') +
      pc.dim(' to create SQL migrations'),
  );
  console.log(
    pc.dim('    3. Run ') +
      pc.cyan('npx invect-cli migrate') +
      pc.dim(' to apply them'),
  );
  console.log('');
}
