/**
 * Unit tests for CredentialsService.sanitizeConfig
 *
 * Validates that all sensitive fields are properly masked and
 * non-sensitive fields are preserved.
 */
import { describe, it, expect } from 'vitest';
import { CredentialsService } from 'src/services/credentials/credentials.service';

describe('CredentialsService.sanitizeConfig', () => {
  const MASK = '••••••••';

  describe('sensitive field masking', () => {
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
      'key',
      'webhookSecret',
    ];

    for (const field of SENSITIVE_FIELDS) {
      it(`should mask "${field}"`, () => {
        const config = { [field]: 'super-secret-value' };
        const sanitized = CredentialsService.sanitizeConfig(config);
        expect(sanitized[field]).toBe(MASK);
      });
    }

    it('should mask all sensitive fields in a full OAuth2 config', () => {
      const config = {
        accessToken: 'ya29.access-token',
        refreshToken: '1//refresh-token',
        clientId: 'client-id.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-secret',
        tokenType: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        expiresAt: '2026-01-01T00:00:00Z',
        oauth2Provider: 'google_gmail',
      };

      const sanitized = CredentialsService.sanitizeConfig(config);

      // Should be masked
      expect(sanitized.accessToken).toBe(MASK);
      expect(sanitized.refreshToken).toBe(MASK);
      expect(sanitized.clientSecret).toBe(MASK);

      // Should be preserved
      expect(sanitized.clientId).toBe('client-id.apps.googleusercontent.com');
      expect(sanitized.tokenType).toBe('Bearer');
      expect(sanitized.scope).toBe('https://www.googleapis.com/auth/gmail.readonly');
      expect(sanitized.expiresAt).toBe('2026-01-01T00:00:00Z');
      expect(sanitized.oauth2Provider).toBe('google_gmail');
    });

    it('should mask Stripe secretKey', () => {
      const config = {
        secretKey: 'sk_live_abc123',
        publishableKey: 'pk_live_xyz789',
      };

      const sanitized = CredentialsService.sanitizeConfig(config);
      expect(sanitized.secretKey).toBe(MASK);
      expect(sanitized.publishableKey).toBe('pk_live_xyz789');
    });

    it('should mask WooCommerce consumerSecret', () => {
      const config = {
        consumerKey: 'ck_abc123',
        consumerSecret: 'cs_secret456',
        siteUrl: 'https://shop.example.com',
      };

      const sanitized = CredentialsService.sanitizeConfig(config);
      expect(sanitized.consumerSecret).toBe(MASK);
      expect(sanitized.consumerKey).toBe('ck_abc123');
      expect(sanitized.siteUrl).toBe('https://shop.example.com');
    });

    it('should mask webhookSecret', () => {
      const config = {
        webhookSecret: 'whsec_abc123',
        webhookUrl: 'https://example.com/webhook',
      };

      const sanitized = CredentialsService.sanitizeConfig(config);
      expect(sanitized.webhookSecret).toBe(MASK);
      expect(sanitized.webhookUrl).toBe('https://example.com/webhook');
    });

    it('should mask password and connectionString in basic/db creds', () => {
      const config = {
        username: 'admin',
        password: 'super-secret',
        connectionString: 'postgresql://user:pass@host:5432/db',
      };

      const sanitized = CredentialsService.sanitizeConfig(config);
      expect(sanitized.password).toBe(MASK);
      expect(sanitized.connectionString).toBe(MASK);
      expect(sanitized.username).toBe('admin');
    });
  });

  describe('non-sensitive field passthrough', () => {
    it('should preserve non-sensitive fields unchanged', () => {
      const NON_SENSITIVE_FIELDS = {
        clientId: 'client-id.apps.google.com',
        oauth2Provider: 'google_gmail',
        tokenType: 'Bearer',
        scope: 'read write',
        expiresAt: '2026-12-31T23:59:59Z',
        customField: 'any-value',
        nested: 'not-blocked',
      };

      const sanitized = CredentialsService.sanitizeConfig(NON_SENSITIVE_FIELDS);
      expect(sanitized).toEqual(NON_SENSITIVE_FIELDS);
    });
  });

  describe('edge cases', () => {
    it('should not mask falsy sensitive fields', () => {
      const config = {
        token: '',
        apiKey: null as unknown as string,
        password: undefined as unknown as string,
      };

      const sanitized = CredentialsService.sanitizeConfig(config);
      // Empty/null/undefined values are falsy, so they should NOT be masked
      expect(sanitized.token).toBe('');
      expect(sanitized.apiKey).toBeNull();
      expect(sanitized.password).toBeUndefined();
    });

    it('should handle empty config', () => {
      const sanitized = CredentialsService.sanitizeConfig({});
      expect(sanitized).toEqual({});
    });

    it('should not mutate the original config', () => {
      const config = { token: 'original', clientId: 'kept' };
      CredentialsService.sanitizeConfig(config);
      expect(config.token).toBe('original');
    });
  });
});
