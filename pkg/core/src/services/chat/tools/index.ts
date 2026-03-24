/**
 * Chat Tools — Barrel Export
 *
 * All chat tool groups combined for registration in ChatToolkit.
 */

import type { ChatToolDefinition } from '../chat-types';
import { agentNodeTools } from './agent-tools';
import { contextTools } from './context-tools';
import { flowTools } from './flow-tools';
import { nodeTools } from './node-tools';
import { planTools } from './plan-tools';
import { runTools } from './run-tools';

/**
 * All built-in chat tools.
 */
export const allChatTools: ChatToolDefinition[] = [
  ...contextTools,
  ...flowTools,
  ...nodeTools,
  ...planTools,
  ...agentNodeTools,
  ...runTools,
];
