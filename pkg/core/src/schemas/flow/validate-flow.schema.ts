import { z } from 'zod/v4';

/**
 * POST /flows/:id/validate request schema
 * Accepts any flow data object
 */
export const validateFlowRequestSchema = z.object({
  flowData: z.object({}).passthrough(), // Accepts any object structure
});
export type ValidateFlowRequest = z.infer<typeof validateFlowRequestSchema>;

/**
 * POST /flows/:id/validate response schema
 * Validation result: { isValid: boolean, errors: ValidationError[] }
 */
export const validationErrorSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
  value: z.unknown().optional(),
});

export const validateFlowResponseSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(validationErrorSchema),
});
export type ValidateFlowResponse = z.infer<typeof validateFlowResponseSchema>;
