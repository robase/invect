/**
 * Standalone Agent Tools
 *
 * These are tools that don't have a corresponding node executor.
 * Node-based tools (JQ, HTTP Request, Gmail) are registered automatically
 * from their node executors via AgentToolCapable interface.
 */

import { Logger } from 'src/schemas';
import { AgentToolRegistry } from '../agent-tool-registry';
import { mathToolDefinition, mathToolExecutor } from './math-tool';

/**
 * Register standalone tools (tools without corresponding nodes)
 */
export function registerStandaloneTools(registry: AgentToolRegistry, logger?: Logger): void {
  // Math evaluation tool - standalone utility
  registry.register(mathToolDefinition, mathToolExecutor);
  logger?.debug('Registered standalone tool: math_eval');

  logger?.info(`Registered ${1} standalone agent tools`);
}

// Re-export standalone tools for direct use
export { mathToolDefinition, mathToolExecutor };
