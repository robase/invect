import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { CreateCredentialInput, CredentialAuthType, CredentialType } from '../../api/types';
import { useTestCredentialRequest } from '../../api/credentials.api';

interface CreateCredentialModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCredentialInput) => void;
  isLoading?: boolean;
  portalContainer?: HTMLElement | null;
  /** Pre-select a credential type when the modal opens (e.g. 'llm') */
  initialType?: CredentialType;
}

const ALL_AUTH_TYPES: { value: CredentialAuthType; label: string }[] = [
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'custom', label: 'Custom Headers' },
  { value: 'connectionString', label: 'Connection String' },
];

function getAuthTypesForType(type: CredentialType) {
  if (type === 'database') {
    return ALL_AUTH_TYPES.filter((t) => ['basic', 'connectionString', 'oauth2'].includes(t.value));
  }
  if (type === 'llm') {
    return ALL_AUTH_TYPES.filter((t) => ['apiKey', 'bearer'].includes(t.value));
  }
  return ALL_AUTH_TYPES.filter((t) => !['connectionString'].includes(t.value));
}

export const CreateCredentialModal: React.FC<CreateCredentialModalProps> = ({
  open,
  onClose,
  onSubmit,
  isLoading,
  portalContainer,
  initialType,
}) => {
  const testCredentialMutation = useTestCredentialRequest();

  const getInitialFormData = (): CreateCredentialInput => {
    const type: CredentialType = initialType ?? 'http-api';
    return {
      name: '',
      type,
      authType: (type === 'llm' ? 'apiKey' : 'bearer') as CredentialAuthType,
      config: {},
      description: '',
    };
  };

  const [formData, setFormData] = useState<CreateCredentialInput>(getInitialFormData);
  const [testUrl, setTestUrl] = useState('');
  const [testMethod, setTestMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [testBody, setTestBody] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      // Reset form to initial state when modal opens
      setFormData(getInitialFormData());
      const timeout = window.setTimeout(() => {
        firstFieldRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    setTestUrl('');
    setTestMethod('GET');
    setTestBody('');
    setTestStatus('idle');
    setTestMessage('');
    return undefined;
  }, [open]);

  const runCredentialTest = async () => {
    if (!testUrl) {
      return;
    }

    setTestStatus('testing');
    setTestMessage('');

    try {
      const headers: Record<string, string> = {};

      if (formData.authType === 'bearer' && formData.config.token) {
        headers['Authorization'] = `Bearer ${formData.config.token}`;
      } else if (formData.authType === 'apiKey' && formData.config.apiKey) {
        const location = formData.config.location || 'header';
        if (location === 'header') {
          const paramName = (formData.config.paramName as string) || 'X-API-Key';
          headers[paramName] = formData.config.apiKey as string;
        }
      } else if (
        formData.authType === 'basic' &&
        formData.config.username &&
        formData.config.password
      ) {
        const encoded = btoa(`${formData.config.username}:${formData.config.password}`);
        headers['Authorization'] = `Basic ${encoded}`;
      }

      if (testBody && ['POST', 'PUT', 'PATCH'].includes(testMethod)) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await testCredentialMutation.mutateAsync({
        url: testUrl,
        method: testMethod,
        headers,
        body: testBody && ['POST', 'PUT', 'PATCH'].includes(testMethod) ? testBody : undefined,
      });

      if (response.ok) {
        setTestStatus('success');
        setTestMessage(`Connection successful (${response.status} ${response.statusText})`);
      } else {
        setTestStatus('error');
        setTestMessage(`Request failed with status ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error instanceof Error ? error.message : 'Connection failed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalFormData = testUrl
      ? { ...formData, config: { ...formData.config, apiUrl: testUrl } }
      : formData;
    onSubmit(finalFormData);
  };

  const updateConfig = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        container={portalContainer}
        className="max-h-[90vh] bg-card overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-base">Create Credential</DialogTitle>
          <DialogDescription className="text-xs">
            Store API or database credentials securely. These secrets are encrypted at rest.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">
              Name*
            </Label>
            <Input
              id="name"
              ref={firstFieldRef}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My Stripe Production"
              required
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              className="h-8 text-xs"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description for this credential"
              rows={2}
              autoComplete="off"
              className="text-xs"
            />
          </div>

          {/* Credential Type */}
          <div className="space-y-1.5">
            <Label htmlFor="type" className="text-xs">
              Credential Type*
            </Label>
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
              className="flex w-full h-8 px-3 py-1 text-xs rounded-md border border-input bg-background dark:bg-input/30 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              required
            >
              <option value="http-api">HTTP API</option>
              <option value="llm">LLM Provider</option>
              <option value="database">Database</option>
            </select>
          </div>

          {/* Auth Type (hidden for LLM — always apiKey) */}
          {formData.type !== 'llm' && (
            <div className="space-y-1.5">
              <Label htmlFor="authType" className="text-xs">
                Authentication Type*
              </Label>
              <select
                id="authType"
                value={formData.authType}
                onChange={(e) =>
                  setFormData({ ...formData, authType: e.target.value as CredentialAuthType })
                }
                className="flex w-full h-8 px-3 py-1 text-xs rounded-md border border-input bg-background dark:bg-input/30 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                required
              >
                {getAuthTypesForType(formData.type).map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* LLM Provider selector (only shown for LLM type) */}
          {formData.type === 'llm' && (
            <div className="space-y-1.5">
              <Label htmlFor="llmProvider" className="text-xs">
                LLM Provider*
              </Label>
              <select
                id="llmProvider"
                value={(formData.metadata?.provider as string) || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, provider: e.target.value },
                  })
                }
                className="flex w-full h-8 px-3 py-1 text-xs rounded-md border border-input bg-background dark:bg-input/30 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                required
              >
                <option value="">Select a provider…</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
          )}

          {/* Config fields based on auth type */}
          <div className="p-3 space-y-3 border rounded-lg">
            {/* LLM: plain API key only */}
            {formData.type === 'llm' && (
              <div className="space-y-1.5">
                <Label htmlFor="apiKey" className="text-xs">
                  API Key*
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={(formData.config.apiKey as string) || ''}
                  onChange={(e) => updateConfig('apiKey', e.target.value)}
                  placeholder="Enter your API key"
                  required
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {formData.type !== 'llm' && formData.authType === 'bearer' && (
              <div className="space-y-1.5">
                <Label htmlFor="token" className="text-xs">
                  Token*
                </Label>
                <Input
                  id="token"
                  type="password"
                  value={(formData.config.token as string) || ''}
                  onChange={(e) => updateConfig('token', e.target.value)}
                  placeholder="Enter bearer token"
                  required
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {formData.type !== 'llm' && formData.authType === 'apiKey' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="apiKey" className="text-xs">
                    API Key*
                  </Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={(formData.config.apiKey as string) || ''}
                    onChange={(e) => updateConfig('apiKey', e.target.value)}
                    placeholder="Enter API key"
                    required
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="location" className="text-xs">
                    Location
                  </Label>
                  <select
                    id="location"
                    value={(formData.config.location as string) || 'header'}
                    onChange={(e) => updateConfig('location', e.target.value)}
                    className="flex w-full h-8 px-3 py-1 text-xs rounded-md border border-input bg-background dark:bg-input/30 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="header">Header</option>
                    <option value="query">Query Parameter</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paramName" className="text-xs">
                    Parameter Name
                  </Label>
                  <Input
                    id="paramName"
                    value={(formData.config.paramName as string) || ''}
                    onChange={(e) => updateConfig('paramName', e.target.value)}
                    placeholder="X-API-Key"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="h-8 text-xs"
                  />
                </div>
              </>
            )}

            {formData.authType === 'connectionString' && (
              <div className="space-y-1.5">
                <Label htmlFor="connectionString" className="text-xs">
                  Connection String*
                </Label>
                <Input
                  id="connectionString"
                  type="password"
                  value={(formData.config.connectionString as string) || ''}
                  onChange={(e) => updateConfig('connectionString', e.target.value)}
                  placeholder="postgres://user:pass@host:5432/dbname?sslmode=require"
                  required
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {formData.authType === 'basic' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs">
                    Username*
                  </Label>
                  <Input
                    id="username"
                    value={(formData.config.username as string) || ''}
                    onChange={(e) => updateConfig('username', e.target.value)}
                    placeholder="Enter username"
                    required
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs">
                    Password*
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={(formData.config.password as string) || ''}
                    onChange={(e) => updateConfig('password', e.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="h-8 text-xs"
                  />
                </div>
              </>
            )}

            {formData.authType === 'oauth2' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="accessToken" className="text-xs">
                    Access Token*
                  </Label>
                  <Input
                    id="accessToken"
                    type="password"
                    value={(formData.config.accessToken as string) || ''}
                    onChange={(e) => updateConfig('accessToken', e.target.value)}
                    placeholder="Enter access token"
                    required
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="refreshToken" className="text-xs">
                    Refresh Token
                  </Label>
                  <Input
                    id="refreshToken"
                    type="password"
                    value={(formData.config.refreshToken as string) || ''}
                    onChange={(e) => updateConfig('refreshToken', e.target.value)}
                    placeholder="Enter refresh token"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="h-8 text-xs"
                  />
                </div>
              </>
            )}
          </div>

          {/* Test Section (Always visible for HTTP APIs and LLM providers) */}
          {(formData.type === 'http-api' || formData.type === 'llm') && (
            <div className="border rounded-lg">
              <div className="p-2.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Test Credential</span>
                  <span className="text-[10px] text-muted-foreground">Optional</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Test your credential by making a request to an API endpoint.
                </p>

                <div className="flex gap-2">
                  <select
                    value={testMethod}
                    onChange={(e) => {
                      setTestMethod(e.target.value as typeof testMethod);
                      setTestStatus('idle');
                    }}
                    className="w-20 h-8 px-2 py-1 text-xs rounded-md border border-input bg-background dark:bg-input/30 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <Input
                    id="testUrl"
                    value={testUrl}
                    onChange={(e) => {
                      setTestUrl(e.target.value);
                      setTestStatus('idle');
                    }}
                    placeholder="https://api.example.com/health"
                    className="flex-1 h-8 text-xs"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={runCredentialTest}
                    disabled={!testUrl || testStatus === 'testing'}
                    className="h-8 text-xs"
                  >
                    {testStatus === 'testing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </Button>
                </div>

                {['POST', 'PUT', 'PATCH'].includes(testMethod) && (
                  <div className="space-y-1">
                    <Label htmlFor="testBody" className="text-[10px]">
                      Request Body (JSON)
                    </Label>
                    <Textarea
                      id="testBody"
                      value={testBody}
                      onChange={(e) => {
                        setTestBody(e.target.value);
                        setTestStatus('idle');
                      }}
                      placeholder='{"key": "value"}'
                      rows={3}
                      className="font-mono text-xs"
                      autoComplete="off"
                    />
                  </div>
                )}

                {testStatus === 'success' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-green-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{testMessage}</span>
                  </div>
                )}

                {testStatus === 'error' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-destructive">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{testMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="h-8 text-xs">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="h-8 text-xs">
              {isLoading ? 'Creating...' : 'Create Credential'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
