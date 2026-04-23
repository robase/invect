/**
 * DB → SDK source emitter (UI-side port).
 *
 * Converts an `InvectDefinition` (DB JSON) into TypeScript source using the
 * `@invect/primitives` SDK. Mirrors `pkg/primitives/src/emitter/sdk-source.ts`
 * so the flow editor can preview the emitted code without round-tripping
 * through the backend.
 */
import type { InvectDefinition, FlowEdge, FlowNode } from '@invect/core/types';

export interface EmitSdkSourceOptions {
  flowName?: string;
  sdkImport?: string;
}

export interface EmitSdkSourceResult {
  code: string;
  importedBuilders: string[];
}

export class SdkEmitError extends Error {
  constructor(
    message: string,
    public readonly nodeId?: string,
  ) {
    super(message);
    this.name = 'SdkEmitError';
  }
}

const VALID_JS_IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

type BuilderName = 'input' | 'output' | 'code' | 'ifElse' | 'switchNode' | 'agent' | 'node';

const TYPE_TO_BUILDER: Record<string, BuilderName> = {
  'core.input': 'input',
  'primitives.input': 'input',
  'core.output': 'output',
  'primitives.output': 'output',
  'core.javascript': 'code',
  'primitives.javascript': 'code',
  'core.if_else': 'ifElse',
  'primitives.if_else': 'ifElse',
  'core.switch': 'switchNode',
  'primitives.switch': 'switchNode',
  'core.agent': 'agent',
  'primitives.agent': 'agent',
};

// Params the SDK `agent()` builder recognizes directly. Extra DB-only fields
// (`provider`, `stopCondition`, `toolTimeoutMs`, etc.) are preserved verbatim
// so the emitted runtime behaves identically to the stored flow, even if the
// SDK's TS signature doesn't list them yet.
const AGENT_SDK_FIELDS = new Set([
  'credentialId',
  'model',
  'systemPrompt',
  'taskPrompt',
  'messages',
  'temperature',
  'maxTokens',
  'maxIterations',
]);

// Tool instance fields the SDK `tool()` builder recognizes. `instanceId` is
// deliberately omitted — `agent()` auto-assigns it at runtime.
const TOOL_OPTION_KEYS = ['name', 'description', 'params'] as const;

interface AddedToolLike {
  instanceId?: unknown;
  toolId?: unknown;
  name?: unknown;
  description?: unknown;
  params?: unknown;
}

export function emitSdkSource(
  def: InvectDefinition,
  options: EmitSdkSourceOptions = {},
): EmitSdkSourceResult {
  const flowName = options.flowName ?? 'myFlow';
  const sdkImport = options.sdkImport ?? '@invect/primitives';

  if (!VALID_JS_IDENT.test(flowName)) {
    throw new SdkEmitError(`flowName "${flowName}" is not a valid JS identifier`);
  }

  const upstreamByNode = buildUpstreamMap(def.nodes, def.edges);
  const usedBuilders = new Set<BuilderName>();
  usedBuilders.add('input');

  const nodeLines = def.nodes.map((node) => {
    const referenceId = node.referenceId ?? node.id;
    const builder = resolveBuilder(node);
    usedBuilders.add(builder);
    const upstream = upstreamByNode.get(node.id) ?? [];
    return emitNode(builder, referenceId, node, upstream);
  });

  const edgeLines = def.edges.map((e) => emitEdge(e, def.nodes));

  // `agent` pulls in `tool` automatically — we use `tool()` for every agent's
  // added tools so the instanceId is hidden.
  const needsTool = usedBuilders.has('agent');

  const importedBuilders: BuilderName[] = [
    'defineFlow' as BuilderName,
    ...(['input', 'output', 'code', 'ifElse', 'switchNode', 'agent', 'node'] as const).filter((b) =>
      usedBuilders.has(b),
    ),
    ...(needsTool ? (['tool'] as const) : []),
  ] as BuilderName[];

  const code = [
    `import { ${importedBuilders.join(', ')} } from ${JSON.stringify(sdkImport)};`,
    '',
    `export const ${flowName} = defineFlow({`,
    `  nodes: [`,
    ...nodeLines.map((l) => indent(l, 4)),
    `  ],`,
    `  edges: [`,
    ...edgeLines.map((l) => `    ${l},`),
    `  ],`,
    `});`,
    '',
  ].join('\n');

  return { code, importedBuilders: importedBuilders.slice(1) };
}

function resolveBuilder(node: FlowNode): BuilderName {
  return TYPE_TO_BUILDER[node.type] ?? 'node';
}

function buildUpstreamMap(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
): Map<string, string[]> {
  const refById = new Map(nodes.map((n) => [n.id, n.referenceId ?? n.id]));
  const upstream = new Map<string, string[]>();
  for (const edge of edges) {
    const sourceRef = refById.get(edge.source);
    if (!sourceRef) {
      continue;
    }
    if (!VALID_JS_IDENT.test(sourceRef)) {
      continue;
    }
    const existing = upstream.get(edge.target);
    if (existing) {
      if (!existing.includes(sourceRef)) {
        existing.push(sourceRef);
      }
    } else {
      upstream.set(edge.target, [sourceRef]);
    }
  }
  return upstream;
}

function emitNode(
  builder: BuilderName,
  referenceId: string,
  node: FlowNode,
  upstream: string[],
): string {
  const refLit = JSON.stringify(referenceId);

  switch (builder) {
    case 'input': {
      const variableName = node.params.variableName;
      const defaultValue = node.params.defaultValue;
      const parts: string[] = [];
      if (typeof variableName === 'string' && variableName !== referenceId) {
        parts.push(`variableName: ${JSON.stringify(variableName)}`);
      }
      if (defaultValue !== undefined) {
        parts.push(`defaultValue: ${JSON.stringify(defaultValue)}`);
      }
      return parts.length === 0
        ? `input(${refLit}),`
        : `input(${refLit}, { ${parts.join(', ')} }),`;
    }

    case 'output': {
      const outputName =
        typeof node.params.outputName === 'string' ? node.params.outputName : referenceId;
      const raw =
        node.params.outputValue ??
        node.params.output ??
        node.params.value ??
        node.params.template ??
        '';
      const value = emitValueAsArrow(raw, upstream);
      const nameFragment =
        outputName === referenceId ? '' : `, name: ${JSON.stringify(outputName)}`;
      return `output(${refLit}, { value: ${value}${nameFragment} }),`;
    }

    case 'code': {
      const raw = node.params.code;
      if (typeof raw !== 'string') {
        throw new SdkEmitError(
          `code node "${referenceId}" is missing params.code (expected string)`,
          node.id,
        );
      }
      const body = arrowFromExpression(raw, upstream);
      return `code(${refLit}, { code: ${body} }),`;
    }

    case 'ifElse': {
      const raw = node.params.expression;
      if (typeof raw !== 'string') {
        throw new SdkEmitError(
          `if_else node "${referenceId}" is missing params.expression (expected string)`,
          node.id,
        );
      }
      const body = arrowFromExpression(raw, upstream);
      return `ifElse(${refLit}, { condition: ${body} }),`;
    }

    case 'switchNode': {
      const raw = node.params.cases;
      const matchMode = node.params.matchMode === 'all' ? 'all' : 'first';
      if (!Array.isArray(raw)) {
        throw new SdkEmitError(
          `switch node "${referenceId}" is missing params.cases (expected array)`,
          node.id,
        );
      }
      const caseLines = raw.map((c, i) => {
        const rec = c as { slug?: unknown; label?: unknown; expression?: unknown };
        if (typeof rec.slug !== 'string' || typeof rec.label !== 'string') {
          throw new SdkEmitError(
            `switch node "${referenceId}": case[${i}] must have string slug and label`,
            node.id,
          );
        }
        if (typeof rec.expression !== 'string') {
          throw new SdkEmitError(
            `switch node "${referenceId}": case[${i}] is missing expression`,
            node.id,
          );
        }
        const condition = arrowFromExpression(rec.expression, upstream);
        return `  { slug: ${JSON.stringify(rec.slug)}, label: ${JSON.stringify(rec.label)}, condition: ${condition} },`;
      });
      const lines = [
        `switchNode(${refLit}, {`,
        `  matchMode: ${JSON.stringify(matchMode)},`,
        `  cases: [`,
        ...caseLines.map((l) => `    ${l}`),
        `  ],`,
        `}),`,
      ];
      return lines.join('\n');
    }

    case 'agent': {
      return emitAgent(refLit, node);
    }

    case 'node': {
      const typeLit = JSON.stringify(node.type);
      const paramsLit = stringifyParams(node.params ?? {});
      return paramsLit === '{}'
        ? `node(${refLit}, ${typeLit}),`
        : `node(${refLit}, ${typeLit}, ${paramsLit}),`;
    }
  }
}

function emitAgent(refLit: string, node: FlowNode): string {
  const params = (node.params ?? {}) as Record<string, unknown>;
  const addedTools = Array.isArray(params.addedTools) ? (params.addedTools as AddedToolLike[]) : [];

  const lines: string[] = [];
  lines.push(`agent(${refLit}, {`);

  const emitField = (key: string, value: unknown) => {
    lines.push(`  ${key}: ${toTsLiteral(value).replace(/\n/g, '\n  ')},`);
  };

  // Emit SDK-first fields in a consistent order, then any other DB-only fields.
  const orderedSdkKeys = [
    'credentialId',
    'model',
    'systemPrompt',
    'taskPrompt',
    'messages',
    'temperature',
    'maxTokens',
    'maxIterations',
  ] as const;
  for (const key of orderedSdkKeys) {
    if (params[key] !== undefined) {
      emitField(key, params[key]);
    }
  }

  // Preserve DB-only fields (stopCondition, provider, toolTimeoutMs, etc.) so
  // the emitted flow executes identically. Skip `addedTools` — we emit that
  // explicitly as `tools: [...]` below.
  for (const [key, value] of Object.entries(params)) {
    if (AGENT_SDK_FIELDS.has(key)) {
      continue;
    }
    if (key === 'addedTools') {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    emitField(key, value);
  }

  if (addedTools.length > 0) {
    lines.push(`  tools: [`);
    for (const t of addedTools) {
      lines.push(`    ${emitToolCall(t)},`);
    }
    lines.push(`  ],`);
  }

  lines.push(`}),`);
  return lines.join('\n');
}

function emitToolCall(t: AddedToolLike): string {
  const toolId = typeof t.toolId === 'string' ? t.toolId : '';
  const name = typeof t.name === 'string' ? t.name : '';
  const description = typeof t.description === 'string' ? t.description : '';
  const rawParams = (t.params && typeof t.params === 'object' ? t.params : {}) as Record<
    string,
    unknown
  >;

  // Drop UI-only `_aiChosenModes` bookkeeping — it's not part of the runtime
  // tool params and shouldn't leak into user-facing source.
  const { _aiChosenModes: _drop, ...cleanParams } = rawParams as {
    _aiChosenModes?: unknown;
  } & Record<string, unknown>;

  const options: Record<string, unknown> = {};
  // Only include `name` when it meaningfully differs from the toolId.
  if (name && name !== toolId) {
    options.name = name;
  }
  if (description.length > 0) {
    options.description = description;
  }
  if (Object.keys(cleanParams).length > 0) {
    options.params = cleanParams;
  }

  const idLit = JSON.stringify(toolId);
  if (TOOL_OPTION_KEYS.every((k) => options[k] === undefined)) {
    return `tool(${idLit})`;
  }
  const optionsLit = toTsLiteral(options).replace(/\n/g, '\n    ');
  return `tool(${idLit}, ${optionsLit})`;
}

function stringifyParams(params: Record<string, unknown>): string {
  if (Object.keys(params).length === 0) {
    return '{}';
  }
  return toTsLiteral(params);
}

/**
 * Serialize a value as a TypeScript object/array literal. Matches
 * `JSON.stringify(v, null, 2)` semantics except object keys that are valid JS
 * identifiers are emitted unquoted, and all items get a trailing comma.
 */
function toTsLiteral(value: unknown, depth = 0): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const childPad = '  '.repeat(depth + 1);
    const closePad = '  '.repeat(depth);
    const items = value.map((v) => `${childPad}${toTsLiteral(v, depth + 1)},`);
    return `[\n${items.join('\n')}\n${closePad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return '{}';
    }
    const childPad = '  '.repeat(depth + 1);
    const closePad = '  '.repeat(depth);
    const items = entries.map(([k, v]) => {
      const keyStr = VALID_JS_IDENT.test(k) ? k : JSON.stringify(k);
      return `${childPad}${keyStr}: ${toTsLiteral(v, depth + 1)},`;
    });
    return `{\n${items.join('\n')}\n${closePad}}`;
  }
  return JSON.stringify(value);
}

function emitEdge(edge: FlowEdge, nodes: readonly FlowNode[]): string {
  const refById = new Map(nodes.map((n) => [n.id, n.referenceId ?? n.id]));
  const sourceRef = refById.get(edge.source);
  const targetRef = refById.get(edge.target);
  if (!sourceRef || !targetRef) {
    throw new SdkEmitError(
      `edge "${edge.id}" references unknown node (source="${edge.source}", target="${edge.target}")`,
    );
  }
  if (edge.sourceHandle) {
    return `{ from: ${JSON.stringify(sourceRef)}, to: ${JSON.stringify(targetRef)}, handle: ${JSON.stringify(edge.sourceHandle)} }`;
  }
  return `{ from: ${JSON.stringify(sourceRef)}, to: ${JSON.stringify(targetRef)} }`;
}

// Build an arrow function from a DB-stored JS expression. Direct-parent refs
// are destructured from `ctx`; `previous_nodes` is added when the expression
// references it so indirect-ancestor access resolves instead of throwing.
function arrowFromExpression(expression: string, upstream: string[]): string {
  const body = needsAutoReturn(expression) ? `return (${expression});` : expression;
  return arrowFromBody(body, upstream, /\bprevious_nodes\b/.test(expression));
}

function arrowFromBody(body: string, upstream: string[], includePreviousNodes: boolean): string {
  const names = [...upstream];
  if (includePreviousNodes && !names.includes('previous_nodes')) {
    names.push('previous_nodes');
  }
  const destructure = names.length > 0 ? `const { ${names.join(', ')} } = ctx;` : '';
  if (!destructure && !body.includes('\n')) {
    return `(ctx) => { ${body} }`;
  }
  const lines: string[] = ['(ctx) => {'];
  if (destructure) {
    lines.push(`  ${destructure}`);
  }
  for (const l of body.split('\n')) {
    lines.push(`  ${l}`);
  }
  lines.push('}');
  return lines.join('\n');
}

// Output-value emission. core.output stores `params.outputValue` as a
// JS-templated string (`{{ expr }}` blocks are JavaScript, NOT Nunjucks).
// Translate it into real JS so the emitted file parses.
//
//   pure `{{ expr }}`           → `(ctx) => expr`
//   mixed text + `{{ expr }}`   → template literal
//   plain string / non-string   → JSON literal
function emitValueAsArrow(raw: unknown, upstream: string[]): string {
  if (typeof raw !== 'string') {
    return `(ctx) => (${JSON.stringify(raw)})`;
  }

  if (!/\{\{[\s\S]*?\}\}/.test(raw)) {
    return `(ctx) => (${JSON.stringify(raw)})`;
  }

  const pure = raw.match(/^\{\{([\s\S]*?)\}\}$/);
  if (pure && !pure[1].includes('{{') && !pure[1].includes('}}')) {
    return arrowFromExpression(pure[1].trim(), upstream);
  }

  const parts: string[] = [];
  let lastIndex = 0;
  const re = /\{\{([\s\S]*?)\}\}/g;
  let m: RegExpExecArray | null;
  let touchesPreviousNodes = false;
  while ((m = re.exec(raw)) !== null) {
    parts.push(escapeTemplateLiteralText(raw.slice(lastIndex, m.index)));
    const inner = m[1].trim();
    if (/\bprevious_nodes\b/.test(inner)) {
      touchesPreviousNodes = true;
    }
    parts.push('${(' + inner + ')}');
    lastIndex = m.index + m[0].length;
  }
  parts.push(escapeTemplateLiteralText(raw.slice(lastIndex)));

  const templateLiteral = '`' + parts.join('') + '`';
  return arrowFromBody(`return (${templateLiteral});`, upstream, touchesPreviousNodes);
}

function escapeTemplateLiteralText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function indent(block: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return block
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
}

// Matches `needsAutoReturn` from @invect/core (pure string scan, no Node deps).
function needsAutoReturn(code: string): boolean {
  let stripped = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }
    if (code[i] === "'" || code[i] === '"' || code[i] === '`') {
      const quote = code[i];
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') {
          i++;
        }
        i++;
      }
      i++;
      continue;
    }
    stripped += code[i];
    i++;
  }
  return !/\breturn\b/.test(stripped);
}
