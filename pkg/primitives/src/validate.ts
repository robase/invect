import type { PrimitiveFlowDefinition } from './types';

const RESERVED_KEYS = new Set(['previous_nodes']);

export class FlowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowValidationError';
  }
}

export function validateFlow(def: PrimitiveFlowDefinition): void {
  const seen = new Set<string>();

  for (const node of def.nodes) {
    const ref = node.referenceId;

    if (!ref || typeof ref !== 'string') {
      throw new FlowValidationError(`Each node must have a non-empty string referenceId`);
    }

    if (RESERVED_KEYS.has(ref)) {
      throw new FlowValidationError(
        `"${ref}" is a reserved key and cannot be used as a referenceId`,
      );
    }

    // Colons are used to build step names for mapper iterations — disallow in referenceIds
    if (ref.includes(':')) {
      throw new FlowValidationError(
        `referenceId "${ref}" must not contain a colon (:) — colons are reserved for internal step naming`,
      );
    }

    if (seen.has(ref)) {
      throw new FlowValidationError(`Duplicate referenceId: "${ref}"`);
    }
    seen.add(ref);
  }

  // Validate edge references
  for (const edge of def.edges) {
    const [source, target] = edge;
    if (!seen.has(source)) {
      throw new FlowValidationError(`Edge references unknown source node: "${source}"`);
    }
    if (!seen.has(target)) {
      throw new FlowValidationError(`Edge references unknown target node: "${target}"`);
    }
  }
}
