/**
 * Generic node escape hatch.
 *
 * Use this when you need to reference an action type by its string id without
 * importing the action callable — e.g. when pasting LLM output that references
 * a plugin-provided action the current project hasn't imported yet. Always
 * prefer importing the real action callable when available; `node()` loses the
 * Zod-inferred param types.
 */

import type { NodeOptions, SdkFlowNode } from '@invect/action-kit';

export function node<TParams extends Record<string, unknown>>(
  referenceId: string,
  type: string,
  params: TParams = {} as TParams,
  options?: NodeOptions,
): SdkFlowNode {
  const n: SdkFlowNode = {
    referenceId,
    type,
    params: params as Record<string, unknown>,
  };
  if (options?.label !== undefined) {n.label = options.label;}
  if (options?.position !== undefined) {n.position = options.position;}
  if (options?.id !== undefined) {n.id = options.id;}
  if (options?.mapper !== undefined) {
    n.mapper = {
      enabled: options.mapper.enabled ?? true,
      expression: options.mapper.expression,
      mode: options.mapper.mode ?? 'auto',
      outputMode: options.mapper.outputMode ?? 'array',
      ...(options.mapper.keyField !== undefined ? { keyField: options.mapper.keyField } : {}),
      concurrency: options.mapper.concurrency ?? 1,
      onEmpty: options.mapper.onEmpty ?? 'skip',
    };
  }
  return n;
}
