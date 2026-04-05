import type { CredentialsAPI } from './types';
import type { ServiceFactory } from '../services/service-factory';
import type { Logger } from '../schemas';
import type { Credential } from '../services/credentials';

export function createCredentialsAPI(sf: ServiceFactory, logger: Logger): CredentialsAPI {
  const svc = sf.getCredentialsService();

  return {
    create(input) {
      logger.debug('createCredential called');
      return svc.create(input);
    },

    list(filters) {
      logger.debug('listCredentials called', { filters });
      return svc.list(filters);
    },

    get(id) {
      logger.debug('getCredential called', { id });
      return svc.get(id);
    },

    getSanitized(id) {
      logger.debug('getCredentialSanitized called', { id });
      return svc.getSanitized(id);
    },

    update(id, input) {
      logger.debug('updateCredential called', { id });
      return svc.update(id, input);
    },

    delete(id) {
      logger.debug('deleteCredential called', { id });
      return svc.delete(id);
    },

    test(id) {
      logger.debug('testCredential called', { id });
      return svc.test(id);
    },

    updateLastUsed(id) {
      logger.debug('updateCredentialLastUsed called', { id });
      return svc.updateLastUsed(id);
    },

    getExpiring(daysUntilExpiry) {
      logger.debug('getExpiringCredentials called', { daysUntilExpiry });
      return svc.getExpiringCredentials(daysUntilExpiry);
    },

    // Webhooks
    getWebhookInfo(id) {
      return svc.getWebhookInfo(id);
    },

    enableWebhook(id) {
      return svc.enableWebhook(id);
    },

    findByWebhookPath(webhookPath) {
      return svc.findByWebhookPath(webhookPath);
    },

    // OAuth2
    getOAuth2Providers() {
      return svc.getOAuth2Service().getProviders();
    },

    getOAuth2Provider(providerId) {
      return svc.getOAuth2Service().getProvider(providerId);
    },

    startOAuth2Flow(providerId, appConfig, options) {
      return svc.getOAuth2Service().startAuthorizationFlow(providerId, appConfig, options);
    },

    async startOAuth2FlowForCredential(existingCredentialId, redirectUri, options) {
      const credential = await svc.get(existingCredentialId);
      const providerId =
        (credential.config?.oauth2Provider as string) ||
        (credential.metadata?.oauth2Provider as string);
      if (!providerId) {
        throw new Error('Credential does not have an oauth2Provider configured');
      }
      const clientId = credential.config?.clientId as string;
      const clientSecret = credential.config?.clientSecret as string;
      if (!clientId || !clientSecret) {
        throw new Error('Credential is missing clientId or clientSecret');
      }
      return svc.getOAuth2Service().startAuthorizationFlow(
        providerId,
        { clientId, clientSecret, redirectUri },
        {
          ...options,
          existingCredentialId,
        },
      );
    },

    getOAuth2PendingState(state) {
      return svc.getOAuth2Service().getPendingState(state);
    },

    async handleOAuth2Callback(code, state, appConfig): Promise<Credential> {
      const oauth2Service = svc.getOAuth2Service();

      // Resolve appConfig from pending state if not provided by the caller
      const pending = oauth2Service.getPendingState(state);
      const resolvedAppConfig = appConfig ?? pending?.appConfig;
      if (!resolvedAppConfig) {
        throw new Error('Missing app credentials — cannot exchange OAuth code');
      }

      const { tokens, pendingState } = await oauth2Service.exchangeCodeForTokens(
        code,
        state,
        resolvedAppConfig,
      );
      const provider = oauth2Service.getProvider(pendingState.providerId);
      if (!provider) {
        throw new Error(`Unknown OAuth2 provider: ${pendingState.providerId}`);
      }
      const config = oauth2Service.buildCredentialConfig(
        tokens,
        pendingState.providerId,
        resolvedAppConfig,
      );

      // If we have an existing credential ID, update it instead of creating a new one
      if (pendingState.existingCredentialId) {
        return svc.update(pendingState.existingCredentialId, {
          config,
          metadata: {
            oauth2Provider: pendingState.providerId,
            scopes: tokens.scope?.split(' ') || provider.defaultScopes,
          },
        });
      }

      return svc.create({
        name: pendingState.credentialName || provider.name,
        type: 'http-api',
        authType: 'oauth2',
        config,
        description: `OAuth2 credential for ${provider.name}`,
        metadata: {
          oauth2Provider: pendingState.providerId,
          scopes: tokens.scope?.split(' ') || provider.defaultScopes,
        },
      });
    },

    refreshOAuth2Credential(credentialId) {
      return svc.getDecryptedWithRefresh(credentialId);
    },
  };
}
