import { z } from 'zod/v4';

/**
 * DELETE /flows/:id request schema
 * No body, only route param 'id'
 */
export const deleteFlowParamsSchema = z.object({
  id: z.string().min(1, 'Flow ID is required'),
});
export type DeleteFlowParams = z.infer<typeof deleteFlowParamsSchema>;

/**
 * DELETE /flows/:id response schema
 * No content (204), but for error: errorResponseSchema
 */
export const deleteFlowResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});
export type DeleteFlowResponse = z.infer<typeof deleteFlowResponseSchema>;
