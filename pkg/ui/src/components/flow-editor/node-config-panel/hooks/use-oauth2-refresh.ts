import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useTestCredential,
  useStartOAuth2Flow,
  useHandleOAuth2Callback,
  useCredentials,
} from '../../../../api/credentials.api';
import { buildOAuthCallbackUri, useFrontendPath } from '../../../../contexts/FrontendPathContext';

/**
 * Manages the OAuth2 credential refresh popup lifecycle:
 * - Tests credential → if expired → opens re-auth popup
 * - Listens for postMessage callback from the popup
 * - Detects popup close without completing
 */
export function useOAuth2Refresh({ requiredScopes }: { requiredScopes?: string[] }) {
  const frontendPath = useFrontendPath();
  const testCredentialMutation = useTestCredential();
  const startOAuth2Flow = useStartOAuth2Flow();
  const handleOAuth2Callback = useHandleOAuth2Callback();
  const { refetch: refetchCredentials } = useCredentials(
    { includeShared: true },
    { enabled: false },
  );

  const [refreshingCredentialId, setRefreshingCredentialId] = useState<string | null>(null);
  const [oauthPopupWindow, setOAuthPopupWindow] = useState<Window | null>(null);
  const oauthCallbackParamsRef = useRef<{ credentialId: string } | null>(null);

  // Listen for OAuth callback message from popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const { type, code, state, error } = event.data;
      if (type !== 'oauth2_callback') {
        return;
      }

      if (oauthPopupWindow && !oauthPopupWindow.closed) {
        oauthPopupWindow.close();
      }
      setOAuthPopupWindow(null);

      if (error || !code || !state) {
        setRefreshingCredentialId(null);
        return;
      }

      try {
        await handleOAuth2Callback.mutateAsync({
          code,
          state,
          redirectUri: buildOAuthCallbackUri(window.location.origin, frontendPath),
        });
      } catch {
        // Credential cache is invalidated by the mutation hook on success
      }
      setRefreshingCredentialId(null);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [oauthPopupWindow, handleOAuth2Callback]);

  // Check if popup was closed without completing
  useEffect(() => {
    if (!oauthPopupWindow) {
      return;
    }
    const check = setInterval(() => {
      if (oauthPopupWindow.closed) {
        clearInterval(check);
        setOAuthPopupWindow(null);
        setRefreshingCredentialId(null);
      }
    }, 500);
    return () => clearInterval(check);
  }, [oauthPopupWindow]);

  const handleRefreshOAuthCredential = useCallback(
    async (credential: { id: string }) => {
      setRefreshingCredentialId(credential.id);
      oauthCallbackParamsRef.current = { credentialId: credential.id };

      try {
        const testResult = await testCredentialMutation.mutateAsync(credential.id);
        if (testResult.success) {
          setRefreshingCredentialId(null);
          refetchCredentials();
          return;
        }
      } catch {
        // Test failed — proceed to re-authorize
      }

      try {
        const result = await startOAuth2Flow.mutateAsync({
          existingCredentialId: credential.id,
          redirectUri: buildOAuthCallbackUri(window.location.origin, frontendPath),
          returnUrl: window.location.href,
          scopes: requiredScopes,
        });

        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          result.authorizationUrl,
          `oauth2_refresh_${credential.id}`,
          `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
        );

        if (!popup) {
          setRefreshingCredentialId(null);
          return;
        }

        setOAuthPopupWindow(popup);
      } catch {
        setRefreshingCredentialId(null);
      }
    },
    [testCredentialMutation, startOAuth2Flow, refetchCredentials, requiredScopes, frontendPath],
  );

  return {
    refreshingCredentialId,
    handleRefreshOAuthCredential,
  };
}
