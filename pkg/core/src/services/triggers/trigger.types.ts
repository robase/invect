/**
 * Trigger Types
 *
 * Shared type definitions for the flow trigger system.
 */

/**
 * Trigger type discriminant — matches the action ID suffix.
 */
export type TriggerType = 'manual' | 'webhook' | 'cron';

/**
 * The flow_triggers registration record as exposed to services.
 */
export interface FlowTriggerRegistration {
  id: string;
  flowId: string;
  nodeId: string;
  type: TriggerType;
  isEnabled: boolean;

  // Webhook-specific
  webhookPath?: string | null;
  webhookSecret?: string | null;

  // Cron-specific
  cronExpression?: string | null;
  cronTimezone?: string | null;

  lastTriggeredAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Input for creating a new trigger registration.
 */
export interface CreateTriggerInput {
  flowId: string;
  nodeId: string;
  type: TriggerType;
  isEnabled?: boolean;

  webhookPath?: string;
  webhookSecret?: string;

  cronExpression?: string;
  cronTimezone?: string;
}

/**
 * Input for updating an existing trigger registration.
 */
export interface UpdateTriggerInput {
  isEnabled?: boolean;

  webhookPath?: string;
  webhookSecret?: string;

  cronExpression?: string;
  cronTimezone?: string;

  lastTriggeredAt?: Date | string;
}

/**
 * Options for executing a flow via a trigger.
 */
export interface TriggerExecutionOptions {
  triggerType: TriggerType;
  triggerNodeId: string;
  triggerId?: string;
  triggerData: Record<string, unknown>;
}
