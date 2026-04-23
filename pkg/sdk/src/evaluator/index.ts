/**
 * Flow-source evaluator.
 *
 * Takes TypeScript source text and returns a `DefinedFlow`. Uses jiti for
 * TS transpilation + ES module loading. Enforces an import allowlist via
 * static pre-scan so malicious / careless source can't reach Node builtins.
 *
 * Subpath-exported at `@invect/sdk/evaluator` — the main `@invect/sdk` entry
 * stays browser-safe.
 *
 * Intended callers:
 *   - Chat-save endpoint evaluates LLM-generated source here, then hands the
 *     result to `transformArrowsToStrings` + `mergeParsedIntoDefinition`.
 *   - Sync plugin pull path uses this when the embedded JSON footer is stale
 *     or absent.
 *
 * Typical pipeline:
 *   ```ts
 *   const { flow, ok, errors } = await evaluateSdkSource(src);
 *   if (!ok) return { errors };
 *   const { nodes, ok: tOk, diagnostics } = transformArrowsToStrings(flow.nodes);
 *   if (!tOk) return { errors: diagnostics };
 *   const saved = mergeParsedIntoDefinition({ nodes, edges: flow.edges, metadata: flow.metadata }, priorDef);
 *   ```
 */

import type { ResolvedEdge, SdkFlowNode } from '../types';
import type { EvaluatedFlow, EvaluatorError, EvaluatorOptions, EvaluatorResult } from './types';
import { scanImports } from './import-scan';

export type {
  EvaluatorOptions,
  EvaluatorResult,
  EvaluatorError,
  EvaluatorErrorCode,
  EvaluatedFlow,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Evaluate a TypeScript flow source string. Returns either the evaluated
 * flow (nodes + edges + metadata) or a list of errors.
 *
 * Security posture:
 *   - Static import scan rejects anything outside the allowlist before eval.
 *   - Dynamic `import()` and `require()` are flagged by the scan.
 *   - Timeout prevents hung evaluations (doesn't catch synchronous infinite
 *     loops — Worker isolation is a future enhancement).
 *
 * @see scanImports for the allowlist details.
 */
export async function evaluateSdkSource(
  source: string,
  options: EvaluatorOptions = {},
): Promise<EvaluatorResult> {
  const errors: EvaluatorError[] = [];

  const additionalAllowed = options.additionalAllowedImports ?? [];

  // 1. Static pre-scan.
  const scan = scanImports(source, additionalAllowed);
  errors.push(...scan.errors);
  if (errors.length > 0) {
    return { flow: null, errors, ok: false };
  }

  // 2. Evaluate via jiti. Use a cached instance keyed on the SDK specifier +
  //    additional modules so repeated evaluations don't repeatedly pay for
  //    TS transpiler initialisation.
  let evaluated: unknown;
  try {
    evaluated = await evaluateViaJiti(source, options);
  } catch (err) {
    if (err instanceof EvalTimeoutError) {
      errors.push({
        code: 'timeout',
        message: `evaluation exceeded timeout of ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
      });
    } else {
      errors.push({
        code: 'eval-failed',
        message: `evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return { flow: null, errors, ok: false };
  }

  // 3. Find the flow — prefer `export default`, fall back to the unique
  //    named export whose value looks like a flow (the emitter uses
  //    `export const myFlow = defineFlow({...})`, not default).
  const defaultExport = resolveDefaultExport(evaluated);
  const defaultFlow = defaultExport !== undefined ? coerceToEvaluatedFlow(defaultExport) : null;
  if (defaultFlow) {
    return { flow: defaultFlow, errors: [], ok: true };
  }

  // Walk named exports looking for a flow-shaped value.
  const namedFlows = findNamedFlows(evaluated);
  if (namedFlows.length === 1) {
    return { flow: namedFlows[0], errors: [], ok: true };
  }
  if (namedFlows.length > 1) {
    return {
      flow: null,
      errors: [
        {
          code: 'default-export-not-a-flow',
          message: `multiple named exports look like flows — use \`export default\` to disambiguate (found: ${namedFlows.length})`,
        },
      ],
      ok: false,
    };
  }

  // Neither default nor named flow found.
  if (defaultExport !== undefined) {
    return {
      flow: null,
      errors: [
        {
          code: 'default-export-not-a-flow',
          message: 'default export is not a flow definition — expected defineFlow({...}) output',
        },
      ],
      ok: false,
    };
  }

  return {
    flow: null,
    errors: [
      {
        code: 'no-default-export',
        message:
          'flow source must export a flow — `export default defineFlow({...})` or `export const myFlow = defineFlow({...})`',
      },
    ],
    ok: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Internals
// ═══════════════════════════════════════════════════════════════════════════

class EvalTimeoutError extends Error {
  constructor() {
    super('evaluation timed out');
    this.name = 'EvalTimeoutError';
  }
}

async function evaluateViaJiti(source: string, options: EvaluatorOptions): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Build a path alias map so the evaluated source's `import '@invect/sdk'`
  // resolves to the known location regardless of where the temp file lives.
  // Without this, Node's module resolution walks up from the temp file's
  // directory — which is typically in `os.tmpdir()` and has no access to the
  // caller's node_modules tree.
  const alias = buildPackageAliases(options);

  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, {
    interopDefault: false,
    moduleCache: false,
    alias,
  });

  // jiti doesn't take raw source — we materialise to a temp file and import
  // it. Node-only, local to the evaluator process, never served to users.
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'invect-eval-'));
  const tmpFile = path.join(tmpDir, 'flow.ts');
  await fs.writeFile(tmpFile, source, 'utf-8');

  try {
    return await withTimeout(jiti.import(tmpFile), timeoutMs);
  } finally {
    // Best-effort cleanup; failures here shouldn't mask the eval result.
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Build a jiti alias map that routes every allowed package specifier to the
 * package location resolvable from the evaluator's own module context. Uses
 * the `require.resolve` of the package's `package.json` to pin down the
 * package root, then maps the bare specifier to that root.
 */
function buildPackageAliases(options: EvaluatorOptions): Record<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRequire } = require('node:module') as typeof import('node:module');
  const req = createRequire(import.meta.url);
  const aliases: Record<string, string> = {};

  const tryResolvePackageRoot = (specifier: string): string | null => {
    try {
      const pkgJsonPath = req.resolve(`${specifier}/package.json`);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path') as typeof import('node:path');
      return path.dirname(pkgJsonPath);
    } catch {
      return null;
    }
  };

  // Core SDK root.
  const sdkSpecifier = options.sdkImportSpecifier ?? '@invect/sdk';
  const sdkRoot = tryResolvePackageRoot(sdkSpecifier);
  if (sdkRoot) {
    aliases[sdkSpecifier] = sdkRoot;
  }

  // action-kit
  const kitRoot = tryResolvePackageRoot('@invect/action-kit');
  if (kitRoot) {
    aliases['@invect/action-kit'] = kitRoot;
  }

  // actions — the bare specifier + every subpath we can discover. jiti's
  // alias map is exact-match, so we have to enumerate. This list covers the
  // built-in providers; callers can extend via `additionalAllowedImports`
  // and register virtual modules for anything else.
  const actionsRoot = tryResolvePackageRoot('@invect/actions');
  if (actionsRoot) {
    aliases['@invect/actions'] = actionsRoot;
    // Subpaths are handled via the package's own `exports` field once the
    // bare specifier resolves — jiti's alias only needs the package root.
  }

  return aliases;
}

function resolveDefaultExport(mod: unknown): unknown {
  if (mod === undefined || mod === null) {
    return undefined;
  }
  if (typeof mod !== 'object') {
    return mod;
  }
  const m = mod as Record<string, unknown>;
  if ('default' in m) {
    return m.default;
  }
  // Some loaders double-wrap: `{ default: { default: realExport } }`.
  return undefined;
}

/**
 * Walk every non-`default` key on the evaluated module and return the values
 * that look like flow definitions. The emitter produces named exports like
 * `export const myFlow = defineFlow({...})` — this lets the evaluator accept
 * them without forcing `export default`.
 */
function findNamedFlows(mod: unknown): EvaluatedFlow[] {
  if (!mod || typeof mod !== 'object') {
    return [];
  }
  const flows: EvaluatedFlow[] = [];
  for (const [key, value] of Object.entries(mod as Record<string, unknown>)) {
    if (key === 'default') {
      continue;
    }
    const flow = coerceToEvaluatedFlow(value);
    if (flow) {
      flows.push(flow);
    }
  }
  return flows;
}

function coerceToEvaluatedFlow(value: unknown): EvaluatedFlow | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) {
    return null;
  }

  // `defineFlow` returns `DefinedFlow` — structurally compatible with
  // `EvaluatedFlow` already. Narrow the casts here to validate shape.
  const nodes = v.nodes.map((n) => n as SdkFlowNode);
  const edges = v.edges.map((e) => e as ResolvedEdge);
  const metadata =
    typeof v.name === 'string' || typeof v.description === 'string' || Array.isArray(v.tags)
      ? {
          ...(typeof v.name === 'string' ? { name: v.name } : {}),
          ...(typeof v.description === 'string' ? { description: v.description } : {}),
          ...(Array.isArray(v.tags) ? { tags: v.tags as string[] } : {}),
        }
      : undefined;
  return metadata ? { nodes, edges, metadata } : { nodes, edges };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new EvalTimeoutError()), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
