/**
 * DB → SDK source emitter.
 *
 * Converts an `InvectDefinition` (the DB JSON format) into TypeScript source
 * code that uses the `@invect/primitives` SDK (`defineFlow`, `input`, `output`,
 * `code`, `ifElse`, `switchNode`). The emitted source is what flow authors
 * see when they:
 *
 *   - copy-paste nodes from the flow editor, or
 *   - hit the Deploy button (the compiled plugin output imports the SDK
 *     source file emitted here).
 *
 * Expression strings stored in the DB (`core.javascript.code`,
 * `core.if_else.expression`, `core.switch.cases[].expression`) are re-emitted
 * as TypeScript arrow functions. Upstream node referenceIds reachable via
 * incoming edges are destructured into the arrow body, mirroring what QuickJS
 * does at runtime so the expression keeps the same semantics.
 *
 * Non-primitive node types (integration providers like `gmail.send_message`)
 * cannot be expressed with the primitives SDK and cause a `SdkEmitError`.
 */
import type { InvectDefinition, FlowEdge, FlowNodeDefinitions } from '@invect/core';
import { needsAutoReturn } from '@invect/core';

export interface EmitSdkSourceOptions {
  /** Name of the exported flow constant. Defaults to `myFlow`. */
  flowName?: string;
  /** Package to import the SDK builders from. Defaults to `@invect/primitives`. */
  sdkImport?: string;
}

export interface EmitSdkSourceResult {
  /** The full TypeScript source. */
  code: string;
  /** Builders used, in the order they appear in the import. */
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

type BuilderName = 'input' | 'output' | 'code' | 'ifElse' | 'switchNode' | 'node';

// Maps DB action types to primitive SDK builders. Types that aren't listed
// fall through to the generic `node()` builder, which preserves the type +
// params verbatim so the runtime registry can still execute them.
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
};

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
  usedBuilders.add('input'); // always present, harmless if unused

  const nodeLines = def.nodes.map((node) => {
    const referenceId = node.referenceId ?? node.id;
    const builder = resolveBuilder(node);
    usedBuilders.add(builder);
    const upstream = upstreamByNode.get(node.id) ?? [];
    return emitNode(builder, referenceId, node, upstream);
  });

  const edgeLines = def.edges.map((e) => emitEdge(e, def.nodes));

  const importedBuilders: BuilderName[] = [
    'defineFlow' as BuilderName,
    ...(['input', 'output', 'code', 'ifElse', 'switchNode', 'node'] as const).filter((b) =>
      usedBuilders.has(b),
    ),
  ];

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

// ─── Internals ────────────────────────────────────────────────────────────────

function resolveBuilder(node: FlowNodeDefinitions): BuilderName {
  return TYPE_TO_BUILDER[node.type] ?? 'node';
}

function buildUpstreamMap(nodes: FlowNodeDefinitions[], edges: FlowEdge[]): Map<string, string[]> {
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
  node: FlowNodeDefinitions,
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
      // `core.output` stores the rendered value under `params.output` /
      // `params.template`; `primitives.output` stores a function as `params.outputValue`.
      // For DB-origin flows we take whatever literal is there and emit a
      // constant-returning arrow, so the user can edit it to reference upstream.
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

    case 'node': {
      const typeLit = JSON.stringify(node.type);
      const paramsLit = stringifyParams(node.params ?? {});
      return paramsLit === '{}'
        ? `node(${refLit}, ${typeLit}),`
        : `node(${refLit}, ${typeLit}, ${paramsLit}),`;
    }
  }
}

// Serialize a node's params to a JS object literal. Plain JSON for now —
// DB-origin params are already JSON-compatible.
function stringifyParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return '{}';
  }
  const lines = entries.map(
    ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')},`,
  );
  return ['{', ...lines, '}'].join('\n');
}

function emitEdge(edge: FlowEdge, nodes: FlowNodeDefinitions[]): string {
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

// Build an arrow function from a DB-stored JS expression. Upstream referenceIds
// available to the expression are destructured into scope, matching QuickJS.
// `previous_nodes` is also destructured when the expression references it, so
// indirect ancestors reachable via `previous_nodes.<ref>` resolve correctly.
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
    // One-liner path: keep it inline for readability.
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

// Output value emission. The DB stores `params.outputValue` as a JS-templated
// string — `{{ expr }}` blocks are JavaScript expressions (NOT Nunjucks), so
// we translate them into real JS rather than emitting them verbatim:
//
//   - pure `{{ expr }}`              → `(ctx) => (expr)`
//   - mixed text with embedded `{{ expr }}` blocks → template literal
//   - plain string (no templates)    → string literal
//   - non-string literal             → JSON literal
function emitValueAsArrow(raw: unknown, upstream: string[]): string {
  if (typeof raw !== 'string') {
    return `(ctx) => (${JSON.stringify(raw)})`;
  }

  const TEMPLATE_BLOCK = /\{\{([\s\S]*?)\}\}/g;
  if (!TEMPLATE_BLOCK.test(raw)) {
    return `(ctx) => (${JSON.stringify(raw)})`;
  }

  // Pure expression: entire string is one `{{ expr }}` block.
  const pure = raw.match(/^\{\{([\s\S]*?)\}\}$/);
  if (pure && !pure[1].includes('{{') && !pure[1].includes('}}')) {
    return arrowFromExpression(pure[1].trim(), upstream);
  }

  // Mixed — build a JS template literal.
  const parts: string[] = [];
  let lastIndex = 0;
  const exprBody = /\{\{([\s\S]*?)\}\}/g;
  let m: RegExpExecArray | null;
  let touchesPreviousNodes = false;
  while ((m = exprBody.exec(raw)) !== null) {
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

// Escape a raw text segment so it can sit inside a JS template literal
// (`…`) without breaking out or accidentally starting an interpolation.
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
