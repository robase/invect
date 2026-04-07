import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@xyflow/react';
import type { NodeDefinition } from '../../../types/node-definition.types';
import { useResolveNodeDefinition } from '../../../api/node-data.api';

interface UseNodeConfigStateOptions {
  node: Node<Record<string, unknown>> | null;
  nodeType: string;
  definition?: NodeDefinition;
  /** Callback to persist params back to Zustand. Required for backend resolution writes. */
  onParamsChange?: (nodeId: string, params: Record<string, unknown>) => void;
}

interface UseNodeConfigStateResult {
  definition?: NodeDefinition;
  values: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  updateField: (fieldName: string, value: unknown) => void;
  isUpdating: boolean;
}

function buildDefaultParams(definition?: NodeDefinition): Record<string, unknown> {
  if (!definition?.paramFields?.length) {
    return {};
  }

  return definition.paramFields.reduce<Record<string, unknown>>((acc, field) => {
    if (field.defaultValue !== undefined) {
      acc[field.name] = field.defaultValue;
    }
    return acc;
  }, {});
}

/**
 * Hook for node configuration state — reads params from the node (Zustand)
 * and provides validation, backend config resolution, and field update.
 *
 * After Phase 1.3 refactor: `values` is derived from node.data.params (Zustand),
 * NOT stored locally. This eliminates the dual-source-of-truth problem.
 */
export function useNodeConfigState({
  node,
  nodeType,
  definition,
  onParamsChange,
}: UseNodeConfigStateOptions): UseNodeConfigStateResult {
  const nodeDefinitionResolver = useResolveNodeDefinition();
  const nodeId = node?.id ?? null;

  const [activeDefinition, setActiveDefinition] = useState<NodeDefinition | undefined>(definition);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const lastRequestIdRef = useRef(0);
  const resolveDefinitionRef = useRef<
    (params: Record<string, unknown>, change?: { field: string; value: unknown }) => void
  >(() => {
    // noop placeholder until ready
  });

  // Read params directly from the node (Zustand is the single source of truth)
  const nodeParams = node?.data?.params as Record<string, unknown> | undefined;
  const defaults = useMemo(() => buildDefaultParams(definition), [definition]);
  const values = useMemo(() => ({ ...defaults, ...nodeParams }), [defaults, nodeParams]);

  const hasNode = Boolean(node);

  // Stable ref for onParamsChange to avoid re-creating resolveDefinition
  const onParamsChangeRef = useRef(onParamsChange);
  onParamsChangeRef.current = onParamsChange;

  const resolveDefinition = useCallback(
    (params: Record<string, unknown>, change?: { field: string; value: unknown }) => {
      const requestId = ++lastRequestIdRef.current;

      nodeDefinitionResolver.mutate(
        {
          nodeType,
          nodeId,
          params,
          changeField: change?.field,
          changeValue: change?.value,
        },
        {
          onSuccess: (response) => {
            if (requestId !== lastRequestIdRef.current) {
              return;
            }

            setActiveDefinition(response.definition ?? definition);
            setWarnings(response.warnings ?? []);
            setErrors(response.errors ?? []);

            // Write resolved params back to Zustand (e.g. provider detection sets model list)
            if (response.params && nodeId && onParamsChangeRef.current) {
              onParamsChangeRef.current(nodeId, response.params);
            }
          },
          onError: (error) => {
            if (requestId !== lastRequestIdRef.current) {
              return;
            }

            setErrors([
              error instanceof Error ? error.message : 'Failed to resolve node definition',
            ]);
          },
        },
      );
    },
    [nodeDefinitionResolver, nodeType, nodeId, definition],
  );

  useEffect(() => {
    resolveDefinitionRef.current = resolveDefinition;
  }, [resolveDefinition]);

  useEffect(() => {
    setActiveDefinition(definition);
  }, [definition]);

  // Reset transient state when node changes; trigger initial backend resolution if needed
  const nodeParamsSignature = useMemo(() => JSON.stringify(nodeParams ?? {}), [nodeParams]);
  useEffect(() => {
    if (!hasNode) {
      setWarnings([]);
      setErrors([]);
      lastRequestIdRef.current = 0;
      return;
    }

    setWarnings([]);
    setErrors([]);

    // Call the backend config resolution when the node has a credential
    // that needs provider detection (e.g. model selection, batch processing toggle).
    const credentialId =
      typeof values.credentialId === 'string' && values.credentialId
        ? values.credentialId
        : undefined;
    if (credentialId) {
      resolveDefinitionRef.current(values, { field: 'credentialId', value: credentialId });
    }
  }, [hasNode, nodeId, nodeParamsSignature, nodeType]);

  // Fields that should trigger a backend config update when changed
  const FIELDS_REQUIRING_CONFIG_UPDATE = new Set(['credentialId', 'provider']);

  const updateField = useCallback(
    (fieldName: string, value: unknown) => {
      // Compute next params from current values
      const next = { ...values, [fieldName]: value };

      // Only call the backend config update for fields that need dynamic resolution
      if (FIELDS_REQUIRING_CONFIG_UPDATE.has(fieldName)) {
        resolveDefinitionRef.current(next, { field: fieldName, value });
      }
    },
    [values],
  );

  return {
    definition: activeDefinition,
    values,
    warnings,
    errors,
    updateField,
    isUpdating: nodeDefinitionResolver.isPending,
  };
}
