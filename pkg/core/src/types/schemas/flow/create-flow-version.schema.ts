import { z } from 'zod/v4';
import { flowVersionResponseSchema } from '../../validation/flow.schemas';

/**
 * POST /flows/:id/versions response schema
 */
export const createFlowVersionResponseSchema = flowVersionResponseSchema;
export type CreateFlowVersionResponse = z.infer<typeof createFlowVersionResponseSchema>;
