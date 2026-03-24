/**
 * Utilities for generating and managing node reference IDs
 */

const MAX_REFERENCE_ID_LENGTH = 22;

/**
 * Convert a display name to a snake_case reference ID
 * Only allows alphanumeric characters and underscores
 * Truncates to MAX_REFERENCE_ID_LENGTH chars
 */
export function toReferenceId(displayName: string): string {
  const baseId = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove non-alphanumeric chars except spaces
    .trim()
    .replace(/\s+/g, '_'); // Replace spaces with underscores

  return truncateReferenceId(baseId);
}

/**
 * Truncate a reference ID to max length while preserving any numeric suffix
 * e.g., "some_really_long_node_name_2" → "some_really_long_no_2"
 */
function truncateReferenceId(refId: string, suffix?: string): string {
  const maxLen = MAX_REFERENCE_ID_LENGTH;

  // If already within limit, return as-is
  if (refId.length <= maxLen) {
    return refId;
  }

  // If there's a suffix (like "_2"), ensure it fits
  if (suffix) {
    const suffixWithUnderscore = `_${suffix}`;
    const availableForBase = maxLen - suffixWithUnderscore.length;
    if (availableForBase <= 0) {
      // Suffix itself is too long, just truncate the whole thing
      return refId.substring(0, maxLen);
    }
    return refId.substring(0, availableForBase) + suffixWithUnderscore;
  }

  // No suffix, just truncate
  return refId.substring(0, maxLen);
}

/**
 * Generate a unique display name for a new node, avoiding conflicts
 * Returns names like "AI Model", "AI Model 2", "AI Model 3", etc.
 */
export function generateUniqueDisplayName(
  baseDisplayName: string,
  existingNodes: { data?: { display_name?: string } }[],
): string {
  const existingNames = new Set(
    existingNodes
      .map((node) => node.data?.display_name)
      .filter((name): name is string => typeof name === 'string'),
  );

  // If base name doesn't exist, use it
  if (!existingNames.has(baseDisplayName)) {
    return baseDisplayName;
  }

  // Try incrementing numbers until we find a unique name
  let counter = 2;
  while (true) {
    const candidateName = `${baseDisplayName} ${counter}`;
    if (!existingNames.has(candidateName)) {
      return candidateName;
    }
    counter++;
    // Safety limit to prevent infinite loops
    if (counter > 1000) {
      return `${baseDisplayName} ${Date.now()}`;
    }
  }
}

/**
 * Generate a unique reference ID for a new node, avoiding conflicts
 * Truncates to MAX_REFERENCE_ID_LENGTH while preserving the increment suffix
 */
export function generateUniqueReferenceId(
  displayName: string,
  existingNodes: { data?: { reference_id?: string } }[],
): string {
  const baseReferenceId = toReferenceId(displayName);

  const existingReferenceIds = new Set(
    existingNodes
      .map((node) => node.data?.reference_id)
      .filter((id): id is string => typeof id === 'string'),
  );

  // If base reference ID doesn't exist, use it (already truncated by toReferenceId)
  if (!existingReferenceIds.has(baseReferenceId)) {
    return baseReferenceId;
  }

  // Try incrementing numbers until we find a unique reference ID
  let counter = 2;
  while (true) {
    // Truncate base to fit the counter suffix within max length
    const suffix = String(counter);
    const candidateId = truncateReferenceId(baseReferenceId, suffix);

    if (!existingReferenceIds.has(candidateId)) {
      return candidateId;
    }
    counter++;
    // Safety limit to prevent infinite loops
    if (counter > 1000) {
      const timestampSuffix = String(Date.now()).slice(-6);
      return truncateReferenceId(baseReferenceId, timestampSuffix);
    }
  }
}

/**
 * Update reference ID when display name changes
 * Ensures uniqueness among existing nodes
 */
export function updateReferenceIdForDisplayName(
  newDisplayName: string,
  currentNodeId: string,
  existingNodes: { id: string; data?: { reference_id?: string } }[],
): string {
  // Filter out the current node when checking for conflicts
  const otherNodes = existingNodes.filter((node) => node.id !== currentNodeId);
  return generateUniqueReferenceId(newDisplayName, otherNodes);
}
