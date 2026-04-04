import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@xyflow/react';
import type { NodeDefinition } from '../../../types/node-definition.types';
import { useResolveNodeDefinition } from '../../../api/node-data.api';

interface UseNodeConfigStateOptions {
  node: Node<Record<string, unknown>> | null;
  nodeType: string;
  definition?: NodeDefinition;
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

export function useNodeConfigState({
  node,
  nodeType,
  definition,
}: UseNodeConfigStateOptions): UseNodeConfigStateResult {
  const nodeDefinitionResolver = useResolveNodeDefinition();
  const nodeId = node?.id ?? null;

  const [activeDefinition, setActiveDefinition] = useState<NodeDefinition | undefined>(definition);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const lastRequestIdRef = useRef(0);
  const resolveDefinitionRef = useRef<
    (params: Record<string, unknown>, change?: { field: string; value: unknown }) => void
  >(() => {
    // noop placeholder until ready
  });
  const nodeParams = node?.data?.params as Record<string, unknown> | undefined;
  const nodeParamsSignature = useMemo(() => JSON.stringify(nodeParams ?? {}), [nodeParams]);
  const hasNode = Boolean(node);

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
            setValues(response.params ?? params);
            setWarnings(response.warnings ?? []);
            setErrors(response.errors ?? []);
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

  useEffect(() => {
    if (!hasNode) {
      setValues({});
      setWarnings([]);
      setErrors([]);
      lastRequestIdRef.current = 0;
      return;
    }

    const defaults = buildDefaultParams(definition);
    const params = { ...defaults, ...nodeParams };

    setValues(params);
    setWarnings([]);
    setErrors([]);

    // Call the backend config resolution when the node has a credential
    // that needs provider detection (e.g. model selection, batch processing toggle).
    // This works for both legacy enum-based types and action-based nodes with onConfigUpdate.
    const credentialId =
      typeof params.credentialId === 'string' && params.credentialId
        ? params.credentialId
        : undefined;
    if (credentialId) {
      resolveDefinitionRef.current(params, { field: 'credentialId', value: credentialId });
    }
  }, [hasNode, nodeId, nodeParamsSignature, nodeType]);

  // Fields that should trigger a backend config update when changed
  // Other fields (like prompt, temperature) don't need to call the API
  const FIELDS_REQUIRING_CONFIG_UPDATE = new Set(['credentialId', 'provider']);

  const updateField = useCallback((fieldName: string, value: unknown) => {
    setValues((previous) => {
      if (previous[fieldName] === value) {
        return previous;
      }

      const next = {
        ...previous,
        [fieldName]: value,
      };

      // Only call the backend config update for fields that need dynamic resolution
      // (e.g., credentialId changes need to fetch new model list and toggle batch processing)
      if (FIELDS_REQUIRING_CONFIG_UPDATE.has(fieldName)) {
        resolveDefinitionRef.current(next, { field: fieldName, value });
      }
      return next;
    });
  }, []);

  return {
    definition: activeDefinition,
    values,
    warnings,
    errors,
    updateField,
    isUpdating: nodeDefinitionResolver.isPending,
  };
}
