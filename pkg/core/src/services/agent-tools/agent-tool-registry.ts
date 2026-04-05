/**
 * Agent Tool Registry
 *
 * Registry for managing agent tools. Tools can be:
 * 1. Action-based (automatically registered from defineAction())
 * 2. Standalone (tools without corresponding nodes, like math_eval)
 * 3. Custom (user-defined via API)
 * 4. Flow-based (another flow as a tool)
 */

import { Logger } from 'src/schemas';
import {
  AgentToolDefinition,
  AgentToolExecutor,
  RegisteredAgentTool,
  AgentToolCategory,
} from 'src/types/agent-tool.types';

/**
 * Registry for agent tools
 */
export class AgentToolRegistry {
  private tools = new Map<string, RegisteredAgentTool>();

  constructor(private readonly logger?: Logger) {}

  /**
   * Register a tool with its executor
   */
  register(definition: AgentToolDefinition, executor: AgentToolExecutor): void {
    if (this.tools.has(definition.id)) {
      this.logger?.warn(`Tool '${definition.id}' is being overwritten`);
    }

    this.tools.set(definition.id, { definition, executor });
    this.logger?.debug(`Registered agent tool: ${definition.id}`);
  }

  /**
   * Get a registered tool by ID
   */
  get(toolId: string): RegisteredAgentTool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all registered tools
   */
  getAll(): RegisteredAgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: AgentToolCategory): RegisteredAgentTool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.definition.category === category);
  }

  /**
   * Get only tool definitions (without executors)
   */
  getDefinitions(): AgentToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  /**
   * Get definitions for specific tool IDs
   */
  getDefinitionsForIds(toolIds: string[]): AgentToolDefinition[] {
    return toolIds
      .map((id) => this.tools.get(id)?.definition)
      .filter((def): def is AgentToolDefinition => def !== undefined);
  }

  /**
   * Check if a tool is registered
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Get count of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Get tools that are enabled by default
   */
  getDefaultEnabled(): RegisteredAgentTool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.definition.enabledByDefault);
  }
}

// Global registry instance
let globalToolRegistry: AgentToolRegistry | null = null;

/**
 * Get the global tool registry instance
 */
export function getGlobalToolRegistry(): AgentToolRegistry {
  if (!globalToolRegistry) {
    throw new Error(
      'Global tool registry not initialized. Call initializeGlobalToolRegistry() first.',
    );
  }
  return globalToolRegistry;
}

/**
 * Set the global tool registry instance
 */
export function setGlobalToolRegistry(registry: AgentToolRegistry): void {
  globalToolRegistry = registry;
}

/**
 * Initialize the global registry with tools from node executors and standalone tools
 */
export async function initializeGlobalToolRegistry(logger?: Logger): Promise<AgentToolRegistry> {
  const registry = new AgentToolRegistry(logger);

  // Import and register standalone tools (tools without corresponding nodes)
  const { registerStandaloneTools } = await import('./builtin');
  registerStandaloneTools(registry, logger);

  setGlobalToolRegistry(registry);
  logger?.info(`Agent tool registry initialized with ${registry.size} tools`);

  return registry;
}

/**
 * Reset the global tool registry
 */
export function resetGlobalToolRegistry(): void {
  globalToolRegistry = null;
}
