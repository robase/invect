/**
 * Generate a stable slug for a node label. Falls back to node ID if label missing.
 */
export function generateNodeSlug(label: string | undefined | null, fallbackId: string): string {
  const base = label && label.trim().length > 0 ? label : fallbackId;

  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');

  if (slug.length === 0) {
    return `node_${fallbackId}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  return slug;
}
