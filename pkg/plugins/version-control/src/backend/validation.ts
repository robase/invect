// =============================================================================
// Version Control Plugin — Input Validation Schemas
// =============================================================================

import { z } from 'zod/v4';
import { VC_SYNC_MODES, VC_SYNC_DIRECTIONS } from '../shared/types';

export const configureSyncInputSchema = z.object({
  repo: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, 'Invalid repo format. Expected "owner/name".')
    .optional(),
  branch: z
    .string()
    .max(256)
    .regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid branch name.')
    .optional(),
  filePath: z
    .string()
    .max(1024)
    .regex(/^[a-zA-Z0-9._/-]+\.flow\.ts$/, 'File path must end with .flow.ts')
    .optional(),
  mode: z.enum(VC_SYNC_MODES).optional(),
  syncDirection: z.enum(VC_SYNC_DIRECTIONS).optional(),
  enabled: z.boolean().optional(),
});

export const historyLimitSchema = z.coerce.number().int().min(1).max(100).default(20);
