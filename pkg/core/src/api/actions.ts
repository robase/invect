import type { ActionsAPI } from './types';
import type { ActionRegistry } from '../actions';
import { createToolExecutorForAction } from '../actions';
import { getGlobalToolRegistry, type AgentToolRegistry } from '../services/agent-tools';
import type { NodeExecutorRegistry } from '../nodes/executor-registry';
import type { ServiceFactory } from '../services/service-factory';
import type { Logger } from '../types/schemas';

export function createActionsAPI(
  actionRegistry: ActionRegistry,
  nodeRegistry: NodeExecutorRegistry,
  sf: ServiceFactory,
  logger: Logger,
): ActionsAPI {
  return {
    getRegistry() {
      return actionRegistry;
    },

    register(action) {
      actionRegistry.register(action);

      // Also register into the tool registry so the agent can discover it
      const toolDef = actionRegistry.toAgentToolDefinition(action.id);
      if (toolDef) {
        const toolRegistry: AgentToolRegistry = getGlobalToolRegistry();
        toolRegistry.register(toolDef, createToolExecutorForAction(action));
      }
    },

    getProviders() {
      return actionRegistry.getProviders();
    },

    getForProvider(providerId) {
      return actionRegistry.getActionsForProvider(providerId);
    },

    getAvailableNodes() {
      // Action-based definitions are the primary source for all node types
      const actionDefs = actionRegistry.getAllNodeDefinitions();

      // Legacy executors only cover AGENT — add its definition if not already
      // present in the action registry
      const actionTypes = new Set(actionDefs.map((d) => d.type as string));
      const legacyDefs = nodeRegistry
        .getAllDefinitions()
        .filter((d) => !actionTypes.has(d.type as string));

      const allDefs = [...actionDefs, ...legacyDefs];

      // Legacy nodes don't carry provider info — stamp them as Invect Core
      for (const def of allDefs) {
        if (!def.provider) {
          def.provider = { id: 'core', name: 'Invect Core', icon: 'Blocks' };
        }
      }

      return allDefs;
    },

    async handleConfigUpdate(event) {
      if (!event?.nodeType) {
        throw new Error('nodeType is required for node config updates');
      }

      if (!event.params || typeof event.params !== 'object') {
        event.params = {};
      }

      const configContext = {
        logger,
        services: {
          credentials: sf.getCredentialsService(),
          baseAIClient: sf.getBaseAIClient(),
        },
      };

      // 1. Try legacy executor (AGENT)
      const executor = nodeRegistry.get(event.nodeType as never);
      if (executor) {
        return executor.handleConfigUpdate(event, configContext);
      }

      // 2. Try action registry
      const action = actionRegistry.get(event.nodeType as string);
      if (action) {
        if (action.onConfigUpdate) {
          return action.onConfigUpdate(
            { ...event, nodeType: event.nodeType as string },
            configContext,
          );
        }

        // No custom handler — return the static definition
        const definition = actionRegistry.toNodeDefinition(event.nodeType as string);
        if (definition) {
          return { definition, params: event.params };
        }
      }

      throw new Error(`Unknown node type '${event.nodeType}' for config update`);
    },

    resolveFieldOptions(actionId, fieldName, deps) {
      const context = {
        logger,
        services: {
          credentials: sf.getCredentialsService(),
        },
      };
      return actionRegistry.resolveFieldOptions(actionId, fieldName, deps, context);
    },
  };
}
