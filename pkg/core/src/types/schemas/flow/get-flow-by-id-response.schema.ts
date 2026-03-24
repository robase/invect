import { z } from 'zod/v4';
import { flowSchema, flowVersionSchema } from '../../validation/flow.schemas';

/**
 * GET /flows/:id response schema
 * Express returns flow object with versions, NestJS returns flow object only
 * This schema supports both by making versions optional
 */
export const getFlowByIdResponseSchema = flowSchema.extend({
  versions: z.array(flowVersionSchema).optional(),
});

export type GetFlowByIdResponse = z.infer<typeof getFlowByIdResponseSchema>;
