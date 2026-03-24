import { z } from 'zod/v4';
import { updateFlowSchema, flowResponseSchema } from '../../validation/flow.schemas';

/**
 * PUT /flows/:id request schema
 * Partial update of flow fields
 */
export const updateFlowRequestSchema = updateFlowSchema;
export type UpdateFlowRequest = z.infer<typeof updateFlowRequestSchema>;

/**
 * PUT /flows/:id response schema
 * Returns the updated flow object
 */
export const updateFlowResponseSchema = flowResponseSchema;
export type UpdateFlowResponse = z.infer<typeof updateFlowResponseSchema>;
