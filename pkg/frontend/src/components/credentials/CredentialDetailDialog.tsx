import React, { useState } from 'react';
import {
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Database,
  Globe,
  Loader2,
  PlayCircle,
  Bot,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { ProviderIcon } from '../shared/ProviderIcon';
import { getCredentialBranding, getCredentialProviderLabel } from '../../utils/credentialBranding';
import { WebhookTabContent } from './WebhookTabContent';
import {
  AUTH_TYPE_CONFIG,
  formatFullDate,
  isTokenExpired,
  getAuthTypesForType,
} from './credential-utils';
import type {
  Credential,
  UpdateCredentialInput,
  CredentialAuthType,
  CredentialType,
} from '../../api/types';

type DetailSection = 'details' | 'edit' | 'webhook';

interface CredentialDetailDialogProps {
  credential: Credential | null;
  onClose: () => void;
  onDelete: (credential: Credential) => void;
  onTest: (id: string) => void;
  testingId: string | null;
  testResult: { success: boolean; error?: string } | null;
  onUpdate: (id: string, data: UpdateCredentialInput) => void;
  isUpdating: boolean;
  portalContainer: HTMLElement | null;
}

export function CredentialDetailDialog({
  credential,
  onClose,
  onDelete,
  onTest,
  testingId,
  testResult,
  onUpdate,
  isUpdating,
  portalContainer,
}: CredentialDetailDialogProps) {
  const [detailSection, setDetailSection] = useState<DetailSection>('details');
  const [editFormData, setEditFormData] = useState<UpdateCredentialInput>({});

  // Reset state when credential changes
  React.useEffect(() => {
    if (credential) {
      setDetailSection('details');
      setEditFormData({
        name: credential.name,
        type: credential.type,
        authType: credential.authType,
        description: credential.description,
        isActive: credential.isActive,
        config: credential.config || {},
        metadata: credential.metadata || {},
      });
    }
  }, [credential?.id]);

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credential) return;
    onUpdate(credential.id, editFormData);
    setDetailSection('details');
  };

  const updateConfig = (key: string, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      config: { ...(prev.config || {}), [key]: value },
    }));
  };

  if (!credential) return null;

  const iconInfo = getCredentialBranding(credential);
  const authConfig = AUTH_TYPE_CONFIG[credential.authType];
  const expired = isTokenExpired(credential);

  return (
    <Dialog open={!!credential} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        container={portalContainer}
        className="max-w-2xl h-160 flex flex-col gap-0 p-0 overflow-hidden"
      >
        <div className="flex flex-col h-full">
          {/* Fixed header */}
          <div className="px-6 pt-6 pb-0 shrink-0">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/60 shrink-0">
                  <ProviderIcon
                    providerId={iconInfo.providerId}
                    icon={iconInfo.icon}
                    className="w-6 h-6"
                  />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate">{credential.name}</DialogTitle>
                  <DialogDescription className="truncate">
                    {getCredentialProviderLabel(credential) ??
                      credential.description ??
                      'Manage this credential'}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Section nav */}
            <div className="flex gap-1 border-b border-border -mx-6 px-6 mt-4">
              {(['details', 'edit', 'webhook'] as const).map((section) => (
                <button
                  key={section}
                  onClick={() => setDetailSection(section)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    detailSection === section
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {section === 'details' && 'Overview'}
                  {section === 'edit' && 'Edit'}
                  {section === 'webhook' && 'Webhook'}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable tab content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* ── Details section ── */}
            {detailSection === 'details' && (
              <DetailsSection
                credential={credential}
                authConfig={authConfig}
                expired={expired}
                onTest={onTest}
                testingId={testingId}
                testResult={testResult}
                onEdit={() => setDetailSection('edit')}
                onDelete={() => onDelete(credential)}
              />
            )}

            {/* ── Edit section ── */}
            {detailSection === 'edit' && (
              <EditSection
                editFormData={editFormData}
                setEditFormData={setEditFormData}
                updateConfig={updateConfig}
                onSubmit={handleEditSubmit}
                onCancel={() => setDetailSection('details')}
                isUpdating={isUpdating}
              />
            )}

            {/* ── Webhook section ── */}
            {detailSection === 'webhook' && <WebhookTabContent credentialId={credential.id} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Details Section ────────────────────────────────────────────────────

function DetailsSection({
  credential,
  authConfig,
  expired,
  onTest,
  testingId,
  testResult,
  onEdit,
  onDelete,
}: {
  credential: Credential;
  authConfig: { label: string; color: string } | undefined;
  expired: boolean;
  onTest: (id: string) => void;
  testingId: string | null;
  testResult: { success: boolean; error?: string } | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-5 pt-4">
      {/* Status + meta */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Status
          </p>
          <div className="flex items-center gap-1.5">
            {expired ? (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Token Expired
              </Badge>
            ) : credential.isActive ? (
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Auth Type
          </p>
          <Badge
            variant="secondary"
            className={authConfig?.color ?? 'bg-muted text-muted-foreground'}
          >
            {authConfig?.label ?? credential.authType}
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</p>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            {credential.type === 'database' ? (
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
            ) : credential.type === 'llm' ? (
              <Bot className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            {credential.type === 'database'
              ? 'Database'
              : credential.type === 'llm'
                ? 'LLM Provider'
                : 'HTTP API'}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Last Used
          </p>
          <p className="text-sm text-foreground">{formatFullDate(credential.lastUsedAt)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Created
          </p>
          <p className="text-sm text-foreground">{formatFullDate(credential.createdAt)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Updated
          </p>
          <p className="text-sm text-foreground">{formatFullDate(credential.updatedAt)}</p>
        </div>
      </div>

      {credential.description && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Description
          </p>
          <p className="text-sm text-foreground">{credential.description}</p>
        </div>
      )}

      {/* Test connection */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Test Connection</p>
            <p className="text-xs text-muted-foreground">
              Verify this credential is working correctly.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTest(credential.id)}
            disabled={testingId === credential.id}
          >
            {testingId === credential.id ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                Test
              </>
            )}
          </Button>
        </div>
        {testResult && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}
          >
            {testResult.success
              ? '✓ Connection successful'
              : `✗ Failed: ${testResult.error ?? 'Unknown error'}`}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Edit className="w-3.5 h-3.5 mr-1.5" />
          Edit Credential
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

// ── Edit Section ───────────────────────────────────────────────────────

function EditSection({
  editFormData,
  setEditFormData,
  updateConfig,
  onSubmit,
  onCancel,
  isUpdating,
}: {
  editFormData: UpdateCredentialInput;
  setEditFormData: React.Dispatch<React.SetStateAction<UpdateCredentialInput>>;
  updateConfig: (key: string, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isUpdating: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="edit-name">Name *</Label>
        <Input
          id="edit-name"
          value={editFormData.name ?? ''}
          onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="edit-type">Credential Type</Label>
          <select
            id="edit-type"
            value={editFormData.type ?? 'http-api'}
            onChange={(e) => {
              const newType = e.target.value as CredentialType;
              if (newType === 'llm') {
                setEditFormData({ ...editFormData, type: newType, authType: 'apiKey' });
              } else {
                const available = getAuthTypesForType(newType);
                const nextAuthType = available.some((t) => t.value === editFormData.authType)
                  ? editFormData.authType
                  : available[0]?.value || 'basic';
                setEditFormData({ ...editFormData, type: newType, authType: nextAuthType });
              }
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="http-api">HTTP API</option>
            <option value="llm">LLM Provider</option>
            <option value="database">Database</option>
          </select>
        </div>
        {editFormData.type !== 'llm' && (
          <div className="space-y-2">
            <Label htmlFor="edit-authType">Auth Type</Label>
            <select
              id="edit-authType"
              value={editFormData.authType ?? 'bearer'}
              onChange={(e) =>
                setEditFormData({
                  ...editFormData,
                  authType: e.target.value as CredentialAuthType,
                })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              {getAuthTypesForType(editFormData.type || 'http-api').map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="edit-isActive"
          checked={editFormData.isActive ?? true}
          onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
        <Label htmlFor="edit-isActive" className="cursor-pointer">
          Active
        </Label>
      </div>

      {/* LLM Provider selector */}
      {editFormData.type === 'llm' && (
        <div className="space-y-2">
          <Label htmlFor="edit-llmProvider">LLM Provider</Label>
          <select
            id="edit-llmProvider"
            value={(editFormData.metadata?.provider as string) || ''}
            onChange={(e) =>
              setEditFormData({
                ...editFormData,
                metadata: { ...editFormData.metadata, provider: e.target.value },
              })
            }
            className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="">Select a provider…</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
      )}

      {/* Config fields */}
      <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Credentials
          </h4>
          <span className="text-[10px] text-muted-foreground">Leave empty to keep current</span>
        </div>

        {editFormData.type === 'llm' && (
          <div className="space-y-2">
            <Label htmlFor="edit-apiKey">API Key</Label>
            <Input
              id="edit-apiKey"
              type="password"
              value={(editFormData.config?.apiKey as string) || ''}
              onChange={(e) => updateConfig('apiKey', e.target.value)}
              placeholder="Enter API key or leave empty to keep current"
            />
          </div>
        )}

        {editFormData.type !== 'llm' && editFormData.authType === 'bearer' && (
          <div className="space-y-2">
            <Label htmlFor="edit-token">Token</Label>
            <Input
              id="edit-token"
              type="password"
              value={(editFormData.config?.token as string) || ''}
              onChange={(e) => updateConfig('token', e.target.value)}
              placeholder="Enter bearer token"
            />
          </div>
        )}

        {editFormData.type !== 'llm' && editFormData.authType === 'apiKey' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="edit-apiKey">API Key</Label>
              <Input
                id="edit-apiKey"
                type="password"
                value={(editFormData.config?.apiKey as string) || ''}
                onChange={(e) => updateConfig('apiKey', e.target.value)}
                placeholder="Enter API key"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-location">Location</Label>
                <select
                  id="edit-location"
                  value={(editFormData.config?.location as string) || 'header'}
                  onChange={(e) => updateConfig('location', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-input/30 px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="header">Header</option>
                  <option value="query">Query Parameter</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-paramName">Parameter Name</Label>
                <Input
                  id="edit-paramName"
                  value={(editFormData.config?.paramName as string) || ''}
                  onChange={(e) => updateConfig('paramName', e.target.value)}
                  placeholder="X-API-Key"
                />
              </div>
            </div>
          </>
        )}

        {editFormData.authType === 'connectionString' && (
          <div className="space-y-2">
            <Label htmlFor="edit-connStr">Connection String</Label>
            <Input
              id="edit-connStr"
              type="password"
              value={(editFormData.config?.connectionString as string) || ''}
              onChange={(e) => updateConfig('connectionString', e.target.value)}
              placeholder="postgres://user:pass@host:5432/db"
            />
          </div>
        )}

        {editFormData.authType === 'basic' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                value={(editFormData.config?.username as string) || ''}
                onChange={(e) => updateConfig('username', e.target.value)}
                placeholder="Username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Password</Label>
              <Input
                id="edit-password"
                type="password"
                value={(editFormData.config?.password as string) || ''}
                onChange={(e) => updateConfig('password', e.target.value)}
                placeholder="Password"
              />
            </div>
          </div>
        )}

        {editFormData.authType === 'oauth2' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-accessToken">Access Token</Label>
              <Input
                id="edit-accessToken"
                type="password"
                value={(editFormData.config?.accessToken as string) || ''}
                onChange={(e) => updateConfig('accessToken', e.target.value)}
                placeholder="Access token"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-refreshToken">Refresh Token</Label>
              <Input
                id="edit-refreshToken"
                type="password"
                value={(editFormData.config?.refreshToken as string) || ''}
                onChange={(e) => updateConfig('refreshToken', e.target.value)}
                placeholder="Refresh token"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea
          id="edit-description"
          value={editFormData.description || ''}
          onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
          placeholder="Optional description"
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isUpdating}>
          {isUpdating ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
