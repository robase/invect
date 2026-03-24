import type { Credential, CredentialAuthType, CredentialType } from '../../api/types';

// ── Auth type config ───────────────────────────────────────────────────

export const AUTH_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  bearer: {
    label: 'Bearer',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  apiKey: {
    label: 'API Key',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  basic: {
    label: 'Basic',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  oauth2: {
    label: 'OAuth 2.0',
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  },
  custom: { label: 'Custom', color: 'bg-muted text-muted-foreground' },
  awsSigV4: {
    label: 'AWS Sig V4',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
  jwt: { label: 'JWT', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  connectionString: {
    label: 'Connection',
    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  },
};

// ── Dates ──────────────────────────────────────────────────────────────

export const formatDate = (dateString?: string) => {
  if (!dateString) {
    return 'Never';
  }
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days < 30) {
    return `${days}d ago`;
  }
  return date.toLocaleDateString();
};

export const formatFullDate = (dateString?: string) => {
  if (!dateString) {
    return 'Never';
  }
  return new Date(dateString).toLocaleString();
};

export function isTokenExpired(credential: Credential): boolean {
  const expiresAt = credential.expiresAt || credential.config?.expiresAt;
  if (!expiresAt) {
    return false;
  }
  return new Date(expiresAt) < new Date();
}

// ── Edit form auth type helpers ────────────────────────────────────────

export const ALL_AUTH_TYPES: { value: CredentialAuthType; label: string }[] = [
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'custom', label: 'Custom Headers' },
  { value: 'awsSigV4', label: 'AWS Signature V4' },
  { value: 'jwt', label: 'JWT' },
  { value: 'connectionString', label: 'Connection String' },
];

export function getAuthTypesForType(type: CredentialType) {
  if (type === 'database') {
    return ALL_AUTH_TYPES.filter((t) => ['basic', 'connectionString', 'oauth2'].includes(t.value));
  }
  if (type === 'llm') {
    return ALL_AUTH_TYPES.filter((t) => ['apiKey', 'bearer'].includes(t.value));
  }
  return ALL_AUTH_TYPES.filter((t) => !['connectionString'].includes(t.value));
}
