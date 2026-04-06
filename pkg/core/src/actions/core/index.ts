/**
 * Core actions barrel export.
 *
 * Import this module to register all core actions in the ActionRegistry.
 */

export { javascriptAction } from './javascript';
export { inputAction } from './input';
export { templateStringAction } from './template-string';
export { outputAction } from './output';
export { ifElseAction } from './if-else';
export { switchAction } from './switch';
export { modelAction } from './model';

import type { ActionDefinition } from '../types';
import { javascriptAction } from './javascript';
import { inputAction } from './input';
import { templateStringAction } from './template-string';
import { outputAction } from './output';
import { ifElseAction } from './if-else';
import { switchAction } from './switch';
import { modelAction } from './model';

/** All core actions as an array (for bulk registration). */
export const coreActions: ActionDefinition[] = [
  javascriptAction,
  inputAction,
  templateStringAction,
  outputAction,
  ifElseAction,
  switchAction,
  modelAction,
];
