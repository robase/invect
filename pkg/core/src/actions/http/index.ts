/**
 * HTTP provider barrel export.
 */

export { httpRequestAction } from './request';

import type { ActionDefinition } from '../types';
import { httpRequestAction } from './request';

/** All HTTP actions as an array (for bulk registration). */
export const httpActions: ActionDefinition[] = [httpRequestAction];
