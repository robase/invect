export type NodeCategory =
  | 'Common'
  | 'AI'
  | 'Data'
  | 'Logic'
  | 'IO'
  | 'Integrations'
  | 'Custom'
  | 'Triggers';

export interface NodeHandleDefinition {
  id: string;
  label: string;
  type: string; // e.g., "string", "object", "any"
  required?: boolean;
  description?: string;
}

export interface NodeParamField {
  name: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'select'
    | 'number'
    | 'boolean'
    | 'json'
    | 'code'
    | 'credential'
    | 'switch-cases';
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  options?: { label: string; value: string | number }[]; // For select
  required?: boolean;
  hidden?: boolean; // For internal params
  disabled?: boolean;
  extended?: boolean; // If true, field is shown in "More Options" collapsed section

  // Credential field options (only used when type="credential")
  credentialTypes?: ('oauth2' | 'api_key' | 'basic_auth' | 'database' | 'llm')[]; // Filter credentials by auth type or credential type
  oauth2Providers?: string[]; // Filter OAuth2 credentials by provider ID (e.g., "google")

  // Dynamic option loading metadata (serialised from action's loadOptions config)
  /** When present, this field's options should be loaded from the server. */
  loadOptions?: {
    /** Sibling field names that trigger a reload when they change. */
    dependsOn: string[];
  };
}

export interface NodeDefinition {
  /**
   * Node type identifier. Can be a GraphNodeType enum value (e.g. "MODEL")
   * or a provider action ID (e.g. "gmail.list_messages").
   */
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  icon?: string; // Icon name;

  /**
   * Provider info for grouping in the node palette.
   * Actions populate this from their ProviderDef; legacy nodes may leave it undefined.
   */
  provider?: {
    id: string;
    name: string;
    icon?: string;
    /** Raw SVG markup for custom provider branding. Takes precedence over `icon`. */
    svgIcon?: string;
  };

  /**
   * Single unified input handle definition. Undefined when the node does not accept inbound edges (e.g. Flow Input node).
   */
  input?: NodeHandleDefinition;

  /**
   * Fixed output handles.
   * For nodes with `dynamicOutputs`, these are placeholders —
   * the frontend derives actual handles from the node's params.
   */
  outputs: NodeHandleDefinition[];

  /**
   * When true, output handles are derived from the node's params at render
   * time (e.g. switch node cases) instead of using the static `outputs` array.
   */
  dynamicOutputs?: boolean;

  /**
   * Configuration fields for the node (displayed in the sidebar/form).
   * These define the UI for editing params.
   *
   * Note: Runtime validation is done via paramsSchema on the executor class.
   */
  paramFields: NodeParamField[];

  /**
   * Default values for parameters.
   */
  defaultParams?: Record<string, unknown>;

  /**
   * Extra keywords / synonyms for search and discovery.
   * Sourced from `ActionDefinition.tags` for action-based nodes.
   */
  searchTerms?: string[];

  /**
   * Maximum number of instances of this node type allowed per flow.
   * Undefined = unlimited.
   */
  maxInstances?: number;

  /**
   * When true, hide this node from the palette (deprecated but still executable).
   */
  hidden?: boolean;
}
