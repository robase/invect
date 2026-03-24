/**
 * Invect CLI configuration file.
 *
 * The CLI (`npx invect generate`) loads this file to discover:
 *   - Database type and connection string
 *   - Plugins and their schemas
 *
 * It then merges core Invect tables + plugin tables and generates
 * dialect-specific Drizzle schema files.
 */

// Re-export the same config used by the Next.js API route handler.
// This keeps everything in one place — no config duplication.
export { invectConfig as default } from './invect';
