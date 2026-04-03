/**
 * Schema Merger
 *
 * Merges the core abstract schema with plugin schemas to produce a
 * unified abstract schema. The CLI schema generator then converts
 * this merged schema into dialect-specific Drizzle files.
 *
 * Handles:
 * - New plugin tables
 * - Plugin fields added to existing core tables (additive only)
 * - Duplicate field detection (throws error)
 * - Ordering by foreign key dependencies
 */

import type { InvectPlugin, PluginTableDefinition } from 'src/types/plugin.types';
import { CORE_SCHEMA, CORE_TABLE_NAMES } from './core-schema';

// =============================================================================
// Types
// =============================================================================

export interface MergedSchema {
  /** All tables (core + plugin) in dependency-resolved order */
  tables: MergedTable[];
  /** Which plugin contributed each table/field (for diagnostics) */
  provenance: SchemaProvenance[];
}

export interface MergedTable {
  /** Logical table name (camelCase) */
  name: string;
  /** The merged table definition */
  definition: PluginTableDefinition;
  /** Which source this table came from */
  source: 'core' | string; // 'core' or plugin ID
}

export interface SchemaProvenance {
  /** Table name */
  table: string;
  /** Field name (null for table-level provenance) */
  field: string | null;
  /** Source: 'core' or plugin ID */
  source: string;
}

export interface SchemaMergeError {
  type: 'duplicate_field' | 'duplicate_table' | 'invalid_reference';
  message: string;
  table: string;
  field?: string;
  plugin: string;
}

// =============================================================================
// Merge Function
// =============================================================================

/**
 * Merge core schema with all plugin schemas.
 *
 * @param plugins - Array of plugins (only those with `schema` are processed)
 * @returns Merged schema with tables in dependency order
 * @throws Error if there are conflicting field definitions
 */
export function mergeSchemas(plugins: InvectPlugin[]): MergedSchema {
  const errors: SchemaMergeError[] = [];
  const provenance: SchemaProvenance[] = [];

  // Start with a deep copy of the core schema
  const merged: Record<string, PluginTableDefinition> = {};
  const tableSources: Record<string, string> = {}; // table → source

  // Add core tables
  for (const [name, def] of Object.entries(CORE_SCHEMA)) {
    merged[name] = deepCopyTableDef(def);
    tableSources[name] = 'core';
    provenance.push({ table: name, field: null, source: 'core' });
    for (const fieldName of Object.keys(def.fields)) {
      provenance.push({ table: name, field: fieldName, source: 'core' });
    }
  }

  // Merge each plugin's schema
  for (const plugin of plugins) {
    if (!plugin.schema) {
      continue;
    }

    for (const [tableName, tableDef] of Object.entries(plugin.schema)) {
      if (tableDef.disableMigration) {
        continue;
      }

      const _isCoreTable = CORE_TABLE_NAMES.includes(tableName);
      const existsAlready = tableName in merged;

      if (existsAlready) {
        // Extending an existing table — merge fields additively
        const existing = merged[tableName];
        if (!existing) {
          continue;
        }

        for (const [fieldName, fieldDef] of Object.entries(tableDef.fields)) {
          if (fieldName in existing.fields) {
            // Field already exists — error unless it's from the same source
            const existingSource = provenance.find(
              (p) => p.table === tableName && p.field === fieldName,
            )?.source;

            if (existingSource && existingSource !== plugin.id) {
              errors.push({
                type: 'duplicate_field',
                message: `Field "${fieldName}" on table "${tableName}" already defined by "${existingSource}". Plugin "${plugin.id}" cannot override it.`,
                table: tableName,
                field: fieldName,
                plugin: plugin.id,
              });
            }
            continue; // Skip duplicate
          }

          // Add new field to existing table
          existing.fields[fieldName] = { ...fieldDef };
          provenance.push({ table: tableName, field: fieldName, source: plugin.id });
        }
      } else {
        // New table from plugin
        merged[tableName] = deepCopyTableDef(tableDef);
        tableSources[tableName] = plugin.id;
        provenance.push({ table: tableName, field: null, source: plugin.id });

        for (const fieldName of Object.keys(tableDef.fields)) {
          provenance.push({ table: tableName, field: fieldName, source: plugin.id });
        }
      }
    }
  }

  // Validate foreign key references
  for (const [tableName, tableDef] of Object.entries(merged)) {
    for (const [fieldName, fieldDef] of Object.entries(tableDef.fields)) {
      if (fieldDef.references) {
        // Check if the referenced table exists (by tableName property, not logical name)
        const refTableName = fieldDef.references.table;
        const refExists = Object.values(merged).some(
          (t) => t.tableName === refTableName || Object.keys(merged).includes(refTableName),
        );

        if (!refExists) {
          errors.push({
            type: 'invalid_reference',
            message: `Field "${fieldName}" on table "${tableName}" references table "${refTableName}" which does not exist.`,
            table: tableName,
            field: fieldName,
            plugin: tableSources[tableName] || 'unknown',
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    const messages = errors.map((e) => `  - [${e.plugin}] ${e.message}`).join('\n');
    throw new Error(`Schema merge errors:\n${messages}`);
  }

  // Sort tables by order, then by name for stability
  const tables: MergedTable[] = Object.entries(merged)
    .map(([name, definition]) => ({
      name,
      definition,
      source: (tableSources[name] || 'core') as 'core' | string,
    }))
    .sort((a, b) => {
      const orderA = a.definition.order ?? 100;
      const orderB = b.definition.order ?? 100;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });

  return { tables, provenance };
}

// =============================================================================
// Diff Utilities (for `npx invect-cli generate --diff` preview)
// =============================================================================

export interface SchemaDiff {
  newTables: { name: string; source: string }[];
  newFields: { table: string; field: string; source: string }[];
  unchangedTables: string[];
}

/**
 * Compare a merged schema against a "previous" schema (e.g., from last generation).
 * Used for preview/diff output in the CLI.
 */
export function diffSchemas(current: MergedSchema, previous: MergedSchema | null): SchemaDiff {
  const diff: SchemaDiff = {
    newTables: [],
    newFields: [],
    unchangedTables: [],
  };

  if (!previous) {
    // Everything is new
    diff.newTables = current.tables.map((t) => ({ name: t.name, source: t.source }));
    return diff;
  }

  const previousTableNames = new Set(previous.tables.map((t) => t.name));
  const previousFieldsByTable = new Map<string, Set<string>>();

  for (const table of previous.tables) {
    previousFieldsByTable.set(table.name, new Set(Object.keys(table.definition.fields)));
  }

  for (const table of current.tables) {
    if (!previousTableNames.has(table.name)) {
      diff.newTables.push({ name: table.name, source: table.source });
      continue;
    }

    const prevFields = previousFieldsByTable.get(table.name) || new Set();
    let hasNewFields = false;

    for (const fieldName of Object.keys(table.definition.fields)) {
      if (!prevFields.has(fieldName)) {
        diff.newFields.push({
          table: table.name,
          field: fieldName,
          source: table.source,
        });
        hasNewFields = true;
      }
    }

    if (!hasNewFields) {
      diff.unchangedTables.push(table.name);
    }
  }

  return diff;
}

// =============================================================================
// Helpers
// =============================================================================

function deepCopyTableDef(def: PluginTableDefinition): PluginTableDefinition {
  return {
    ...def,
    fields: Object.fromEntries(Object.entries(def.fields).map(([k, v]) => [k, { ...v }])),
    compositePrimaryKey: def.compositePrimaryKey ? [...def.compositePrimaryKey] : undefined,
  };
}
