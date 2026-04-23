/**
 * Chat Tools — Barrel Export
 *
 * All chat tool groups combined for registration in ChatToolkit.
 */

import type { ChatToolDefinition } from '../chat-types';
import { agentNodeTools } from './agent-tools';
import { contextTools } from './context-tools';
import { flowTools } from './flow-tools';
import { memoryTools } from './memory-tools';
import { multiFlowTools } from './multi-flow-tools';
import { nodeTools } from './node-tools';
import { planTools } from './plan-tools';
import { runTools } from './run-tools';
import { sdkTools } from './sdk-tools';

/**
 * All built-in chat tools.
 *
 * Registration order is routing-neutral — all tools are exposed to the LLM
 * at once. The system prompt steers which tools to prefer for which task.
 *
 * `sdkTools` (`get_flow_source` / `edit_flow_source` / `write_flow_source`)
 * are the Phase 7 source-level interface — preferred for bulk authoring and
 * coordinated edits. The granular JSON-patch tools in `flowTools`, `nodeTools`,
 * and `agentNodeTools` remain available as a targeted fallback for surgical
 * edits and anything the SDK round-trip doesn't handle cleanly.
 */
export const allChatTools: ChatToolDefinition[] = [
  ...contextTools,
  ...sdkTools,
  ...flowTools,
  ...nodeTools,
  ...planTools,
  ...agentNodeTools,
  ...runTools,
  ...memoryTools,
  ...multiFlowTools,
];
