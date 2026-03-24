import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import type {
  Credential,
  UpdateCredentialInput,
  CredentialAuthType,
  CredentialType,
} from '../../api/types';

interface EditCredentialModalProps {
  credential: Credential;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateCredentialInput) => void;
  isLoading?: boolean;
}

const ALL_AUTH_TYPES: { value: CredentialAuthType; label: string }[] = [
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'custom', label: 'Custom Headers' },
  { value: 'awsSigV4', label: 'AWS Signature V4' },
  { value: 'jwt', label: 'JWT' },
  { value: 'connectionString', label: 'Connection String' },
];

function getAuthTypesForType(type: CredentialType) {
  if (type === 'database') {
    return ALL_AUTH_TYPES.filter((t) => ['basic', 'connectionString', 'oauth2'].includes(t.value));
  }
  if (type === 'llm') {
    return ALL_AUTH_TYPES.filter((t) => ['apiKey', 'bearer'].includes(t.value));
  }
  // http-api
  return ALL_AUTH_TYPES.filter((t) => !['connectionString'].includes(t.value));
}

export const EditCredentialModal: React.FC<EditCredentialModalProps> = ({
  credential,
  open,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [formData, setFormData] = useState<UpdateCredentialInput>({
    name: credential.name,
    type: credential.type,
    authType: credential.authType,
    description: credential.description,
    isActive: credential.isActive,
    config: credential.config || {},
    metadata: credential.metadata || {},
  });

  useEffect(() => {
    setFormData({
      name: credential.name,
      type: credential.type,
      authType: credential.authType,
      description: credential.description,
      isActive: credential.isActive,
      config: credential.config || {},
      metadata: credential.metadata || {},
    });
  }, [credential]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const updateConfig = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      config: { ...(prev.config || {}), [key]: value },
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-background/80" onClick={onClose} />
      <div className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-50 w-full max-w-2xl">
        <div className="grid w-full gap-4 border border-border bg-background p-6 shadow-lg sm:rounded-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Edit Credential</h2>
            <button
              onClick={onClose}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Stripe Production"
                required
              />
            </div>

            {/* Credential Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Credential Type *</Label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as CredentialType;
                  if (newType === 'llm') {
                    setFormData({ ...formData, type: newType, authType: 'apiKey' });
                  } else {
                    const available = getAuthTypesForType(newType);
                    const nextAuthType = available.some((t) => t.value === formData.authType)
                      ? formData.authType
                      : available[0]?.value || 'basic';
                    setFormData({ ...formData, type: newType, authType: nextAuthType });
                  }
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                required
              >
                <option value="http-api">HTTP API</option>
                <option value="llm">LLM Provider</option>
                <option value="database">Database</option>
              </select>
            </div>

            {/* Auth Type (hidden for LLM — always apiKey) */}
            {formData.type !== 'llm' && (
              <div className="space-y-2">
                <Label htmlFor="authType">Authentication Type *</Label>
                <select
                  id="authType"
                  value={formData.authType}
                  onChange={(e) =>
                    setFormData({ ...formData, authType: e.target.value as CredentialAuthType })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  required
                >
                  {getAuthTypesForType(formData.type || 'http-api').map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Active Status */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Active
              </Label>
            </div>

            {/* LLM Provider selector (only shown for LLM type) */}
            {formData.type === 'llm' && (
              <div className="space-y-2">
                <Label htmlFor="edit-llmProvider">LLM Provider</Label>
                <select
                  id="edit-llmProvider"
                  value={(formData.metadata?.provider as string) || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      metadata: { ...formData.metadata, provider: e.target.value },
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="">Select a provider…</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
            )}

            {/* Config fields based on auth type */}
            <div className="space-y-4 p-4 bg-muted rounded-lg">
              <h3 className="font-medium text-sm">Credentials</h3>
              <p className="text-xs text-muted-foreground">
                Leave fields empty to keep existing values
              </p>

              {/* LLM: plain API key only */}
              {formData.type === 'llm' && (
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={(formData.config?.apiKey as string) || ''}
                    onChange={(e) => updateConfig('apiKey', e.target.value)}
                    placeholder="Enter API key or leave empty to keep current"
                  />
                </div>
              )}

              {formData.type !== 'llm' && formData.authType === 'bearer' && (
                <div className="space-y-2">
                  <Label htmlFor="token">Token</Label>
                  <Input
                    id="token"
                    type="password"
                    value={(formData.config?.token as string) || ''}
                    onChange={(e) => updateConfig('token', e.target.value)}
                    placeholder="Enter new bearer token or leave empty"
                  />
                </div>
              )}

              {formData.type !== 'llm' && formData.authType === 'apiKey' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={(formData.config?.apiKey as string) || ''}
                      onChange={(e) => updateConfig('apiKey', e.target.value)}
                      placeholder="Enter new API key or leave empty"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <select
                      id="location"
                      value={(formData.config?.location as string) || 'header'}
                      onChange={(e) => updateConfig('location', e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value="header">Header</option>
                      <option value="query">Query Parameter</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paramName">Parameter Name</Label>
                    <Input
                      id="paramName"
                      value={(formData.config?.paramName as string) || ''}
                      onChange={(e) => updateConfig('paramName', e.target.value)}
                      placeholder="X-API-Key"
                    />
                  </div>
                </>
              )}

              {formData.authType === 'connectionString' && (
                <div className="space-y-2">
                  <Label htmlFor="connectionString">Connection String</Label>
                  <Input
                    id="connectionString"
                    type="password"
                    value={(formData.config?.connectionString as string) || ''}
                    onChange={(e) => updateConfig('connectionString', e.target.value)}
                    placeholder="postgres://user:pass@host:5432/dbname?sslmode=require"
                  />
                </div>
              )}

              {formData.authType === 'basic' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={(formData.config?.username as string) || ''}
                      onChange={(e) => updateConfig('username', e.target.value)}
                      placeholder="Enter new username or leave empty"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={(formData.config?.password as string) || ''}
                      onChange={(e) => updateConfig('password', e.target.value)}
                      placeholder="Enter new password or leave empty"
                    />
                  </div>
                </>
              )}

              {formData.authType === 'oauth2' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="accessToken">Access Token</Label>
                    <Input
                      id="accessToken"
                      type="password"
                      value={(formData.config?.accessToken as string) || ''}
                      onChange={(e) => updateConfig('accessToken', e.target.value)}
                      placeholder="Enter new access token or leave empty"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="refreshToken">Refresh Token</Label>
                    <Input
                      id="refreshToken"
                      type="password"
                      value={(formData.config?.refreshToken as string) || ''}
                      onChange={(e) => updateConfig('refreshToken', e.target.value)}
                      placeholder="Enter new refresh token or leave empty"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description for this credential"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
