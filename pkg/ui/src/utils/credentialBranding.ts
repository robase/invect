import type { Credential } from '../api/types';

const OAUTH2_TO_ICON_ID: Record<string, string> = {
  google: 'google',
  microsoft: 'microsoft',
  github: 'github',
  slack: 'slack',
  linear: 'linear',
};

const NAME_HINTS: Array<[RegExp, string, string]> = [
  [/openai|gpt/i, 'openai', 'Zap'],
  [/anthropic|claude/i, 'anthropic', 'Zap'],
  [/openrouter/i, 'openrouter', 'Bot'],
  [/gmail/i, 'google', 'Mail'],
  [/github/i, 'github', 'Github'],
  [/slack/i, 'slack', 'MessageSquare'],
  [/linear/i, 'linear', 'CheckSquare'],
  [/google/i, 'google', 'Globe'],
  [/postgres/i, 'postgres', 'Database'],
];

const URL_HINTS: Array<[RegExp, string, string]> = [
  [/openai/i, 'openai', 'Zap'],
  [/anthropic/i, 'anthropic', 'Zap'],
  [/openrouter/i, 'openrouter', 'Bot'],
  [/github/i, 'github', 'Github'],
  [/slack/i, 'slack', 'MessageSquare'],
];

export interface CredentialBranding {
  providerId?: string;
  icon: string;
  providerLabel: string | null;
}

function toTitleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getConfiguredProvider(credential: Credential): string | null {
  const provider =
    (credential.config?.oauth2Provider as string | undefined) ??
    (credential.metadata?.provider as string | undefined) ??
    (credential.config?.provider as string | undefined) ??
    null;

  return provider?.trim() || null;
}

function getProviderFromUrls(credential: Credential): { providerId: string; icon: string } | null {
  const urlCandidates = [
    credential.config?.apiUrl,
    credential.config?.baseUrl,
    credential.config?.endpoint,
    credential.metadata?.apiUrl,
  ];

  for (const candidate of urlCandidates) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      continue;
    }

    for (const [pattern, providerId, icon] of URL_HINTS) {
      if (pattern.test(candidate)) {
        return { providerId, icon };
      }
    }
  }

  return null;
}

export function getCredentialBranding(credential: Credential): CredentialBranding {
  const configuredProvider = getConfiguredProvider(credential);
  if (configuredProvider) {
    const providerId = OAUTH2_TO_ICON_ID[configuredProvider] ?? configuredProvider.toLowerCase();
    return {
      providerId,
      icon: credential.authType === 'oauth2' ? 'Key' : credential.type === 'llm' ? 'Bot' : 'Key',
      providerLabel: toTitleCase(configuredProvider),
    };
  }

  for (const [pattern, providerId, icon] of NAME_HINTS) {
    if (pattern.test(credential.name)) {
      return {
        providerId,
        icon,
        providerLabel: toTitleCase(providerId),
      };
    }
  }

  const urlProvider = getProviderFromUrls(credential);
  if (urlProvider) {
    return {
      providerId: urlProvider.providerId,
      icon: urlProvider.icon,
      providerLabel: toTitleCase(urlProvider.providerId),
    };
  }

  if (credential.type === 'database') {
    return { icon: 'Database', providerLabel: null };
  }
  if (credential.type === 'llm') {
    return { icon: 'Bot', providerLabel: null };
  }

  return { icon: 'Key', providerLabel: null };
}

export function getCredentialProviderLabel(credential: Credential): string | null {
  return getCredentialBranding(credential).providerLabel;
}
