import type { Credential } from '../api/types';

interface CredentialFieldHints {
  /** OAuth2 provider IDs to match (e.g., ["google"]) */
  oauth2Providers?: string[];
  /** Credential types to match (e.g., ["oauth2", "api_key"]) */
  credentialTypes?: string[];
}

/**
 * Filter a list of credentials to those relevant for a specific credential field.
 *
 * Matching rules:
 * 1. If the field specifies `oauth2Providers`, show credentials whose
 *    `metadata.oauth2Provider` matches **plus** any non-OAuth2 credentials
 *    (apiKey, bearer, etc.) that could serve as manual API key fallbacks.
 * 2. If the field specifies `credentialTypes` (without oauth2Providers),
 *    filter by `authType`.
 * 3. If neither is specified, return all credentials (no filtering).
 */
export function filterCredentialsForField(
  credentials: Credential[],
  field: CredentialFieldHints,
): Credential[] {
  // No filtering hints → show everything
  if (
    (!field.oauth2Providers || field.oauth2Providers.length === 0) &&
    (!field.credentialTypes || field.credentialTypes.length === 0)
  ) {
    return credentials;
  }

  // OAuth2 provider filtering (primary case for integration nodes)
  if (field.oauth2Providers && field.oauth2Providers.length > 0) {
    const providers = field.oauth2Providers;
    return credentials.filter((cred) => {
      // Match by OAuth2 provider stored in metadata or config
      const credProvider =
        (cred.metadata?.oauth2Provider as string | undefined) ??
        (cred.config?.oauth2Provider as string | undefined) ??
        (cred.metadata?.provider as string | undefined);
      if (credProvider && providers.includes(credProvider)) {
        return true;
      }

      // Also include non-OAuth2 credentials (manual API keys, bearer tokens)
      // as they might be custom credentials for the same service
      if (cred.authType !== 'oauth2') {
        return true;
      }

      // Exclude OAuth2 credentials from other providers
      return false;
    });
  }

  // Credential type filtering (e.g., ["llm"], ["database"], ["api_key"])
  // Checks both the credential's `type` (CredentialType: 'llm', 'http-api', 'database')
  // and `authType` (CredentialAuthType: 'apiKey', 'bearer', 'oauth2', etc.)
  if (field.credentialTypes && field.credentialTypes.length > 0) {
    const types = field.credentialTypes;
    return credentials.filter((cred) => {
      return types.includes(cred.type) || types.includes(cred.authType);
    });
  }

  return credentials;
}
