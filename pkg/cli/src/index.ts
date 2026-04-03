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
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { generateCommand } from './commands/generate.js';
import { migrateCommand } from './commands/migrate.js';
import { infoCommand } from './commands/info.js';
import { secretCommand } from './commands/secret.js';

import 'dotenv/config';

// Handle exit signals
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

async function main() {
  const program = new Command('invect');

  program
    .description('CLI for managing Invect workflow engine projects')
    .version('0.1.0');

  program
    .addCommand(generateCommand)
    .addCommand(migrateCommand)
    .addCommand(initCommand)
    .addCommand(infoCommand)
    .addCommand(secretCommand)
    .action(() => program.help());

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error('Error running Invect CLI:', error);
  process.exit(1);
});
