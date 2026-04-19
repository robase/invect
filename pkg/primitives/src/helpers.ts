import type {
  PrimitiveNode,
  PrimitiveEdge,
  PrimitiveFlowDefinition,
  NodeContext,
  ParamValue,
} from './types';
import { validateFlow } from './validate';

// ─── defineFlow ───────────────────────────────────────────────────────────────

export function defineFlow(def: PrimitiveFlowDefinition): PrimitiveFlowDefinition {
  validateFlow(def);
  return def;
}

// ─── Node builders ────────────────────────────────────────────────────────────

export function input(
  referenceId: string,
  params?: {
    variableName?: string;
    defaultValue?: ParamValue<unknown>;
  },
): PrimitiveNode {
  return {
    referenceId,
    type: 'core.input',
    params: {
      variableName: params?.variableName ?? referenceId,
      ...(params?.defaultValue !== undefined ? { defaultValue: params.defaultValue } : {}),
    },
  };
}

export function output(
  referenceId: string,
  params: {
    value: ParamValue<unknown>;
    name?: string;
  },
): PrimitiveNode {
  return {
    referenceId,
    type: 'primitives.output',
    params: {
      outputValue: params.value,
      outputName: params.name ?? referenceId,
    },
  };
}

export function model(
  referenceId: string,
  params: {
    credentialId: ParamValue<string>;
    model: ParamValue<string>;
    prompt: ParamValue<string>;
    systemPrompt?: ParamValue<string>;
    provider?: ParamValue<string>;
    temperature?: ParamValue<number>;
    maxTokens?: ParamValue<number>;
    outputJsonSchema?: ParamValue<string>;
    useBatchProcessing?: boolean;
  },
): PrimitiveNode {
  return {
    referenceId,
    type: 'core.model',
    params: params as Record<string, ParamValue<unknown>>,
  };
}

export function ifElse(
  referenceId: string,
  params: {
    condition: (ctx: NodeContext) => boolean | Promise<boolean>;
    mapper?: (ctx: NodeContext) => NodeContext | Promise<NodeContext>;
  },
): PrimitiveNode {
  const { mapper, ...rest } = params;
  return {
    referenceId,
    type: 'primitives.if_else',
    params: { condition: rest.condition as ParamValue<unknown> },
    ...(mapper ? { mapper } : {}),
  };
}

export function switchNode(
  referenceId: string,
  params: {
    cases: Array<{
      slug: string;
      label: string;
      condition: (ctx: NodeContext) => boolean | Promise<boolean>;
    }>;
    matchMode?: 'first' | 'all';
    mapper?: (ctx: NodeContext) => NodeContext | Promise<NodeContext>;
  },
): PrimitiveNode {
  const { mapper, ...rest } = params;
  return {
    referenceId,
    type: 'primitives.switch',
    params: {
      cases: rest.cases as ParamValue<unknown>,
      matchMode: rest.matchMode ?? 'first',
    },
    ...(mapper ? { mapper } : {}),
  };
}

export function agent(
  referenceId: string,
  params: {
    credentialId: ParamValue<string>;
    model: ParamValue<string>;
    systemPrompt?: ParamValue<string>;
    messages?: ParamValue<unknown>;
    tools?: ParamValue<unknown>;
    temperature?: ParamValue<number>;
    maxTokens?: ParamValue<number>;
    maxIterations?: ParamValue<number>;
    mapper?: (ctx: NodeContext) => NodeContext | Promise<NodeContext>;
  },
): PrimitiveNode {
  const { mapper, ...rest } = params;
  return {
    referenceId,
    type: 'core.agent',
    params: rest as Record<string, ParamValue<unknown>>,
    ...(mapper ? { mapper } : {}),
  };
}

export function code(
  referenceId: string,
  params: {
    code: (ctx: NodeContext) => unknown | Promise<unknown>;
    mapper?: (ctx: NodeContext) => NodeContext | Promise<NodeContext>;
  },
): PrimitiveNode {
  const { mapper, ...rest } = params;
  return {
    referenceId,
    type: 'primitives.javascript',
    // The executor resolves callable params — so `result` is the resolved return value of code(ctx)
    params: { result: rest.code as ParamValue<unknown> },
    ...(mapper ? { mapper } : {}),
  };
}

// ─── Edge helpers ─────────────────────────────────────────────────────────────

export function edge(source: string, target: string, sourceHandle?: string): PrimitiveEdge {
  return sourceHandle ? [source, target, sourceHandle] : [source, target];
}
