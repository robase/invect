import { z } from 'zod/v4';
import { flowVersionsResponseSchema } from '../../validation/flow.schemas';

/**
 * GET /flows/:id/versions response schema
 * Paginated array of flow version objects
 */
export const getFlowVersionsResponseSchema = flowVersionsResponseSchema;
export type GetFlowVersionsResponse = z.infer<typeof getFlowVersionsResponseSchema>;
