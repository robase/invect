/**
 * Serialize clipboard nodes + edges as SDK code text.
 *
 * Used by the copy-paste hook to write human-readable SDK code to the system
 * clipboard. When a user copies nodes on the ReactFlow canvas and pastes into
 * a text editor (VS Code, etc.), they get importable SDK helper calls.
 */

import type { ClipboardNode, ClipboardEdge } from './use-copy-paste.types';

// ---------------------------------------------------------------------------
// Action type → SDK helper mapping
// ---------------------------------------------------------------------------

/** Core action types that have dedicated SDK helper functions. */
const CORE_HELPERS: Record<string, string> = {
  'core.input': 'input',
  'core.output': 'output',
  'core.model': 'model',
  'core.javascript': 'javascript',
  'core.if_else': 'ifElse',
  'core.template_string': 'template',
  'http.request': 'httpRequest',
  AGENT: 'agent',
};

/**
 * Provider action types with named namespace methods.
 * Maps `action_id` → `namespace.method`.
 */
const PROVIDER_HELPERS: Record<string, string> = {
  'gmail.send_message': 'gmail.sendMessage',
  'gmail.list_messages': 'gmail.listMessages',
  'gmail.get_message': 'gmail.getMessage',
  'gmail.create_draft': 'gmail.createDraft',
  'gmail.modify_labels': 'gmail.modifyLabels',
  'slack.send_message': 'slack.sendMessage',
  'slack.list_channels': 'slack.listChannels',
  'github.create_issue': 'github.createIssue',
  'github.list_repos': 'github.listRepos',
  'github.create_pull_request': 'github.createPullRequest',
  'github.list_issues': 'github.listIssues',
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a JS value as indented source code. Uses JSON.stringify for
 * primitives/objects and adds 2-space indentation for readability.
 */
function formatValue(value: unknown, indent: number): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  const json = JSON.stringify(value, null, 2);
  if (!json.includes('\n')) {
    return json;
  }
  // Indent continuation lines
  const pad = ' '.repeat(indent);
  return json
    .split('\n')
    .map((line, i) => (i === 0 ? line : pad + line))
    .join('\n');
}

/** Format a position as a JS object literal. */
function formatPosition(pos: { x: number; y: number }): string {
  return `{ x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)} }`;
}

/**
 * Render a single `addedTools` entry as a `tool(toolId, {...})` call.
 * Drops the auto-generated `instanceId` since `agent()` regenerates it on parse.
 */
function formatToolCall(toolEntry: Record<string, unknown>, baseIndent: number): string {
  const { toolId, instanceId: _instanceId, ...rest } = toolEntry;
  const quotedId = JSON.stringify(toolId ?? '');
  const entries = Object.entries(rest).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return `tool(${quotedId})`;
  }
  const pad = ' '.repeat(baseIndent);
  const lines = entries.map(([k, v]) => {
    const formatted = formatValue(v, baseIndent + 2);
    return `${pad}  ${k}: ${formatted},`;
  });
  return `tool(${quotedId}, {\n${lines.join('\n')}\n${pad}})`;
}

/**
 * Render an `addedTools` array as a multi-line array of `tool(...)` calls.
 */
function formatAddedTools(arr: unknown[], baseIndent: number): string {
  if (arr.length === 0) {
    return '[]';
  }
  const pad = ' '.repeat(baseIndent);
  const lines = arr.map((item) => {
    if (typeof item === 'object' && item !== null && 'toolId' in item) {
      return `${pad}  ${formatToolCall(item as Record<string, unknown>, baseIndent + 2)},`;
    }
    return `${pad}  ${formatValue(item, baseIndent + 2)},`;
  });
  return `[\n${lines.join('\n')}\n${pad}]`;
}

/**
 * Render a params object as formatted key-value pairs inside `{ }`.
 * Omits empty objects. Inlines small objects on one line.
 */
function formatParams(params: Record<string, unknown>, baseIndent: number): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return '';
  }

  // Check if it's simple enough to inline (≤ 80 chars, no nested objects/arrays)
  const simple = entries.every(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
  if (simple) {
    const inline = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
    if (inline.length <= 60) {
      return `{ ${inline} }`;
    }
  }

  const pad = ' '.repeat(baseIndent);
  const lines = entries.map(([key, val]) => {
    if (key === 'addedTools' && Array.isArray(val)) {
      return `${pad}  ${key}: ${formatAddedTools(val, baseIndent + 2)},`;
    }
    const formatted = formatValue(val, baseIndent + 2);
    return `${pad}  ${key}: ${formatted},`;
  });

  return `{\n${lines.join('\n')}\n${pad}}`;
}

// ---------------------------------------------------------------------------
// Node serializer
// ---------------------------------------------------------------------------

function serializeNode(node: ClipboardNode): string {
  const ref = node.data.reference_id;
  const params = node.data.params;
  const type = node.type;
  const pos = node.relativePosition;

  // Determine which helper to use
  const coreHelper = CORE_HELPERS[type];
  const providerHelper = PROVIDER_HELPERS[type];

  const hasParams = Object.keys(params).length > 0;
  const formattedParams = hasParams ? formatParams(params, 0) : '{}';
  const optionsStr = `{ position: ${formatPosition(pos)} }`;

  if (coreHelper) {
    return `${coreHelper}('${ref}', ${formattedParams}, ${optionsStr})`;
  }

  if (providerHelper) {
    return `${providerHelper}('${ref}', ${formattedParams}, ${optionsStr})`;
  }

  // Fallback: node('type', 'ref', { ... }, { position })
  return `node('${type}', '${ref}', ${formattedParams}, ${optionsStr})`;
}

// ---------------------------------------------------------------------------
// Edge serializer
// ---------------------------------------------------------------------------

function serializeEdge(edge: ClipboardEdge, nodeIdToRef: Map<string, string>): string | null {
  const sourceRef = nodeIdToRef.get(edge.source);
  const targetRef = nodeIdToRef.get(edge.target);
  if (!sourceRef || !targetRef) {
    return null;
  }

  if (edge.sourceHandle) {
    return `{ from: ${JSON.stringify(sourceRef)}, to: ${JSON.stringify(targetRef)}, handle: ${JSON.stringify(edge.sourceHandle)} }`;
  }
  return `{ from: ${JSON.stringify(sourceRef)}, to: ${JSON.stringify(targetRef)} }`;
}

// ---------------------------------------------------------------------------
// Import collection
// ---------------------------------------------------------------------------

function collectImports(nodes: ClipboardNode[]): {
  coreHelpers: Set<string>;
  providerNamespaces: Set<string>;
} {
  const coreHelpers = new Set<string>();
  const providerNamespaces = new Set<string>();

  for (const n of nodes) {
    const core = CORE_HELPERS[n.type];
    const provider = PROVIDER_HELPERS[n.type];
    if (core) {
      coreHelpers.add(core);
    } else if (provider) {
      providerNamespaces.add(provider.split('.')[0]);
    } else {
      coreHelpers.add('node');
    }

    // `addedTools` entries serialize as `tool(...)` calls — pull in the helper.
    const added = (n.data.params as Record<string, unknown>)?.addedTools;
    if (Array.isArray(added) && added.length > 0) {
      coreHelpers.add('tool');
    }
  }

  return { coreHelpers, providerNamespaces };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SerializeOptions {
  /**
   * When true, emit a full runnable `.flow.ts` file — imports + a
   * `defineFlow({...})` default export wrapping the nodes/edges. When
   * false (default), emit just the `nodes: [...]` / `edges: [...]`
   * fragment used for partial-selection copy-paste.
   */
  asFullFile?: boolean;
  /** Optional `name` property for the defineFlow call. */
  flowName?: string;
}

/**
 * Convert clipboard nodes and edges into SDK source code text.
 *
 * Returns a string shaped like a `defineFlow()` body:
 * ```
 * nodes: [
 *   input('query', { variableName: 'query' }),
 *   model('answer', {
 *     credentialId: 'cred-abc',
 *     model: 'gpt-4o-mini',
 *     prompt: '{{ query }}',
 *   }),
 * ],
 * edges: [
 *   ['query', 'answer'],
 * ],
 * ```
 */
export function serializeToSDK(
  nodes: ClipboardNode[],
  edges: ClipboardEdge[],
  options: SerializeOptions = {},
): string {
  // Build ID → referenceId lookup for edge resolution
  const nodeIdToRef = new Map<string, string>();
  for (const n of nodes) {
    nodeIdToRef.set(n.originalId, n.data.reference_id);
  }

  const parts: string[] = [];

  // Nodes array
  if (nodes.length > 0) {
    parts.push('nodes: [');
    for (const n of nodes) {
      parts.push('  ' + serializeNode(n) + ',');
    }
    parts.push('],');
  }

  // Edges array
  const serializedEdges = edges
    .map((e) => serializeEdge(e, nodeIdToRef))
    .filter((e): e is string => e !== null);

  if (serializedEdges.length > 0) {
    parts.push('edges: [');
    for (const e of serializedEdges) {
      parts.push('  ' + e + ',');
    }
    parts.push('],');
  }

  const body = parts.join('\n').trimEnd();

  if (!options.asFullFile) {
    return body;
  }

  const { coreHelpers, providerNamespaces } = collectImports(nodes);
  const allImports = ['defineFlow', ...[...coreHelpers].sort(), ...[...providerNamespaces].sort()];
  const importLines = [`import { ${allImports.join(', ')} } from '@invect/core/sdk';`];

  const indentedBody = body
    .split('\n')
    .map((line) => (line.length > 0 ? '  ' + line : line))
    .join('\n');

  const flowMeta = options.flowName ? `  name: ${JSON.stringify(options.flowName)},\n` : '';

  return [
    importLines.join('\n'),
    '',
    'export default defineFlow({',
    flowMeta + indentedBody,
    '});',
    '',
  ].join('\n');
}
