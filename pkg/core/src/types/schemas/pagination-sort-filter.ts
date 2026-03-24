import { z } from 'zod/v4';

/**
 * Common pagination query parameters schema
 * Supports both string and number inputs (useful for URL query parameters)
 */
export const PaginationQuerySchema = z.object({
  page: z
    .union([z.string().transform((val) => parseInt(val, 10)), z.number()])
    .refine((val) => Number.isInteger(val) && val >= 1, {
      message: 'Page number must be a positive integer',
    })
    .default(1),

  limit: z
    .union([z.string().transform((val) => parseInt(val, 10)), z.number()])
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'Limit must be between 1 and 100',
    })
    .default(10),
});

/**
 * Pagination metadata response schema
 */
export const PaginationMetadataSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

/**
 * Generic paginated response schema
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    pagination: PaginationMetadataSchema,
  });

/**
 * Generic filter schema
 * Keys are property names, values are arrays of potential values to match
 */
export const FilterQuerySchema = z.record(z.string(), z.array(z.any()));

/**
 * Sorting parameters schema
 */
export const SortingQuerySchema = z.object({
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Combined query options schema for list operations
 */
export const QueryOptionsSchema = z.object({
  filter: FilterQuerySchema.optional(),
  sort: SortingQuerySchema.optional(),
  pagination: PaginationQuerySchema.optional(),
});

/**
 * Combined pagination and sorting schema (for backward compatibility)
 */
export const PaginationWithSortingSchema = PaginationQuerySchema.merge(SortingQuerySchema);

// Type exports
export type FilterQuery<T> = Partial<
  Record<keyof T, Array<boolean | string | number | Date | null>>
>;

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type PaginationResponseData = z.infer<typeof PaginationMetadataSchema>;
export type PaginatedResponse<T> = {
  data: T[];
  pagination: PaginationResponseData;
};
export type SortingQuery<T> = {
  sortBy: keyof T;
  sortOrder: 'asc' | 'desc';
};
export type QueryOptions<T> = {
  filter?: FilterQuery<T>;
  sort?: SortingQuery<T>;
  pagination?: PaginationQuery;
};
export type PaginationWithSorting = z.infer<typeof PaginationWithSortingSchema>;
