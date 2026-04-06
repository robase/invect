/**
 * Credentials Service
 *
 * Business logic for managing API credentials
 * Uses CredentialsModel for database operations
 * Handles encryption/decryption transparently
 */

import { CredentialsModel } from './credentials.model';
import { EncryptionService } from './encryption.service';
import type { InvectAdapter } from '../../database/adapter';
import type {
  CredentialConfig,
  CredentialAuthType,
  CredentialType,
} from '../../database/schema-sqlite';
import type { Logger } from 'src/schemas';

import type { Credential as ModelCredential } from './credentials.model';

export type Credential = ModelCredential;

export interface CreateCredentialInput {
  name: string;
  type: CredentialType;
  authType: CredentialAuthType;
  config: CredentialConfig;
  description?: string;
  workspaceId?: string;
  isShared?: boolean;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

export interface UpdateCredentialInput {
  name?: string;
  type?: CredentialType;
  authType?: CredentialAuthType;
  config?: CredentialConfig;
  description?: string;
  isActive?: boolean;
  isShared?: boolean;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

export interface CredentialFilters {
  type?: CredentialType;
  authType?: CredentialAuthType;
  isActive?: boolean;
  workspaceId?: string;
  includeShared?: boolean;
}

interface CredentialUsage {
  flowsCount: number;
  nodesCount: number;
  lastUsedAt: string | null;
}

// Import OAuth2 service for token refresh
import { OAuth2Service, createOAuth2Service, type OAuth2AppConfig } from './oauth2.service';

export class CredentialsService {
  private model: CredentialsModel;
  private oauth2Service: OAuth2Service;

  constructor(
    private adapter: InvectAdapter,
    private encryption: EncryptionService,
    private logger: Logger,
  ) {
    this.model = new CredentialsModel(adapter, logger);
    this.oauth2Service = createOAuth2Service(logger);
  }

  /**
   * Get the OAuth2 service instance
   */
  getOAuth2Service(): OAuth2Service {
    return this.oauth2Service;
  }

  /**
   * Create a new credential
   * Automatically encrypts the config
   */
  async create(input: CreateCredentialInput): Promise<Credential> {
    // Encrypt the config before storing
    const encryptedConfigString = this.encryption.encryptObject(input.config);

    // Create the credential via model
    const credential = await this.model.create({
      ...input,
      config: encryptedConfigString as unknown as CredentialConfig,
    });

    // Decrypt config for return (config is already a string from DB)
    const decryptedConfig = this.encryption.decryptObject<CredentialConfig>(
      typeof credential.config === 'string' ? credential.config : JSON.stringify(credential.config),
    );

    return {
      ...credential,
      config: decryptedConfig,
    };
  }

  /**
   * Get a credential by ID
   * Decrypts the config before returning
   */
  async get(id: string): Promise<Credential> {
    const credential = await this.model.findById(id);

    if (!credential) {
      throw new Error('Credential not found');
    }

    // Decrypt the config (config is already a string from DB)
    const decryptedConfig = this.encryption.decryptObject<CredentialConfig>(
      typeof credential.config === 'string' ? credential.config : JSON.stringify(credential.config),
    );

    return {
      ...credential,
      config: decryptedConfig,
    };
  }

  /**
   * Get a credential by ID with sensitive config fields redacted.
   * Safe for returning to the frontend — secrets are replaced with a masked placeholder.
   */
  async getSanitized(id: string): Promise<Credential> {
    const credential = await this.get(id);
    return {
      ...credential,
      config: CredentialsService.sanitizeConfig(credential.config),
    };
  }

  /**
   * Replace sensitive values in a credential config with a masked placeholder.
   * Non-sensitive fields (clientId, oauth2Provider, scope, expiresAt, etc.) are kept.
   */
  static sanitizeConfig(config: CredentialConfig): CredentialConfig {
    const SENSITIVE_FIELDS = [
      'clientSecret',
      'accessToken',
      'refreshToken',
      'apiKey',
      'token',
      'password',
      'connectionString',
      'secretAccessKey',
      'secret',
      'secretKey',
      'consumerSecret',
    ];
    const MASK = '••••••••';
    const sanitized = { ...config };
    for (const field of SENSITIVE_FIELDS) {
      if (sanitized[field]) {
        sanitized[field] = MASK;
      }
    }
    return sanitized;
  }

  /**
   * Alias for get() - Get a decrypted credential by ID
   */
  async getDecrypted(id: string): Promise<Credential> {
    return this.get(id);
  }

  /**
   * Get a decrypted credential and automatically refresh OAuth2 tokens if expired
   *
   * This method:
   * 1. Gets the credential with decrypted config
   * 2. Checks if it's an OAuth2 credential with expired token
   * 3. If expired and has refresh token, refreshes the token
   * 4. Updates the credential in database with new token
   * 5. Returns the credential with fresh token
   *
   * @param id - Credential ID
   * @returns Credential with valid (possibly refreshed) access token
   */
  async getDecryptedWithRefresh(id: string): Promise<Credential> {
    const credential = await this.get(id);

    // Check if this is an OAuth2 credential that needs refresh
    if (
      credential.authType === 'oauth2' &&
      this.oauth2Service.isTokenExpired(credential.config) &&
      this.oauth2Service.canRefresh(credential.config)
    ) {
      this.logger.info('Refreshing expired OAuth2 token', {
        credentialId: id,
        provider: credential.config.oauth2Provider,
      });

      try {
        const appConfig: OAuth2AppConfig = {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked via canRefresh()
          clientId: credential.config.clientId!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked via canRefresh()
          clientSecret: credential.config.clientSecret!,
          redirectUri: '', // Not needed for refresh
        };

        const newTokens = await this.oauth2Service.refreshAccessToken(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked via canRefresh()
          credential.config.refreshToken!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked via canRefresh()
          credential.config.oauth2Provider!,
          appConfig,
        );

        // Calculate new expiry time
        const now = new Date();
        const expiresAt = newTokens.expiresIn
          ? new Date(now.getTime() + newTokens.expiresIn * 1000).toISOString()
          : undefined;

        // Build updated config
        const updatedConfig: CredentialConfig = {
          ...credential.config,
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken || credential.config.refreshToken,
          expiresAt,
        };

        // Update in database
        await this.update(id, { config: updatedConfig });

        this.logger.info('OAuth2 token refreshed successfully', { credentialId: id });

        return {
          ...credential,
          config: updatedConfig,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Failed to refresh OAuth2 token', {
          credentialId: id,
          error: errorMsg,
        });
        // Throw so callers see the real refresh failure instead of a
        // misleading "No valid access token" error.
        throw new Error(
          `OAuth2 token refresh failed for credential ${id} ` +
            `(provider: ${credential.config.oauth2Provider}): ${errorMsg}`,
        );
      }
    }

    return credential;
  }

  /**
   * List all credentials
   * Does NOT decrypt configs (for security)
   * Use get() to decrypt a specific credential
   */
  async list(filters?: CredentialFilters): Promise<Array<Omit<Credential, 'config'>>> {
    // Get all credentials
    const allCredentials = await this.model.findAll();
    const credentials = allCredentials.data;

    // Apply optional filters
    let filtered = credentials;

    if (filters?.type) {
      filtered = filtered.filter((c: Credential) => c.type === filters.type);
    }

    if (filters?.authType) {
      filtered = filtered.filter((c: Credential) => c.authType === filters.authType);
    }

    if (filters?.isActive !== undefined) {
      filtered = filtered.filter((c: Credential) => c.isActive === filters.isActive);
    }

    // Remove config from results for security
    return filtered.map((cred: Credential) => {
      const { config: _config, ...rest } = cred;
      return rest as Omit<Credential, 'config'>;
    });
  }

  /**
   * Update a credential
   * Re-encrypts config if provided
   */
  async update(id: string, input: UpdateCredentialInput): Promise<Credential> {
    // Get existing credential to verify it exists
    const _existing = await this.get(id);

    // Build update object
    const updateData: UpdateCredentialInput = {
      ...input,
    };

    // Encrypt config if provided
    if (input.config !== undefined) {
      const encryptedConfigStr = this.encryption.encryptObject(input.config);
      updateData.config = encryptedConfigStr as unknown as CredentialConfig;
    }

    // Update the credential
    const updated = await this.model.update(id, updateData);

    // Decrypt config for return
    if (updated.config) {
      const decryptedConfig = this.encryption.decryptObject<CredentialConfig>(
        typeof updated.config === 'string'
          ? updated.config
          : JSON.stringify(updated.config),
      );
      return {
        ...updated,
        config: decryptedConfig,
      };
    }

    return updated;
  }

  /**
   * Delete a credential
   */
  async delete(id: string): Promise<void> {
    // Verify credential exists
    await this.get(id);

    // Check if credential is in use
    const usage = await this.getUsage(id);
    if (usage.nodesCount > 0) {
      throw new Error(
        `Cannot delete credential. It is currently used in ${usage.nodesCount} nodes. ` +
          `Please remove all references before deleting.`,
      );
    }

    // Delete the credential
    await this.model.delete(id);
  }

  /**
   * Force-delete a credential by ID without decrypting or checking usage.
   * Used when re-seeding after an encryption key change.
   */
  async forceDelete(id: string): Promise<void> {
    await this.model.delete(id);
  }

  /**
   * Update the lastUsedAt timestamp
   * Called by execution engine when credential is used
   */
  async updateLastUsed(id: string): Promise<void> {
    await this.model.updateLastUsed(id);
  }

  /**
   * Get credential usage information
   * Returns how many flows/nodes use this credential
   */
  async getUsage(id: string): Promise<CredentialUsage> {
    const credential = await this.model.findById(id);

    if (!credential) {
      throw new Error('Credential not found');
    }

    return {
      flowsCount: 0, // TODO: Count flows using this credential
      nodesCount: 0, // TODO: Count nodes using this credential
      lastUsedAt: credential.lastUsedAt || null,
    };
  }

  /**
   * Test a credential by making a test API call
   * Returns true if credential is valid
   */
  async test(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const credential = await this.get(id);

      if (!credential) {
        return { success: false, error: 'Credential not found' };
      }

      // Test based on auth type
      switch (credential.authType) {
        case 'bearer':
          return await this.testBearerToken(credential);

        case 'oauth2':
          return await this.testOAuth2(credential);

        case 'apiKey':
          return await this.testApiKey(credential);

        case 'basic':
          return await this.testBasicAuth(credential);

        case 'connectionString':
          return await this.testConnectionString(credential);

        default:
          return {
            success: false,
            error: `Testing not implemented for auth type: ${credential.authType}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if a credential has expired
   */
  isExpired(credential: Credential | null): boolean {
    if (!credential || !credential.expiresAt) {
      return false;
    }

    const expiresAt = new Date(credential.expiresAt);
    return expiresAt < new Date();
  }

  /**
   * Get credentials that are about to expire
   * Useful for sending notifications.
   * Returns sanitized configs (secrets redacted) to avoid leaking sensitive data.
   */
  async getExpiringCredentials(daysUntilExpiry: number = 7): Promise<Credential[]> {
    const expiredCredentials = await this.model.getExpiredCredentials(daysUntilExpiry);

    // Decrypt configs, then sanitize before returning
    return expiredCredentials.map((cred) => {
      const decryptedConfig = this.encryption.decryptObject<CredentialConfig>(
        JSON.stringify(cred.config),
      );
      return {
        ...cred,
        config: CredentialsService.sanitizeConfig(decryptedConfig),
      };
    });
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Check if a user can access a credential
   * For now, all credentials are accessible since we removed userId
   */
  private canAccess(credential: Credential | null, _userId: string): boolean {
    if (!credential) {
      return false;
    }

    // All credentials are accessible (no user-level permissions)
    return true;
  }

  /**
   * Test bearer token credential
   */
  private async testBearerToken(
    credential: Credential | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }

    // Type-specific validation endpoints
    const testEndpoints: Record<string, Record<string, string>> = {
      'http-api': {
        anthropic: 'https://api.anthropic.com/v1/models',
        github: 'https://api.github.com/user',
        linear: 'https://api.linear.app/graphql',
        stripe: 'https://api.stripe.com/v1/customers?limit=1',
        openai: 'https://api.openai.com/v1/models',
      },
    };

    const endpoints = testEndpoints[credential.type];
    if (!endpoints) {
      return {
        success: false,
        error: `No test endpoints configured for credential type: ${credential.type}`,
      };
    }

    // For http-api, we could try to detect the provider from metadata or config
    // For now, just validate the token exists
    const token =
      credential.authType === 'oauth2' ? credential.config?.accessToken : credential.config?.token;

    if (!token) {
      return { success: false, error: 'Token not found in credential config' };
    }

    // If we have metadata with a provider hint, try to use it
    const providerHint = credential.metadata?.provider as string | undefined;
    const endpoint = providerHint ? endpoints[providerHint.toLowerCase()] : undefined;

    if (!endpoint) {
      return {
        success: true, // Token exists, but we can't test it without knowing the endpoint
        error: 'Token found but no test endpoint available. Add provider to metadata for testing.',
      };
    }

    try {
      const providerHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (providerHint?.toLowerCase() === 'anthropic') {
        providerHeaders['x-api-key'] = token;
        providerHeaders['anthropic-version'] = '2023-06-01';
      } else {
        providerHeaders.Authorization = `Bearer ${token}`;
      }

      const requestInit: RequestInit = {
        headers: providerHeaders,
      };

      if (providerHint?.toLowerCase() === 'linear') {
        requestInit.method = 'POST';
        requestInit.body = JSON.stringify({
          query: 'query CredentialHealthcheck { viewer { id name } }',
        });
      }

      const response = await fetch(endpoint, requestInit);

      if (response.ok) {
        return { success: true };
      }

      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Test OAuth2 credential
   *
   * OAuth2 credentials have a lifecycle:
   * 1. App credentials only (clientId/clientSecret) — not yet authorized
   * 2. Authorized (has accessToken, possibly refreshToken)
   *
   * If the credential has an accessToken, delegate to testBearerToken which
   * will try to call the provider API. Otherwise, check whether the app
   * credentials (clientId/clientSecret) are present and report the actual state.
   */
  private async testOAuth2(credential: Credential): Promise<{ success: boolean; error?: string }> {
    const { config } = credential;

    // If we have an access token, test it like a bearer token
    if (config?.accessToken) {
      return this.testBearerToken(credential);
    }

    // No access token — check if app credentials are configured
    if (config?.clientId && config?.clientSecret) {
      return {
        success: false,
        error:
          'OAuth2 app credentials are configured but the account has not been authorized yet. ' +
          'Use the OAuth connect flow to authorize and obtain an access token.',
      };
    }

    return {
      success: false,
      error:
        'OAuth2 credential is missing both access token and app credentials (clientId/clientSecret).',
    };
  }

  /**
   * Test API key credential
   */
  private async testApiKey(
    credential: Credential | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }

    // For now, just validate the key exists
    if (!credential.config?.apiKey) {
      return {
        success: false,
        error: 'API key is empty',
      };
    }

    // Could add provider-specific validation here
    return { success: true };
  }

  /**
   * Test basic auth credential
   */
  private async testBasicAuth(
    credential: Credential | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }

    // Validate username and password exist
    if (!credential.config?.username || !credential.config?.password) {
      return {
        success: false,
        error: 'Username or password is empty',
      };
    }

    // Could add provider-specific validation here
    return { success: true };
  }

  /**
   * Test database connection string credential
   */
  private async testConnectionString(
    credential: Credential | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }

    if (!credential.config?.connectionString) {
      return { success: false, error: 'Connection string is empty' };
    }

    // Future: Try lightweight parse/validation by driver
    return { success: true };
  }
}
