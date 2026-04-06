/**
 * InvectClient — abstraction over Invect API access.
 *
 * Both DirectClient (plugin mode) and HttpClient (CLI mode) implement this
 * interface so tool handlers remain transport-agnostic.
 *
 * Return types are intentionally `unknown` for most operations since the
 * MCP layer JSON-stringifies everything. This avoids mapping internal
 * types to a duplicated schema.
 */

import type { InvectIdentity } from '@invect/core';

/** Sanitized credential (no secrets) */
export interface CredentialSummary {
  id: string;
  name: string;
  type: string;
  provider?: string;
  lastUsedAt?: string;
  createdAt?: string;
}

export interface InvectClient {
  // ===== Flows =====
  listFlows(identity: InvectIdentity | null): Promise<unknown>;
  getFlow(identity: InvectIdentity | null, flowId: string): Promise<unknown>;
  getFlowDefinition(identity: InvectIdentity | null, flowId: string): Promise<unknown>;
  createFlow(
    identity: InvectIdentity | null,
    data: { name: string; description?: string },
  ): Promise<unknown>;
  updateFlow(
    identity: InvectIdentity | null,
    flowId: string,
    data: { name?: string; description?: string },
  ): Promise<unknown>;
  deleteFlow(identity: InvectIdentity | null, flowId: string): Promise<void>;
  validateFlow(
    identity: InvectIdentity | null,
    flowId: string,
    definition: unknown,
  ): Promise<{ valid: boolean; errors?: string[] }>;

  // ===== Versions =====
  listVersions(identity: InvectIdentity | null, flowId: string): Promise<unknown>;
  getVersion(
    identity: InvectIdentity | null,
    flowId: string,
    version: string | number | 'latest',
  ): Promise<unknown>;
  publishVersion(identity: InvectIdentity | null, flowId: string, data: unknown): Promise<unknown>;

  // ===== Runs =====
  startRun(
    identity: InvectIdentity | null,
    flowId: string,
    inputs?: Record<string, unknown>,
  ): Promise<unknown>;
  runToNode(
    identity: InvectIdentity | null,
    flowId: string,
    nodeId: string,
    inputs?: Record<string, unknown>,
  ): Promise<unknown>;
  listRuns(identity: InvectIdentity | null, flowId: string): Promise<unknown>;
  getRun(identity: InvectIdentity | null, flowRunId: string): Promise<unknown>;
  cancelRun(identity: InvectIdentity | null, flowRunId: string): Promise<{ message: string }>;
  pauseRun(identity: InvectIdentity | null, flowRunId: string): Promise<{ message: string }>;
  resumeRun(identity: InvectIdentity | null, flowRunId: string): Promise<{ message: string }>;

  // ===== Debug =====
  getNodeExecutions(identity: InvectIdentity | null, flowRunId: string): Promise<unknown[]>;
  testNode(
    identity: InvectIdentity | null,
    nodeType: string,
    params: Record<string, unknown>,
    inputData?: Record<string, unknown>,
  ): Promise<{ success: boolean; output?: unknown; error?: string }>;
  testJsExpression(
    identity: InvectIdentity | null,
    expression: string,
    context: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }>;
  testMapper(
    identity: InvectIdentity | null,
    expression: string,
    incomingData: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }>;
  getDashboardStats(identity: InvectIdentity | null): Promise<unknown>;

  // ===== Credentials =====
  listCredentials(identity: InvectIdentity | null): Promise<CredentialSummary[]>;
  testCredential(
    identity: InvectIdentity | null,
    credentialId: string,
  ): Promise<{ success: boolean; error?: string }>;

  // ===== Triggers =====
  listTriggers(identity: InvectIdentity | null, flowId: string): Promise<unknown[]>;
  getTrigger(identity: InvectIdentity | null, triggerId: string): Promise<unknown>;
  createTrigger(identity: InvectIdentity | null, input: unknown): Promise<unknown>;
  updateTrigger(
    identity: InvectIdentity | null,
    triggerId: string,
    input: unknown,
  ): Promise<unknown>;
  deleteTrigger(identity: InvectIdentity | null, triggerId: string): Promise<void>;

  // ===== Node Reference =====
  listProviders(identity: InvectIdentity | null): Promise<unknown[]>;
  listAvailableNodes(identity: InvectIdentity | null): Promise<unknown[]>;
}
