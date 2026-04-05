import { Logger } from 'src/schemas';
import { AnyNodeExecutor } from './base-node';
import { GraphNodeType } from 'src/types.internal';
import { AgentNodeExecutor } from './agent-executor';
import { NodeDefinition } from '../types/node-definition.types';
import { AgentToolRegistry } from 'src/services/agent-tools/agent-tool-registry';

/**
 * Registry to store all node executors
 */
export class NodeExecutorRegistry {
  private executors: Map<GraphNodeType, AnyNodeExecutor> = new Map();

  register(executor: AnyNodeExecutor) {
    this.executors.set(executor.nodeType, executor);
  }

  get(nodeType: GraphNodeType): AnyNodeExecutor | undefined {
    return this.executors.get(nodeType);
  }

  getAll(): AnyNodeExecutor[] {
    return Array.from(this.executors.values());
  }

  getAllDefinitions(): NodeDefinition[] {
    return Array.from(this.executors.values()).map((executor) => executor.getDefinition());
  }

  has(nodeType: GraphNodeType): boolean {
    return this.executors.has(nodeType);
  }
}

/**
 * Default Node Registry Factory
 * Creates a registry with all built-in node executors
 */
export class DefaultNodeRegistryFactory {
  /**
   * Create a registry with all built-in node executors
   */
  static async createDefault(
    logger?: Logger,
    toolRegistry?: AgentToolRegistry,
  ): Promise<NodeExecutorRegistry> {
    const registry = new NodeExecutorRegistry();

    // Register default instances
    try {
      // Only the AGENT executor remains as a legacy executor.
      // All other node types are handled by the Provider-Actions system.
      registry.register(new AgentNodeExecutor(toolRegistry));

      logger?.info('Node registry created with AGENT executor (other nodes use action system)');
    } catch (error) {
      logger?.error('Failed to create default node registry', error);
    }

    return registry;
  }
}
