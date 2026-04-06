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

  // Determine which helper to use
  const coreHelper = CORE_HELPERS[type];
  const providerHelper = PROVIDER_HELPERS[type];

  const hasParams = Object.keys(params).length > 0;
  const formattedParams = hasParams ? formatParams(params, 0) : '';

  if (coreHelper) {
    // input('ref') or input('ref', { ... })
    if (!hasParams) {
      return `${coreHelper}('${ref}')`;
    }
    return `${coreHelper}('${ref}', ${formattedParams})`;
  }

  if (providerHelper) {
    // gmail.sendMessage('ref', { ... })
    if (!hasParams) {
      return `${providerHelper}('${ref}')`;
    }
    return `${providerHelper}('${ref}', ${formattedParams})`;
  }

  // Fallback: node('type', 'ref', { ... })
  if (!hasParams) {
    return `node('${type}', '${ref}')`;
  }
  return `node('${type}', '${ref}', ${formattedParams})`;
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
    return `['${sourceRef}', '${targetRef}', '${edge.sourceHandle}']`;
  }
  return `['${sourceRef}', '${targetRef}']`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert clipboard nodes and edges into SDK source code text.
 *
 * Returns a string like:
 * ```
 * // Nodes
 * input('query', { variableName: 'query' }),
 *
 * model('answer', {
 *   credentialId: 'cred-abc',
 *   model: 'gpt-4o-mini',
 *   prompt: '{{ query }}',
 * }),
 *
 * // Edges
 * ['query', 'answer'],
 * ```
 */
export function serializeToSDK(nodes: ClipboardNode[], edges: ClipboardEdge[]): string {
  // Build ID → referenceId lookup for edge resolution
  const nodeIdToRef = new Map<string, string>();
  for (const n of nodes) {
    nodeIdToRef.set(n.originalId, n.data.reference_id);
  }

  const parts: string[] = [];

  // Nodes section
  if (nodes.length > 0) {
    parts.push('// Nodes');
    for (const n of nodes) {
      parts.push(serializeNode(n) + ',');
      parts.push('');
    }
  }

  // Edges section
  const serializedEdges = edges
    .map((e) => serializeEdge(e, nodeIdToRef))
    .filter((e): e is string => e !== null);

  if (serializedEdges.length > 0) {
    parts.push('// Edges');
    for (const e of serializedEdges) {
      parts.push(e + ',');
    }
  }

  return parts.join('\n').trimEnd();
}
