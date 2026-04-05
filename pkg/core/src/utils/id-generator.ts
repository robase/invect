// Framework-agnostic ID generation utilities for Invect core
import { createUrlSafeIdGenerator } from './url-safe-id';

/**
 * ID generation utilities
 */
export class IdGenerator {
  // Alphabet for random suffixes (alphanumeric, case-sensitive, URL-safe)
  private static readonly RANDOM_ALPHABET =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  // Create nanoid function for random suffixes
  private static readonly nanoid4 = createUrlSafeIdGenerator({
    alphabet: IdGenerator.RANDOM_ALPHABET,
    size: 4,
  });

  /**
   * Generate a flow ID from flow name
   * Format: first 0-20 characters of flow name (lowercased and hyphenated) + 4 random chars
   * Example: "Onboarding Process For Payments" -> "onboarding-process-fo-k2Rn"
   */
  static generateFlowId(flowName: string): string {
    if (!flowName || typeof flowName !== 'string') {
      throw new Error('Flow name is required and must be a string');
    }

    // Clean and process the name
    const cleanName = flowName
      .trim()
      .toLowerCase()
      // Replace spaces and non-alphanumeric characters with hyphens
      .replace(/[^a-z0-9]+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
      // Collapse multiple hyphens
      .replace(/-+/g, '-');

    if (!cleanName) {
      throw new Error('Flow name must contain at least one alphanumeric character');
    }

    // Take first 20 characters (or less if shorter)
    const prefix = cleanName.substring(0, 20);

    // Generate 4 random characters
    const suffix = IdGenerator.nanoid4();

    return `${prefix}-${suffix}`;
  }

  /**
   * Validate flow ID format
   */
  static isValidFlowId(flowId: string): boolean {
    if (!flowId || typeof flowId !== 'string') {
      return false;
    }

    // Flow ID should be: 1-20 lowercase chars/hyphens + dash + 4 random chars
    // oxlint-disable-next-line security/detect-unsafe-regex -- input bounded to 25 chars by length check above
    const flowIdPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-[a-zA-Z0-9]{4}$/;
    return flowIdPattern.test(flowId) && flowId.length >= 6 && flowId.length <= 25;
  }
}
