/**
 * DirectClient — wraps InvectInstance for plugin mode (zero HTTP overhead).
 */

import type { InvectInstance, InvectIdentity } from '@invect/core';
import type { InvectClient, CredentialSummary } from './types';

export class DirectClient implements InvectClient {
  constructor(private readonly invect: InvectInstance) {}

  // ===== Flows =====

  async listFlows(_identity: InvectIdentity | null) {
    return await this.invect.flows.list();
  }

  async getFlow(_identity: InvectIdentity | null, flowId: string) {
    return await this.invect.flows.get(flowId);
  }

  async getFlowDefinition(_identity: InvectIdentity | null, flowId: string) {
    return await this.invect.versions.get(flowId, 'latest');
  }

  async createFlow(_identity: InvectIdentity | null, data: { name: string; description?: string }) {
    return await this.invect.flows.create(data);
  }

  async updateFlow(
    _identity: InvectIdentity | null,
    flowId: string,
    data: { name?: string; description?: string },
  ) {
    return await this.invect.flows.update(flowId, data);
  }

  async deleteFlow(_identity: InvectIdentity | null, flowId: string) {
    await this.invect.flows.delete(flowId);
  }

  async validateFlow(_identity: InvectIdentity | null, flowId: string, definition: unknown) {
    const result = await this.invect.flows.validate(flowId, definition);
    return {
      valid: result.isValid,
      errors: result.isValid ? undefined : result.errors?.map((e) => e.message),
    };
  }

  // ===== Versions =====

  async listVersions(_identity: InvectIdentity | null, flowId: string) {
    return await this.invect.versions.list(flowId);
  }

  async getVersion(
    _identity: InvectIdentity | null,
    flowId: string,
    version: string | number | 'latest',
  ) {
    return await this.invect.versions.get(flowId, version);
  }

  async publishVersion(_identity: InvectIdentity | null, flowId: string, data: unknown) {
    return await this.invect.versions.create(
      flowId,
      data as Parameters<InvectInstance['versions']['create']>[1],
    );
  }

  // ===== Runs =====

  async startRun(
    _identity: InvectIdentity | null,
    flowId: string,
    inputs?: Record<string, unknown>,
  ) {
    return await this.invect.runs.start(flowId, inputs);
  }

  async runToNode(
    _identity: InvectIdentity | null,
    flowId: string,
    nodeId: string,
    inputs?: Record<string, unknown>,
  ) {
    return await this.invect.runs.executeToNode(flowId, nodeId, inputs);
  }

  async listRuns(_identity: InvectIdentity | null, flowId: string) {
    return await this.invect.runs.listByFlowId(flowId);
  }

  async getRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.invect.runs.get(flowRunId);
  }

  async cancelRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.invect.runs.cancel(flowRunId);
  }

  async pauseRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.invect.runs.pause(flowRunId);
  }

  async resumeRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.invect.runs.resume(flowRunId);
  }

  // ===== Debug =====

  async getNodeExecutions(_identity: InvectIdentity | null, flowRunId: string) {
    const result = await this.invect.runs.getNodeExecutions(flowRunId);
    return result.data;
  }

  async testNode(
    _identity: InvectIdentity | null,
    nodeType: string,
    params: Record<string, unknown>,
    inputData?: Record<string, unknown>,
  ) {
    return await this.invect.testing.testNode(nodeType, params, inputData);
  }

  async testJsExpression(
    _identity: InvectIdentity | null,
    expression: string,
    context: Record<string, unknown>,
  ) {
    return await this.invect.testing.testJsExpression({ expression, context });
  }

  async testMapper(
    _identity: InvectIdentity | null,
    expression: string,
    incomingData: Record<string, unknown>,
  ) {
    return await this.invect.testing.testMapper({ expression, incomingData });
  }

  // ===== Credentials =====

  async listCredentials(_identity: InvectIdentity | null): Promise<CredentialSummary[]> {
    const creds = await this.invect.credentials.list();
    return creds.map((c) => ({
      id: c.id,
      name: c.name,
      type: String(c.type),
      provider: 'provider' in c ? String((c as Record<string, unknown>).provider ?? '') : undefined,
      lastUsedAt: c.lastUsedAt ? String(c.lastUsedAt) : undefined,
      createdAt: c.createdAt ? String(c.createdAt) : undefined,
    }));
  }

  async testCredential(_identity: InvectIdentity | null, credentialId: string) {
    return await this.invect.credentials.test(credentialId);
  }

  // ===== Triggers =====

  async listTriggers(_identity: InvectIdentity | null, flowId: string) {
    return await this.invect.triggers.list(flowId);
  }

  async getTrigger(_identity: InvectIdentity | null, triggerId: string) {
    return await this.invect.triggers.get(triggerId);
  }

  async createTrigger(_identity: InvectIdentity | null, input: unknown) {
    return await this.invect.triggers.create(
      input as Parameters<InvectInstance['triggers']['create']>[0],
    );
  }

  async updateTrigger(_identity: InvectIdentity | null, triggerId: string, input: unknown) {
    return await this.invect.triggers.update(
      triggerId,
      input as Parameters<InvectInstance['triggers']['update']>[1],
    );
  }

  async deleteTrigger(_identity: InvectIdentity | null, triggerId: string) {
    await this.invect.triggers.delete(triggerId);
  }

  // ===== Node Reference =====

  async listProviders(_identity: InvectIdentity | null) {
    return this.invect.actions.getProviders();
  }

  async listAvailableNodes(_identity: InvectIdentity | null) {
    return this.invect.actions.getAvailableNodes();
  }
}
