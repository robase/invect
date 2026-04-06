/**
 * ChatSettingsPanel — Inline panel for configuring chat assistant settings.
 *
 * Renders within the ChatPanel as a slide-over view when the user clicks
 * the settings gear icon. Settings are persisted to localStorage.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ArrowLeft, Settings2, Bot, Key, Plus } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { useChatStore } from './chat.store';
import { useCredentials, useCreateCredential } from '~/api/credentials.api';
import { CreateCredentialModal } from '~/components/credentials/CreateCredentialModal';
import type { CreateCredentialInput } from '~/api/types';

// =====================================
// ChatSettingsPanel (main export)
// =====================================

interface ChatSettingsPanelProps {
  onClose: () => void;
}

export function ChatSettingsPanel({ onClose }: ChatSettingsPanelProps) {
  const settings = useChatStore((s) => s.settings);
  const updateSettings = useChatStore((s) => s.updateSettings);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Back to chat">
          <ArrowLeft className="size-4" />
        </Button>
        <Settings2 className="size-4 text-primary" />
        <span className="text-sm font-medium">Chat Settings</span>
      </div>

      {/* Description */}
      <div className="px-4 py-2 text-xs border-b border-border text-muted-foreground bg-muted/20">
        Configure how the AI assistant behaves. Settings are saved locally in your browser.
      </div>

      {/* Settings */}
      <div className="flex flex-col gap-6 p-4">
        {/* LLM Credential */}
        <LlmCredentialSetting
          credentialId={settings.credentialId}
          onChange={(credentialId) => updateSettings({ credentialId })}
        />

        {/* Max Steps */}
        <MaxStepsSetting
          value={settings.maxSteps}
          onChange={(maxSteps) => updateSettings({ maxSteps })}
        />
      </div>
    </div>
  );
}

// =====================================
// LlmCredentialSetting
// =====================================

function LlmCredentialSetting({
  credentialId,
  onChange,
}: {
  credentialId: string | null;
  onChange: (credentialId: string | null) => void;
}) {
  // Fetch only active LLM credentials
  const { data: credentials = [], isLoading } = useCredentials({ type: 'llm', isActive: true });
  const createCredentialMutation = useCreateCredential();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const hasSelectedCredential = useMemo(
    () => Boolean(credentialId && credentials.some((credential) => credential.id === credentialId)),
    [credentialId, credentials],
  );

  useEffect(() => {
    if (credentialId && !isLoading && !hasSelectedCredential) {
      onChange(null);
    }
  }, [credentialId, hasSelectedCredential, isLoading, onChange]);

  const handleCredentialChange = useCallback(
    (value: string) => {
      if (value === '__none__') {
        onChange(null);
      } else {
        onChange(value);
      }
    },
    [onChange],
  );

  const handleCreateCredential = useCallback(
    (data: CreateCredentialInput) => {
      createCredentialMutation.mutate(data, {
        onSuccess: (created) => {
          setShowCreateModal(false);
          // Auto-select the newly created credential
          onChange(created.id);
        },
      });
    },
    [createCredentialMutation, onChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-primary" />
        <label className="text-sm font-medium text-foreground">LLM Credential</label>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Select the API credential the assistant uses. Only credentials with type{' '}
        <span className="font-medium">LLM Provider</span> are shown.
      </p>

      {/* Credential selector */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <Key className="size-3" />
          Credential
        </label>
        {isLoading ? (
          <div className="py-2 text-xs text-muted-foreground">Loading credentials…</div>
        ) : credentials.length === 0 ? (
          <div className="p-4 space-y-3 text-xs border border-dashed rounded-lg border-muted-foreground/30 bg-muted/30 text-muted-foreground">
            <div className="space-y-1">
              <p className="font-medium text-foreground">No LLM credentials yet</p>
              <p>Add an API key for OpenAI, Anthropic, or OpenRouter to get started.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="size-3.5" />
              New LLM Credential
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Select
              value={hasSelectedCredential ? (credentialId ?? '__none__') : '__none__'}
              onValueChange={handleCredentialChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a credential…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">None selected</span>
                </SelectItem>
                {credentials.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon-sm"
              title="New LLM credential"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Inline credential creation modal */}
      <CreateCredentialModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateCredential}
        isLoading={createCredentialMutation.isPending}
        initialType="llm"
      />
    </div>
  );
}

// =====================================
// MaxStepsSetting
// =====================================

function MaxStepsSetting({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));

  const handleBlur = useCallback(() => {
    const num = parseInt(localValue, 10);
    if (!isNaN(num) && num >= 1 && num <= 200) {
      onChange(num);
      setLocalValue(String(num));
    } else {
      // Reset to current value on invalid input
      setLocalValue(String(value));
    }
  }, [localValue, value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground" htmlFor="max-steps">
          Max tool steps per message
        </label>
        <input
          id="max-steps"
          type="number"
          min={1}
          max={200}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-16 h-8 px-2 text-sm text-center border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Maximum number of tool-calling iterations the assistant can perform per message. Higher
        values let the assistant handle more complex multi-step tasks but take longer.
        <br />
        <span className="text-muted-foreground/70">Default: 50 · Range: 1-200</span>
      </p>

      {/* Quick presets */}
      <div className="flex items-center gap-2 pt-1">
        <span className="mr-1 text-xs text-muted-foreground">Presets:</span>
        {[25, 50, 100, 150, 200].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              onChange(preset);
              setLocalValue(String(preset));
            }}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              value === preset
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
