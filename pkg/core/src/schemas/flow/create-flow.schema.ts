import { z } from 'zod/v4';
import { createFlowSchema, flowResponseSchema } from '../../types/validation/flow.schemas';

/**
 * POST /flows request schema
 */
export const createFlowRequestSchema = createFlowSchema;
export type CreateFlowRequest = z.infer<typeof createFlowRequestSchema>;

/**
 * POST /flows response schema
 */
export const createFlowResponseSchema = flowResponseSchema;
export type CreateFlowResponse = z.infer<typeof createFlowResponseSchema>;
