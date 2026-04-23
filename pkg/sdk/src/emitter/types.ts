/**
 * Emitter input/output types.
 *
 * The emitter operates on a `DbFlowDefinition` — a structural shape that the
 * concrete `InvectDefinition` from `@invect/core` satisfies. Keeping the input
 * loose means the emitter package has no hard dep on core.
 */

export interface DbFlowNode {
  id: string;
  type: string;
  referenceId?: string;
  label?: string;
  position?: { x: number; y: number };
  params: Record<string, unknown>;
  mapper?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DbFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  [key: string]: unknown;
}

export interface DbFlowMetadata {
  name?: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface DbFlowDefinition {
  nodes: DbFlowNode[];
  edges: DbFlowEdge[];
  metadata?: DbFlowMetadata;
}

export interface EmitOptions {
  /** Name of the exported flow constant. Defaults to `myFlow`. */
  flowName?: string;
  /** Package to import the SDK from. Defaults to `@invect/sdk`. */
  sdkImport?: string;
  /** Base import root for action catalogue packages. Defaults to `@invect/actions`. */
  actionsImportRoot?: string;
  /**
   * Append a `/* @invect-definition {...} *\/` JSON footer carrying the full
   * DB-shape definition. The sync plugin uses this for authoritative round-trip
   * without needing to re-evaluate the TS.
   */
  includeJsonFooter?: boolean;
  /** Override metadata — takes precedence over `def.metadata`. */
  metadata?: DbFlowMetadata;
}

export interface EmitResult {
  /** The full TypeScript source, imports + defineFlow call + optional footer. */
  code: string;
  /** SDK helpers imported from `@invect/sdk` (e.g. `input`, `code`, `agent`). */
  sdkImports: string[];
  /** Action-catalogue imports, keyed by module path. */
  actionImports: Record<string, string[]>;
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
