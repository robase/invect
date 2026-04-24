/**
 * DirectClient — wraps InvectInstance for plugin mode (zero HTTP overhead).
 */

import type { InvectInstance } from '@invect/core';
import { emitSdkSource, SdkEmitError } from '@invect/primitives';
import type {
  InvectClient,
  CredentialSummary,
  FlowSdkSourceResult,
  GetFlowSdkSourceOptions,
} from './types';

function toCredentialSummary(c: Record<string, unknown>): CredentialSummary {
  const metadata = (c.metadata ?? undefined) as Record<string, unknown> | undefined;
  const providerFromTop = typeof c.provider === 'string' ? c.provider : undefined;
  const providerFromMeta = typeof metadata?.provider === 'string' ? metadata.provider : undefined;
  return {
    id: String(c.id),
    name: String(c.name),
    type: String(c.type),
    provider: providerFromTop ?? providerFromMeta,
    lastUsedAt: c.lastUsedAt ? String(c.lastUsedAt) : undefined,
    createdAt: c.createdAt ? String(c.createdAt) : undefined,
    expiresAt: c.expiresAt ? String(c.expiresAt) : undefined,
  };
}

export class DirectClient implements InvectClient {
  constructor(private readonly invect: InvectInstance) {}

  // ===== Flows =====

  async listFlows() {
    return await this.invect.flows.list();
  }

  async getFlow(flowId: string) {
    return await this.invect.flows.get(flowId);
  }

  async getFlowDefinition(flowId: string) {
    return await this.invect.versions.get(flowId, 'latest');
  }

  async getFlowSdkSource(
    flowId: string,
    options: GetFlowSdkSourceOptions = {},
  ): Promise<FlowSdkSourceResult> {
    const requestedVersion = options.version ?? 'latest';
    const version = await this.invect.versions.get(flowId, requestedVersion);
    if (!version) {
      throw new Error(`Flow ${flowId} has no version "${requestedVersion}"`);
    }
    const def = (version as { invectDefinition?: unknown }).invectDefinition;
    if (!def) {
      throw new Error(`Version "${requestedVersion}" of flow ${flowId} has no invectDefinition`);
    }
    try {
      const result = emitSdkSource(def as Parameters<typeof emitSdkSource>[0], {
        flowName: options.flowName,
        sdkImport: options.sdkImport,
      });
      return {
        code: result.code,
        importedBuilders: result.importedBuilders,
        flowName: options.flowName ?? 'myFlow',
        version: (version as { version: string | number }).version,
      };
    } catch (err) {
      if (err instanceof SdkEmitError) {
        throw new Error(
          err.nodeId
            ? `Cannot emit SDK source (node ${err.nodeId}): ${err.message}`
            : `Cannot emit SDK source: ${err.message}`,
        );
      }
      throw err;
    }
  }

  async createFlow(data: { name: string; description?: string }) {
    return await this.invect.flows.create(data);
  }

  async updateFlow(flowId: string, data: { name?: string; description?: string }) {
    return await this.invect.flows.update(flowId, data);
  }

  async deleteFlow(flowId: string) {
    await this.invect.flows.delete(flowId);
  }

  async validateFlow(flowId: string, definition: unknown) {
    try {
      const result = await this.invect.flows.validate(flowId, definition);
      if (result.isValid) {
        return { valid: true };
      }
      return {
        valid: false,
        errors: result.errors.map((e) => e.message),
      };
    } catch (err) {
      const issues = extractZodIssueMessages(err);
      if (issues) {
        return { valid: false, errors: issues };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, errors: [message] };
    }
  }

  // ===== Versions =====

  async listVersions(flowId: string) {
    return await this.invect.versions.list(flowId);
  }

  async getVersion(flowId: string, version: string | number | 'latest') {
    return await this.invect.versions.get(flowId, version);
  }

  async publishVersion(flowId: string, data: unknown) {
    return await this.invect.versions.create(
      flowId,
      data as Parameters<InvectInstance['versions']['create']>[1],
    );
  }

  // ===== Runs =====

  async startRun(flowId: string, inputs?: Record<string, unknown>) {
    return await this.invect.runs.start(flowId, inputs);
  }

  async startRunAsync(flowId: string, inputs?: Record<string, unknown>) {
    return await this.invect.runs.startAsync(flowId, inputs);
  }

  async runToNode(flowId: string, nodeId: string, inputs?: Record<string, unknown>) {
    return await this.invect.runs.executeToNode(flowId, nodeId, inputs);
  }

  async listRuns(flowId: string) {
    return await this.invect.runs.listByFlowId(flowId);
  }

  async getRun(flowRunId: string) {
    return await this.invect.runs.get(flowRunId);
  }

  async cancelRun(flowRunId: string) {
    return await this.invect.runs.cancel(flowRunId);
  }

  async pauseRun(flowRunId: string) {
    return await this.invect.runs.pause(flowRunId);
  }

  async resumeRun(flowRunId: string) {
    return await this.invect.runs.resume(flowRunId);
  }

  // ===== Debug =====

  async getNodeExecutions(flowRunId: string) {
    const result = await this.invect.runs.getNodeExecutions(flowRunId);
    return result.data;
  }

  async listNodeExecutions() {
    const result = await this.invect.runs.listNodeExecutions();
    return result.data;
  }

  async getToolExecutions(nodeExecutionId: string) {
    return await this.invect.runs.getToolExecutionsByNodeExecutionId(nodeExecutionId);
  }

  async testNode(
    nodeType: string,
    params: Record<string, unknown>,
    inputData?: Record<string, unknown>,
  ) {
    return await this.invect.testing.testNode(nodeType, params, inputData);
  }

  async testJsExpression(expression: string, context: Record<string, unknown>) {
    return await this.invect.testing.testJsExpression({ expression, context });
  }

  async testMapper(expression: string, incomingData: Record<string, unknown>) {
    return await this.invect.testing.testMapper({ expression, incomingData });
  }

  // ===== Credentials =====

  async listCredentials(): Promise<CredentialSummary[]> {
    const creds = await this.invect.credentials.list();
    return creds.map((c) => toCredentialSummary(c as unknown as Record<string, unknown>));
  }

  async testCredential(credentialId: string) {
    return await this.invect.credentials.test(credentialId);
  }

  async listOAuth2Providers() {
    return this.invect.credentials.getOAuth2Providers();
  }

  // ===== Triggers =====

  async listTriggers(flowId: string) {
    return await this.invect.triggers.list(flowId);
  }

  async getTrigger(triggerId: string) {
    const trigger = await this.invect.triggers.get(triggerId);
    if (trigger === null) {
      throw new Error(`Trigger ${triggerId} not found`);
    }
    return trigger;
  }

  async createTrigger(input: unknown) {
    return await this.invect.triggers.create(
      input as Parameters<InvectInstance['triggers']['create']>[0],
    );
  }

  async updateTrigger(triggerId: string, input: unknown) {
    return await this.invect.triggers.update(
      triggerId,
      input as Parameters<InvectInstance['triggers']['update']>[1],
    );
  }

  async deleteTrigger(triggerId: string) {
    await this.invect.triggers.delete(triggerId);
  }

  async syncTriggers(flowId: string, definition: unknown) {
    return await this.invect.triggers.sync(
      flowId,
      definition as Parameters<InvectInstance['triggers']['sync']>[1],
    );
  }

  async executeCronTrigger(triggerId: string) {
    return await this.invect.triggers.executeCron(triggerId);
  }

  async listEnabledCronTriggers() {
    return await this.invect.triggers.getEnabledCron();
  }

  // ===== Node Reference =====

  async listProviders() {
    return this.invect.actions.getProviders();
  }

  async listAvailableNodes() {
    return this.invect.actions.getAvailableNodes();
  }

  async listNodesForProvider(providerId: string) {
    return this.invect.actions.getForProvider(providerId);
  }

  async resolveFieldOptions(actionId: string, fieldName: string, deps: Record<string, unknown>) {
    return await this.invect.actions.resolveFieldOptions(actionId, fieldName, deps);
  }

  // ===== Agent =====

  async listAgentTools() {
    return this.invect.agent.getTools();
  }
}

function extractZodIssueMessages(err: unknown): string[] | null {
  if (!err || typeof err !== 'object') {
    return null;
  }
  const anyErr = err as Record<string, unknown>;
  const issues = anyErr.issues;
  if (!Array.isArray(issues)) {
    return null;
  }
  return issues.map((i) => {
    if (typeof i !== 'object' || i === null) {
      return String(i);
    }
    const rec = i as Record<string, unknown>;
    const path = Array.isArray(rec.path) ? rec.path.join('.') : '';
    const message = typeof rec.message === 'string' ? rec.message : 'invalid';
    return path ? `${path}: ${message}` : message;
  });
}
