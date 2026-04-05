/**
 * Unit tests for the credentials API facade
 *
 * Validates that create, update, and OAuth2 methods return sanitized
 * credentials — secrets are masked before reaching the HTTP layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCredentialsAPI } from 'src/api/credentials';
import { CredentialsService } from 'src/services/credentials/credentials.service';
import type { ServiceFactory } from 'src/services/service-factory';
import type { Logger } from 'src/schemas';

const MASK = '••••••••';

/** Builds a fake credential with full sensitive config */
function fakeCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cred-1',
    name: 'Test Cred',
    type: 'http-api' as const,
    authType: 'bearer' as const,
    config: {
      accessToken: 'ya29.real-token',
      refreshToken: '1//real-refresh',
      clientId: 'client-id.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-real-secret',
      tokenType: 'Bearer',
      scope: 'openid email',
      apiKey: 'sk-key-1234',
      token: 'bearer-token',
      password: 'super-secret',
      secretKey: 'sk_live_abc',
      consumerSecret: 'cs_secret',
    },
    description: 'test',
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockServiceFactory(): {
  sf: ServiceFactory;
  mockSvc: Record<string, ReturnType<typeof vi.fn>>;
} {
  const fullCred = fakeCredential();

  const mockSvc = {
    create: vi.fn().mockResolvedValue(fullCred),
    update: vi.fn().mockResolvedValue(fullCred),
    get: vi.fn().mockResolvedValue(fullCred),
    getSanitized: vi.fn().mockResolvedValue({
      ...fullCred,
      config: CredentialsService.sanitizeConfig(fullCred.config),
    }),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    test: vi.fn().mockResolvedValue({ success: true }),
    updateLastUsed: vi.fn().mockResolvedValue(undefined),
    getExpiringCredentials: vi.fn().mockResolvedValue([]),
    getWebhookInfo: vi.fn().mockResolvedValue(null),
    enableWebhook: vi.fn().mockResolvedValue({ webhookPath: 'abc', fullUrl: 'http://x/abc' }),
    findByWebhookPath: vi.fn().mockResolvedValue(null),
    getDecryptedWithRefresh: vi.fn().mockResolvedValue(fullCred),
    getOAuth2Service: vi.fn().mockReturnValue({
      getProviders: vi.fn().mockReturnValue([]),
      getProvider: vi.fn().mockReturnValue(undefined),
      startAuthorizationFlow: vi
        .fn()
        .mockReturnValue({ authorizationUrl: 'https://auth', state: 's' }),
      getPendingState: vi.fn().mockReturnValue(undefined),
      exchangeCodeForTokens: vi.fn(),
      buildCredentialConfig: vi.fn(),
    }),
  };

  const sf = {
    getCredentialsService: () => mockSvc,
  } as unknown as ServiceFactory;

  return { sf, mockSvc };
}

const noopLogger: Logger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('Credentials API Facade — Response Sanitization', () => {
  let api: ReturnType<typeof createCredentialsAPI>;
  let mockSvc: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const result = createMockServiceFactory();
    api = createCredentialsAPI(result.sf, noopLogger);
    mockSvc = result.mockSvc;
  });

  describe('create()', () => {
    it('should sanitize all sensitive fields in the returned credential', async () => {
      const result = await api.create({
        name: 'New',
        type: 'http-api',
        authType: 'bearer',
        config: { token: 'secret' },
      });

      // Sensitive fields should be masked
      expect(result.config.accessToken).toBe(MASK);
      expect(result.config.refreshToken).toBe(MASK);
      expect(result.config.clientSecret).toBe(MASK);
      expect(result.config.apiKey).toBe(MASK);
      expect(result.config.token).toBe(MASK);
      expect(result.config.password).toBe(MASK);
      expect(result.config.secretKey).toBe(MASK);
      expect(result.config.consumerSecret).toBe(MASK);

      // Non-sensitive fields should be preserved
      expect(result.config.clientId).toBe('client-id.apps.googleusercontent.com');
      expect(result.config.tokenType).toBe('Bearer');
      expect(result.config.scope).toBe('openid email');
    });
  });

  describe('update()', () => {
    it('should sanitize all sensitive fields in the returned credential', async () => {
      const result = await api.update('cred-1', { name: 'Updated' });

      expect(result.config.accessToken).toBe(MASK);
      expect(result.config.refreshToken).toBe(MASK);
      expect(result.config.clientSecret).toBe(MASK);
      expect(result.config.apiKey).toBe(MASK);

      // Non-sensitive preserved
      expect(result.config.clientId).toBe('client-id.apps.googleusercontent.com');
    });
  });

  describe('getSanitized()', () => {
    it('should delegate to service.getSanitized()', async () => {
      const result = await api.getSanitized('cred-1');
      expect(mockSvc.getSanitized).toHaveBeenCalledWith('cred-1');
      expect(result.config.accessToken).toBe(MASK);
    });
  });

  describe('get()', () => {
    it('should return full decrypted config (for internal use)', async () => {
      const result = await api.get('cred-1');
      // get() is the internal method — returns decrypted data for service use
      expect(result.config.accessToken).toBe('ya29.real-token');
    });
  });

  describe('refreshOAuth2Credential()', () => {
    it('should sanitize the returned refreshed credential', async () => {
      const result = await api.refreshOAuth2Credential('cred-1');

      expect(result.config.accessToken).toBe(MASK);
      expect(result.config.refreshToken).toBe(MASK);
      expect(result.config.clientSecret).toBe(MASK);
    });
  });

  describe('list()', () => {
    it('should not include config in listing results', async () => {
      mockSvc.list.mockResolvedValueOnce([
        { id: 'c1', name: 'Cred 1', type: 'http-api' },
        { id: 'c2', name: 'Cred 2', type: 'http-api' },
      ]);
      const results = await api.list();
      for (const cred of results) {
        expect((cred as Record<string, unknown>).config).toBeUndefined();
      }
    });
  });
});
