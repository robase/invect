import * as Icons from 'lucide-react';

export const getIconComponent = (iconName?: string) => {
  if (!iconName) {
    return Icons.Zap;
  }
  // @ts-ignore - Dynamic lookup of Lucide icons by name
  return Icons[iconName] || Icons.Zap;
};

export const formatNodeTypeLabel = (value: string) => {
  // For action-based types like "gmail.list_messages", show just the action part
  const actionPart = value.includes('.') ? (value.split('.').pop() ?? value) : value;
  return actionPart.toLowerCase().replace(/_/g, ' ');
};

export const stringifyJson = (value: unknown) => {
  try {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
};

export const parseJson = (
  raw: string,
  setError: (value: string | null) => void,
): Record<string, unknown> | null => {
  if (!raw.trim()) {
    setError(null);
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    setError(null);
    return parsed;
  } catch {
    setError('Invalid JSON');
    return null;
  }
};

/**
 * Extract the primary output value from the structured node output format.
 * Handles the `{ data: { variables: { output: { value } } } }` wrapper.
 */
export function extractOutputValue(nodeOutput: unknown): unknown {
  if (!nodeOutput || typeof nodeOutput !== 'object') {
    return null;
  }

  const typedOutput = nodeOutput as { data?: { variables?: Record<string, { value: unknown }> } };

  if (typedOutput.data?.variables?.output) {
    const outputVar = typedOutput.data.variables.output;
    return outputVar && typeof outputVar === 'object' && 'value' in outputVar
      ? outputVar.value
      : outputVar;
  }

  if (typedOutput.data?.variables) {
    const firstVar = Object.values(typedOutput.data.variables)[0];
    return firstVar && typeof firstVar === 'object' && 'value' in firstVar
      ? firstVar.value
      : firstVar;
  }

  return null;
}
