// =============================================================================
// Flow Serializer — converts InvectDefinition JSON ↔ .flow.ts file content
// =============================================================================

/**
 * Serializes an InvectDefinition to a readable .flow.ts file.
 *
 * The output uses the Option A (declarative) format from the SDK plan:
 *   defineFlow({ name, nodes: [...], edges: [...] })
 *
 * NOTE: This is a standalone serializer — it doesn't depend on the SDK being
 * implemented yet. It generates the .flow.ts text directly from the definition JSON.
 * When the SDK ships, this will import the actual helpers instead.
 */
export function serializeFlowToTs(
  definition: FlowDefinitionJson,
  metadata: { name: string; description?: string; tags?: string[] },
): string {
  const lines: string[] = [];

  // Collect which helper functions are needed
  const helpers = new Set<string>();
  const providerImports = new Map<string, Set<string>>();

  for (const node of definition.nodes) {
    const { helperName, providerNs } = resolveHelper(node.type);
    if (providerNs) {
      if (!providerImports.has(providerNs)) {
        providerImports.set(providerNs, new Set());
      }
      providerImports.get(providerNs)?.add(helperName);
    } else {
      helpers.add(helperName);
    }
  }

  // Always need defineFlow
  helpers.add('defineFlow');

  // Build import line
  const coreHelpers = [...helpers].sort();
  lines.push(`import { ${coreHelpers.join(', ')} } from '@invect/core/sdk';`);

  for (const [ns, _methods] of providerImports) {
    lines.push(`import { ${ns} } from '@invect/core/sdk/providers';`);
  }

  lines.push('');
  lines.push('export default defineFlow({');

  // Metadata
  lines.push(`  name: ${JSON.stringify(metadata.name)},`);
  if (metadata.description) {
    lines.push(`  description: ${JSON.stringify(metadata.description)},`);
  }
  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`  tags: ${JSON.stringify(metadata.tags)},`);
  }

  // Nodes
  lines.push('');
  lines.push('  nodes: [');
  for (const node of definition.nodes) {
    const ref = node.referenceId || node.id;
    const { helperCall } = resolveHelper(node.type);
    const params = serializeParams(node.params);
    lines.push(`    ${helperCall}(${JSON.stringify(ref)}, ${params}),`);
    lines.push('');
  }
  lines.push('  ],');

  // Edges (tuple shorthand)
  lines.push('');
  lines.push('  edges: [');
  for (const edge of definition.edges) {
    const source = resolveNodeRef(edge.source, definition.nodes);
    const target = resolveNodeRef(edge.target, definition.nodes);
    if (edge.sourceHandle) {
      lines.push(
        `    [${JSON.stringify(source)}, ${JSON.stringify(target)}, ${JSON.stringify(edge.sourceHandle)}],`,
      );
    } else {
      lines.push(`    [${JSON.stringify(source)}, ${JSON.stringify(target)}],`);
    }
  }
  lines.push('  ],');

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Helpers
// =============================================================================

interface FlowDefinitionJson {
  nodes: Array<{
    id: string;
    type: string;
    label?: string;
    referenceId?: string;
    position?: { x: number; y: number };
    params: Record<string, unknown>;
    mapper?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
}

/** Map action IDs to SDK helper function names */
const ACTION_TO_HELPER: Record<string, { helperName: string; providerNs?: string }> = {
  'core.input': { helperName: 'input' },
  'core.output': { helperName: 'output' },
  'core.model': { helperName: 'model' },
  'core.jq': { helperName: 'jq' },
  'core.if_else': { helperName: 'ifElse' },
  'core.template_string': { helperName: 'template' },
  'core.javascript': { helperName: 'javascript' },
  'core.loop': { helperName: 'loop' },
  'http.request': { helperName: 'httpRequest' },
  AGENT: { helperName: 'agent' },
};

function resolveHelper(nodeType: string): {
  helperName: string;
  helperCall: string;
  providerNs?: string;
} {
  const known = ACTION_TO_HELPER[nodeType];
  if (known) {
    return {
      helperName: known.helperName,
      helperCall: known.providerNs ? `${known.providerNs}.${known.helperName}` : known.helperName,
      providerNs: known.providerNs,
    };
  }

  // For provider actions like "gmail.send_message" → gmail.sendMessage
  const dotIdx = nodeType.indexOf('.');
  if (dotIdx > 0) {
    const ns = nodeType.substring(0, dotIdx);
    const action = nodeType.substring(dotIdx + 1);
    const camel = snakeToCamel(action);
    return {
      helperName: camel,
      helperCall: `${ns}.${camel}`,
      providerNs: ns,
    };
  }

  // Unknown type — use generic node() helper
  return { helperName: 'node', helperCall: 'node' };
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Resolve a node ID (e.g. "node-classify") back to its referenceId ("classify") */
function resolveNodeRef(nodeId: string, nodes: FlowDefinitionJson['nodes']): string {
  const node = nodes.find((n) => n.id === nodeId);
  if (node?.referenceId) {
    return node.referenceId;
  }
  // Strip "node-" prefix if present
  if (nodeId.startsWith('node-')) {
    return nodeId.substring(5);
  }
  return nodeId;
}

/** Serialize params object to formatted string, filtering out credentials by ID */
function serializeParams(params: Record<string, unknown>): string {
  const cleaned = { ...params };

  // Replace credential IDs with symbolic env references
  if (typeof cleaned.credentialId === 'string' && !cleaned.credentialId.startsWith('{{')) {
    cleaned.credentialId = `{{env.${toEnvName(cleaned.credentialId)}}}`;
  }

  return formatObject(cleaned, 4);
}

function toEnvName(credentialId: string): string {
  // "cred_openai_123" → "OPENAI_CREDENTIAL"
  // Strip common prefixes, uppercase, append CREDENTIAL
  const name = credentialId
    .replace(/^cred[_-]?/i, '')
    .replace(/[_-]?\d+$/g, '')
    .toUpperCase();
  return name ? `${name}_CREDENTIAL` : 'CREDENTIAL';
}

/** Format a JS value as readable code (not JSON — no quoting keys where unnecessary) */
function formatObject(value: unknown, indent: number): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    }
    const items = value.map((v) => `${' '.repeat(indent + 2)}${formatObject(v, indent + 2)}`);
    return `[\n${items.join(',\n')}\n${' '.repeat(indent)}]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return '{}';
    }

    const lines = entries.map(([key, val]) => {
      const k = isValidIdentifier(key) ? key : JSON.stringify(key);
      return `${' '.repeat(indent + 2)}${k}: ${formatObject(val, indent + 2)}`;
    });
    return `{\n${lines.join(',\n')}\n${' '.repeat(indent)}}`;
  }

  return JSON.stringify(value);
}

function isValidIdentifier(s: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
}
