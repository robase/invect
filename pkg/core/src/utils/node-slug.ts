import { GraphNodeType } from 'src/types-fresh';

/**
 * Generate a stable slug for a node label. Falls back to node ID if label missing.
 */
export function generateNodeSlug(label: string | undefined | null, fallbackId: string): string {
  const base = label && label.trim().length > 0 ? label : fallbackId;

  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (slug.length === 0) {
    return `node_${fallbackId}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  return slug;
}

export type NodeSlugMetadata = {
  slug: string;
  label: string;
  nodeId: string;
  nodeType: GraphNodeType;
};
