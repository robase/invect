#!/usr/bin/env node

/**
 * @invect/cli — CLI for managing Invect projects
 *
 * Commands:
 *   init      — Initialize Invect in your project
 *   generate  — Generate Drizzle schema files from core + plugin schemas
 *   migrate   — Apply pending database migrations via Drizzle Kit
 *   info      — Display diagnostic information about the Invect setup
 *   secret    — Generate a secure encryption key
 *
 * Usage:
 *   npx invect-cli init
 *   npx invect-cli generate
 *   npx invect-cli migrate
 *   npx invect-cli info
 *   npx invect-cli secret
 *   npx invect-cli mcp --url http://localhost:3000/invect --api-key YOUR_KEY
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { generateCommand } from './commands/generate.js';
import { migrateCommand } from './commands/migrate.js';
import { infoCommand } from './commands/info.js';
import { secretCommand } from './commands/secret.js';
import { mcpCommand } from './commands/mcp.js';

import 'dotenv/config';

// Handle exit signals
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

async function main() {
  const program = new Command('invect');

  program
    .description('CLI for managing Invect workflow engine projects')
    .version('0.1.0')
    .option('--debug', 'Show detailed error messages and stack traces');

  program
    .addCommand(generateCommand)
    .addCommand(migrateCommand)
    .addCommand(initCommand)
    .addCommand(infoCommand)
    .addCommand(secretCommand)
    .addCommand(mcpCommand)
    .action(() => program.help());

  await program.parseAsync(process.argv);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error running Invect CLI:', error);
    process.exit(1);
  });
