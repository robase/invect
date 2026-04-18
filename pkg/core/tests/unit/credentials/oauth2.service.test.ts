import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuth2Service } from 'src/services/credentials/oauth2.service';
import type { Logger } from 'src/schemas';

const appConfig = {
  clientId: 'client-id.apps.googleusercontent.com',
  clientSecret: 'super-secret-client-secret',
  redirectUri: 'http://localhost:5173/invect/oauth/callback',
};

function createLogger(): Logger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('OAuth2Service', () => {
  let service: OAuth2Service;
  let logger: Logger;
  let createdStates: string[];

  beforeEach(() => {
    logger = createLogger();
    service = new OAuth2Service(logger);
    createdStates = [];
  });

  afterEach(() => {
    for (const state of createdStates) {
      service.removePendingState(state);
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startAuthorizationFlow()', () => {
    it('builds an authorization URL with PKCE, provider defaults, and stores pending state', () => {
      const result = service.startAuthorizationFlow('google', appConfig, {
        returnUrl: 'http://localhost:5173/invect/credentials',
        credentialName: 'Google Workspace',
        existingCredentialId: 'cred-123',
      });
      createdStates.push(result.state);

      expect(result.state).toHaveLength(64);
      expect(result.codeVerifier).toBeTruthy();

      const url = new URL(result.authorizationUrl);
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe(appConfig.clientId);
      expect(url.searchParams.get('redirect_uri')).toBe(appConfig.redirectUri);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBe(result.state);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');

      const codeChallenge = createHash('sha256')
        .update(result.codeVerifier ?? '')
        .digest('base64url');
      expect(url.searchParams.get('code_challenge')).toBe(codeChallenge);

      const scope = url.searchParams.get('scope');
      expect(scope).toContain('https://www.googleapis.com/auth/gmail.readonly');
      expect(scope).toContain('https://www.googleapis.com/auth/drive');

      expect(service.getPendingState(result.state)).toEqual({
        state: result.state,
        providerId: 'google',
        codeVerifier: result.codeVerifier,
        returnUrl: 'http://localhost:5173/invect/credentials',
        credentialName: 'Google Workspace',
        existingCredentialId: 'cred-123',
        appConfig,
        createdAt: expect.any(Number),
      });
    });

    it('uses custom scopes and provider-specific separators when provided', () => {
      const result = service.startAuthorizationFlow('linear', appConfig, {
        scopes: ['read', 'issues:create', 'comments:create'],
      });
      createdStates.push(result.state);

      const url = new URL(result.authorizationUrl);
      expect(url.searchParams.get('scope')).toBe('read,issues:create,comments:create');
    });

    it('throws for unknown providers', () => {
      expect(() => service.startAuthorizationFlow('unknown-provider', appConfig)).toThrow(
        'Unknown OAuth2 provider: unknown-provider',
      );
    });
  });

  describe('exchangeCodeForTokens()', () => {
    it('exchanges an authorization code, returns tokens, and clears pending state', async () => {
      const start = service.startAuthorizationFlow('google', appConfig, {
        returnUrl: 'http://localhost:5173/invect/flow/abc',
      });
      createdStates.push(start.state);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'ya29.access-token',
          refresh_token: '1//refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await service.exchangeCodeForTokens('oauth-code', start.state, appConfig);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        }),
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const params = new URLSearchParams(init.body as string);
      expect(params.get('grant_type')).toBe('authorization_code');
      expect(params.get('code')).toBe('oauth-code');
      expect(params.get('redirect_uri')).toBe(appConfig.redirectUri);
      expect(params.get('client_id')).toBe(appConfig.clientId);
      expect(params.get('client_secret')).toBe(appConfig.clientSecret);
      expect(params.get('code_verifier')).toBe(start.codeVerifier);

      expect(result.tokens).toEqual({
        accessToken: 'ya29.access-token',
        refreshToken: '1//refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'openid email',
        raw: {
          access_token: 'ya29.access-token',
          refresh_token: '1//refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email',
        },
      });
      expect(result.pendingState.providerId).toBe('google');
      expect(service.getPendingState(start.state)).toBeUndefined();

      createdStates = createdStates.filter((state) => state !== start.state);
    });

    it('throws for invalid or expired state', async () => {
      await expect(
        service.exchangeCodeForTokens('oauth-code', 'missing-state', appConfig),
      ).rejects.toThrow('Invalid or expired OAuth state. Please try again.');
    });

    it('throws when token exchange fails', async () => {
      const start = service.startAuthorizationFlow('google', appConfig);
      createdStates.push(start.state);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => 'invalid_grant',
        }),
      );

      await expect(
        service.exchangeCodeForTokens('oauth-code', start.state, appConfig),
      ).rejects.toThrow('Token exchange failed: invalid_grant');

      expect(service.getPendingState(start.state)).toBeDefined();
    });
  });

  describe('refreshAccessToken()', () => {
    it('refreshes an access token and preserves the old refresh token when a new one is not returned', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          token_type: 'Bearer',
          expires_in: 1800,
          scope: 'read write',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await service.refreshAccessToken(
        'existing-refresh-token',
        'google',
        appConfig,
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' }),
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const params = new URLSearchParams(init.body as string);
      expect(params.get('grant_type')).toBe('refresh_token');
      expect(params.get('refresh_token')).toBe('existing-refresh-token');
      expect(params.get('client_id')).toBe(appConfig.clientId);
      expect(params.get('client_secret')).toBe(appConfig.clientSecret);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'existing-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 1800,
        scope: 'read write',
        raw: {
          access_token: 'new-access-token',
          token_type: 'Bearer',
          expires_in: 1800,
          scope: 'read write',
        },
      });
    });

    it('throws for providers that do not support refresh tokens', async () => {
      await expect(
        service.refreshAccessToken('refresh-token', 'github', appConfig),
      ).rejects.toThrow('Provider github does not support token refresh');
    });

    it('throws when refresh fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => 'invalid_client',
        }),
      );

      await expect(
        service.refreshAccessToken('refresh-token', 'google', appConfig),
      ).rejects.toThrow('Token refresh failed: invalid_client');
    });
  });

  describe('credential config helpers', () => {
    it('builds a credential config with calculated expiry and provider metadata', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));

      const result = service.buildCredentialConfig(
        {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer',
          expiresIn: 3600,
          scope: 'openid email',
        },
        'google',
        {
          clientId: appConfig.clientId,
          clientSecret: appConfig.clientSecret,
        },
      );

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: 'openid email',
        expiresAt: '2026-04-18T13:00:00.000Z',
        oauth2Provider: 'google',
        clientId: appConfig.clientId,
        clientSecret: appConfig.clientSecret,
      });
    });

    it('treats missing expiry as expired only when refresh is available', () => {
      expect(service.isTokenExpired({ refreshToken: 'refresh-token' })).toBe(true);
      expect(service.isTokenExpired({ accessToken: 'access-token' })).toBe(false);
    });

    it('respects the expiry buffer and only refreshes when near or past expiry', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));

      expect(
        service.isTokenExpired(
          { expiresAt: '2026-04-18T12:03:00.000Z', refreshToken: 'refresh-token' },
          300,
        ),
      ).toBe(true);

      expect(
        service.isTokenExpired(
          { expiresAt: '2026-04-18T12:20:00.000Z', refreshToken: 'refresh-token' },
          300,
        ),
      ).toBe(false);
    });

    it('reports refresh capability only when both refresh token and provider are present', () => {
      expect(service.canRefresh({ refreshToken: 'refresh-token', oauth2Provider: 'google' })).toBe(
        true,
      );
      expect(service.canRefresh({ refreshToken: 'refresh-token' })).toBe(false);
      expect(service.canRefresh({ oauth2Provider: 'google' })).toBe(false);
    });
  });
});
