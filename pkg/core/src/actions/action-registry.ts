/**
 * Action Registry
 *
 * Central registry for all action definitions.  Provides:
 *  - Registration of ActionDefinition objects
 *  - Lookup by action id / provider id
 *  - Conversion to the existing NodeDefinition and AgentToolDefinition types
 *    so the rest of the system can consume actions through the legacy interfaces
 *    during the migration period.
 */

import type {
  ActionDefinition,
  ParamField,
  ProviderDef,
  LoadOptionsContext,
  LoadOptionsResult,
} from './types';
import type { Logger } from 'src/schemas/invect-config';
import type { NodeDefinition, NodeParamField, NodeCategory } from 'src/types/node-definition.types';
import type { AgentToolDefinition, AgentToolCategory } from 'src/types/agent-tool.types';

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();
  private providerActions = new Map<string, Set<string>>();
  private providers = new Map<string, ProviderDef>();

  constructor(private readonly logger?: Logger) {}

  // ─── Registration ──────────────────────────────────────────────────────

  register(action: ActionDefinition): void {
    if (this.actions.has(action.id)) {
      this.logger?.warn(`Action "${action.id}" already registered – overwriting`);
    }

    this.actions.set(action.id, action as ActionDefinition);

    // Track provider (de-duplicated by id)
    const pid = action.provider.id;
    if (!this.providers.has(pid)) {
      this.providers.set(pid, action.provider);
      this.providerActions.set(pid, new Set());
    }
    const providerSet = this.providerActions.get(pid);
    if (providerSet) {
      providerSet.add(action.id);
    }

    this.logger?.debug(`Registered action: ${action.id}`);
  }

  /** Register many actions at once. */
  registerMany(actions: ActionDefinition[]): void {
    for (const action of actions) {
      this.register(action);
    }
  }

  // ─── Lookup ────────────────────────────────────────────────────────────

  /** Get an action by its id (e.g. "gmail.list_messages"). */
  get(actionId: string): ActionDefinition | undefined {
    return this.actions.get(actionId);
  }

  /** Whether an action id is registered. */
  has(actionId: string): boolean {
    return this.actions.has(actionId);
  }

  /** All registered actions. */
  getAll(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /** Number of registered actions. */
  get size(): number {
    return this.actions.size;
  }

  // ─── Provider queries ──────────────────────────────────────────────────

  /** All known providers. */
  getProviders(): ProviderDef[] {
    return Array.from(this.providers.values());
  }

  /** Get a provider by id. */
  getProvider(providerId: string): ProviderDef | undefined {
    return this.providers.get(providerId);
  }

  /** Get every action that belongs to a provider. */
  getActionsForProvider(providerId: string): ActionDefinition[] {
    const ids = this.providerActions.get(providerId);
    if (!ids) {
      return [];
    }
    return Array.from(ids)
      .map((id) => this.actions.get(id))
      .filter((a): a is ActionDefinition => a !== undefined);
  }

  // ─── Conversion helpers ────────────────────────────────────────────────

  /**
   * Convert an action to the legacy `NodeDefinition` shape.
   * Used by the node executor registry and the frontend palette endpoint.
   */
  toNodeDefinition(actionId: string): NodeDefinition | null {
    const action = this.get(actionId);
    if (!action) {
      return null;
    }
    return actionToNodeDefinition(action);
  }

  /**
   * Convert an action to an `AgentToolDefinition`.
   * Used by the agent tool registry so tools are discoverable.
   */
  toAgentToolDefinition(actionId: string): AgentToolDefinition | null {
    const action = this.get(actionId);
    if (!action) {
      return null;
    }

    if (action.provider.id === 'triggers' || action.id.startsWith('trigger.')) {
      return null;
    }

    if (action.excludeFromTools) {
      return null;
    }

    // Only include fields the AI should fill at runtime
    const aiFields = action.params.fields.filter((f) => f.aiProvided !== false);

    return {
      id: action.id,
      name: action.name,
      description: action.description,
      category: mapProviderCategoryToToolCategory(action.provider.category),
      tags: action.tags ?? [action.provider.id],
      enabledByDefault: false,
      inputSchema: buildJsonSchema(aiFields),
      nodeType: action.id,
      provider: {
        id: action.provider.id,
        name: action.provider.name,
        icon: action.provider.icon,
        ...(action.provider.svgIcon ? { svgIcon: action.provider.svgIcon } : {}),
      },
    };
  }

  /** Convert every registered action to NodeDefinition form. */
  getAllNodeDefinitions(): NodeDefinition[] {
    return this.getAll()
      .map((a) => this.toNodeDefinition(a.id))
      .filter((d): d is NodeDefinition => d !== null);
  }

  /** Convert every registered action to AgentToolDefinition form. */
  getAllAgentToolDefinitions(): AgentToolDefinition[] {
    return this.getAll()
      .map((a) => this.toAgentToolDefinition(a.id))
      .filter((d): d is AgentToolDefinition => d !== null);
  }

  /**
   * Resolve dynamic options for a specific field on an action.
   *
   * Finds the field's `loadOptions.handler`, calls it with the provided
   * dependency values and service context, and returns the result.
   */
  async resolveFieldOptions(
    actionId: string,
    fieldName: string,
    dependencyValues: Record<string, unknown>,
    context: LoadOptionsContext,
  ): Promise<LoadOptionsResult> {
    const action = this.get(actionId);
    if (!action) {
      throw new Error(`Unknown action '${actionId}'`);
    }

    const field = action.params.fields.find((f) => f.name === fieldName);
    if (!field) {
      throw new Error(`Unknown field '${fieldName}' on action '${actionId}'`);
    }

    if (!field.loadOptions) {
      throw new Error(`Field '${fieldName}' on action '${actionId}' does not have loadOptions`);
    }

    return field.loadOptions.handler(dependencyValues, context);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let globalActionRegistry: ActionRegistry | null = null;

/** Get (or lazily create) the global action registry. */
export function getGlobalActionRegistry(): ActionRegistry {
  if (!globalActionRegistry) {
    globalActionRegistry = new ActionRegistry();
  }
  return globalActionRegistry;
}

/** Initialise the global registry with a logger. */
export function initializeGlobalActionRegistry(logger?: Logger): ActionRegistry {
  globalActionRegistry = new ActionRegistry(logger);
  return globalActionRegistry;
}

/** Replace the global singleton (useful for testing). */
export function setGlobalActionRegistry(registry: ActionRegistry): void {
  globalActionRegistry = registry;
}

/** Reset to `null` (testing teardown). */
export function resetGlobalActionRegistry(): void {
  globalActionRegistry = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function paramFieldToNodeParamField(f: ParamField): NodeParamField {
  return {
    name: f.name,
    label: f.label,
    type: f.type as NodeParamField['type'],
    description: f.description,
    placeholder: f.placeholder,
    defaultValue: f.defaultValue,
    required: f.required,
    hidden: f.hidden,
    options: f.options,
    extended: f.extended,
    // Serialize only the metadata (dependsOn) — the handler stays server-side
    ...(f.loadOptions ? { loadOptions: { dependsOn: f.loadOptions.dependsOn } } : {}),
  };
}

const PROVIDER_TO_TOOL_CATEGORY: Record<string, AgentToolCategory> = {
  email: 'web',
  messaging: 'web',
  storage: 'web',
  database: 'data',
  development: 'web',
  ai: 'utility',
  http: 'web',
  utility: 'utility',
  core: 'utility',
  custom: 'custom',
};

function mapProviderCategoryToToolCategory(cat: string): AgentToolCategory {
  return PROVIDER_TO_TOOL_CATEGORY[cat] ?? 'utility';
}

function buildJsonSchema(fields: ParamField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of fields) {
    const prop: Record<string, unknown> = {
      description: field.description ?? field.label,
    };

    switch (field.type) {
      case 'number':
        prop.type = 'number';
        break;
      case 'boolean':
        prop.type = 'boolean';
        break;
      case 'json':
        // JSON fields can be objects or arrays
        prop.type = ['object', 'array', 'string'];
        break;
      default:
        prop.type = 'string';
    }

    if (field.placeholder) {
      prop.examples = [field.placeholder];
    }

    properties[field.name] = prop;
    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert an ActionDefinition to a NodeDefinition without needing a registry instance.
 * Useful inside `onConfigUpdate` handlers that need to return a NodeDefinition.
 */
export function actionToNodeDefinition<T = unknown>(action: ActionDefinition<T>): NodeDefinition {
  const credentialField: NodeParamField | undefined = action.credential
    ? {
        name: 'credentialId',
        label: `${action.provider.name} Credential`,
        type: 'credential',
        required: action.credential.required,
        credentialTypes: action.credential.type ? [action.credential.type] : undefined,
        oauth2Providers: action.credential.oauth2Provider
          ? [action.credential.oauth2Provider]
          : undefined,
        requiredScopes: action.credential.requiredScopes,
      }
    : undefined;

  const cat = action.provider.category;
  const category: NodeCategory =
    action.provider.id === 'triggers'
      ? 'Triggers'
      : cat === 'core' || cat === 'http' || cat === 'utility'
        ? 'Common'
        : cat === 'ai'
          ? 'AI'
          : cat === 'database'
            ? 'Data'
            : cat === 'custom'
              ? 'Custom'
              : 'Integrations';

  return {
    type: action.id,
    label: action.name,
    description: action.description,
    category,
    icon: action.icon ?? action.provider.icon,
    provider: {
      id: action.provider.id,
      name: action.provider.name,
      icon: action.provider.icon,
      ...(action.provider.svgIcon ? { svgIcon: action.provider.svgIcon } : {}),
    },
    input: action.noInput ? undefined : { id: 'input', label: 'Input', type: 'object' },
    outputs: action.outputs ?? [{ id: 'output', label: 'Output', type: 'object' }],
    dynamicOutputs: action.dynamicOutputs,
    paramFields: [
      ...(credentialField ? [credentialField] : []),
      ...action.params.fields
        .filter((f) => !(credentialField && f.name === 'credentialId'))
        .map(paramFieldToNodeParamField),
    ],
    defaultParams: Object.fromEntries(
      action.params.fields
        .filter((f) => f.defaultValue !== undefined)
        .map((f) => [f.name, f.defaultValue]),
    ),
    searchTerms: action.tags,
    maxInstances: action.maxInstances,
    hidden: action.hidden,
  };
}
