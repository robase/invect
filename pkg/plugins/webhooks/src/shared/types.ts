/**
 * @invect/webhooks — Shared Types
 *
 * Serializable types shared between backend and frontend.
 * No runtime code, no React, no Node.js dependencies.
 */

// ─── Webhook Trigger ────────────────────────────────────────────────

export type WebhookProvider = 'github' | 'slack' | 'stripe' | 'linear' | 'generic';

export interface WebhookTrigger {
  id: string;
  name: string;
  description?: string;
  webhookPath: string;
  webhookSecret: string;
  provider: WebhookProvider;
  isEnabled: boolean;
  allowedMethods: string;
  flowId?: string;
  nodeId?: string;
  lastTriggeredAt?: string;
  lastPayload?: unknown;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookTriggerInput {
  name: string;
  description?: string;
  provider?: WebhookProvider;
  allowedMethods?: string;
  flowId?: string;
  nodeId?: string;
}

export interface UpdateWebhookTriggerInput {
  name?: string;
  description?: string;
  provider?: WebhookProvider;
  isEnabled?: boolean;
  allowedMethods?: string;
  flowId?: string;
  nodeId?: string;
}

export interface WebhookTriggerInfo {
  webhookPath: string;
  webhookSecret: string;
  fullUrl?: string;
  provider: WebhookProvider;
  isEnabled: boolean;
}

// ─── Webhook Event (for event log) ──────────────────────────────────

export interface WebhookEvent {
  id: string;
  webhookTriggerId: string;
  deliveryId?: string;
  eventType?: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  status: 'success' | 'failed' | 'skipped';
  flowRunId?: string;
  error?: string;
  receivedAt: string;
}
