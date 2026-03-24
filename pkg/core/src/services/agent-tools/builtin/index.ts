/**
 * Standalone Agent Tools
 *
 * These are tools that don't have a corresponding node executor.
 * Node-based tools (JQ, HTTP Request, Gmail) are registered automatically
 * from their node executors via AgentToolCapable interface.
 */

import { Logger } from 'src/types/schemas';
import { AgentToolRegistry } from '../agent-tool-registry';
import { mathToolDefinition, mathToolExecutor } from './math-tool';
import { jsonLogicToolDefinition, jsonLogicToolExecutor } from './json-logic-tool';

/**
 * Register standalone tools (tools without corresponding nodes)
 */
export function registerStandaloneTools(registry: AgentToolRegistry, logger?: Logger): void {
  // Math evaluation tool - standalone utility
  registry.register(mathToolDefinition, mathToolExecutor);
  logger?.debug('Registered standalone tool: math_eval');

  // JSON Logic tool - standalone utility (used internally by If-Else node)
  registry.register(jsonLogicToolDefinition, jsonLogicToolExecutor);
  logger?.debug('Registered standalone tool: json_logic');

  logger?.info(`Registered ${2} standalone agent tools`);
}

// Re-export standalone tools for direct use
export { mathToolDefinition, mathToolExecutor, jsonLogicToolDefinition, jsonLogicToolExecutor };
