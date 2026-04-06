/**
 * HttpClient — wraps Invect HTTP API for CLI/stdio mode.
 */

import type { InvectIdentity } from '@invect/core';
import type { InvectClient, CredentialSummary } from './types';

export class HttpClient implements InvectClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${method} ${path}: ${text}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }

  /** Health check — throws if API is unreachable */
  async healthCheck(): Promise<void> {
    await this.request('GET', '/health');
  }

  // ===== Flows =====

  async listFlows(_identity: InvectIdentity | null) {
    return await this.request<{ data: unknown[]; total: number }>('GET', '/flows');
  }

  async getFlow(_identity: InvectIdentity | null, flowId: string) {
    return await this.request('GET', `/flows/${encodeURIComponent(flowId)}`);
  }

  async getFlowDefinition(_identity: InvectIdentity | null, flowId: string) {
    return await this.request('GET', `/flows/${encodeURIComponent(flowId)}/versions/latest`);
  }

  async createFlow(_identity: InvectIdentity | null, data: { name: string; description?: string }) {
    return await this.request('POST', '/flows', data);
  }

  async updateFlow(
    _identity: InvectIdentity | null,
    flowId: string,
    data: { name?: string; description?: string },
  ) {
    return await this.request('PATCH', `/flows/${encodeURIComponent(flowId)}`, data);
  }

  async deleteFlow(_identity: InvectIdentity | null, flowId: string) {
    await this.request('DELETE', `/flows/${encodeURIComponent(flowId)}`);
  }

  async validateFlow(_identity: InvectIdentity | null, flowId: string, definition: unknown) {
    return await this.request<{ valid: boolean; errors?: string[] }>(
      'POST',
      `/flows/${encodeURIComponent(flowId)}/validate`,
      definition,
    );
  }

  // ===== Versions =====

  async listVersions(_identity: InvectIdentity | null, flowId: string) {
    return await this.request<{ data: unknown[]; total: number }>(
      'GET',
      `/flows/${encodeURIComponent(flowId)}/versions`,
    );
  }

  async getVersion(
    _identity: InvectIdentity | null,
    flowId: string,
    version: string | number | 'latest',
  ) {
    return await this.request(
      'GET',
      `/flows/${encodeURIComponent(flowId)}/versions/${encodeURIComponent(String(version))}`,
    );
  }

  async publishVersion(_identity: InvectIdentity | null, flowId: string, data: unknown) {
    return await this.request('POST', `/flows/${encodeURIComponent(flowId)}/versions`, data);
  }

  // ===== Runs =====

  async startRun(
    _identity: InvectIdentity | null,
    flowId: string,
    inputs?: Record<string, unknown>,
  ) {
    return await this.request(
      'POST',
      `/flows/${encodeURIComponent(flowId)}/run`,
      inputs ? { inputs } : {},
    );
  }

  async runToNode(
    _identity: InvectIdentity | null,
    flowId: string,
    nodeId: string,
    inputs?: Record<string, unknown>,
  ) {
    return await this.request('POST', `/flows/${encodeURIComponent(flowId)}/run-to-node`, {
      targetNodeId: nodeId,
      ...(inputs ? { inputs } : {}),
    });
  }

  async listRuns(_identity: InvectIdentity | null, flowId: string) {
    return await this.request<{ data: unknown[]; total: number }>(
      'GET',
      `/flows/${encodeURIComponent(flowId)}/runs`,
    );
  }

  async getRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.request('GET', `/flow-runs/${encodeURIComponent(flowRunId)}`);
  }

  async cancelRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.request<{ message: string }>(
      'POST',
      `/flow-runs/${encodeURIComponent(flowRunId)}/cancel`,
    );
  }

  async pauseRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.request<{ message: string }>(
      'POST',
      `/flow-runs/${encodeURIComponent(flowRunId)}/pause`,
    );
  }

  async resumeRun(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.request<{ message: string }>(
      'POST',
      `/flow-runs/${encodeURIComponent(flowRunId)}/resume`,
    );
  }

  // ===== Debug =====

  async getNodeExecutions(_identity: InvectIdentity | null, flowRunId: string) {
    return await this.request<unknown[]>(
      'GET',
      `/flow-runs/${encodeURIComponent(flowRunId)}/node-executions`,
    );
  }

  async testNode(
    _identity: InvectIdentity | null,
    nodeType: string,
    params: Record<string, unknown>,
    inputData?: Record<string, unknown>,
  ) {
    return await this.request<{ success: boolean; output?: unknown; error?: string }>(
      'POST',
      '/node-data/test-node',
      { nodeType, params, inputData },
    );
  }

  async testJsExpression(
    _identity: InvectIdentity | null,
    expression: string,
    context: Record<string, unknown>,
  ) {
    return await this.request<{ success: boolean; result?: unknown; error?: string }>(
      'POST',
      '/node-data/test-expression',
      { expression, context },
    );
  }

  async testMapper(
    _identity: InvectIdentity | null,
    expression: string,
    incomingData: Record<string, unknown>,
  ) {
    return await this.request<{ success: boolean; result?: unknown; error?: string }>(
      'POST',
      '/node-data/test-mapper',
      { expression, incomingData },
    );
  }

  async getDashboardStats(_identity: InvectIdentity | null) {
    return await this.request('GET', '/dashboard');
  }

  // ===== Credentials =====

  async listCredentials(_identity: InvectIdentity | null): Promise<CredentialSummary[]> {
    const result = await this.request<unknown[]>('GET', '/credentials');
    // API returns sanitized list (no config field)
    return (result as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      type: String(c.type),
      provider: c.provider ? String(c.provider) : undefined,
      lastUsedAt: c.lastUsedAt ? String(c.lastUsedAt) : undefined,
      createdAt: c.createdAt ? String(c.createdAt) : undefined,
    }));
  }

  async testCredential(_identity: InvectIdentity | null, credentialId: string) {
    return await this.request<{ success: boolean; error?: string }>(
      'POST',
      `/credentials/${encodeURIComponent(credentialId)}/test`,
    );
  }

  // ===== Triggers =====

  async listTriggers(_identity: InvectIdentity | null, flowId: string) {
    return await this.request<unknown[]>('GET', `/flows/${encodeURIComponent(flowId)}/triggers`);
  }

  async getTrigger(_identity: InvectIdentity | null, triggerId: string) {
    return await this.request('GET', `/triggers/${encodeURIComponent(triggerId)}`);
  }

  async createTrigger(_identity: InvectIdentity | null, input: unknown) {
    return await this.request('POST', '/triggers', input);
  }

  async updateTrigger(_identity: InvectIdentity | null, triggerId: string, input: unknown) {
    return await this.request('PATCH', `/triggers/${encodeURIComponent(triggerId)}`, input);
  }

  async deleteTrigger(_identity: InvectIdentity | null, triggerId: string) {
    await this.request('DELETE', `/triggers/${encodeURIComponent(triggerId)}`);
  }

  // ===== Node Reference =====

  async listProviders(_identity: InvectIdentity | null) {
    return await this.request<unknown[]>('GET', '/actions/providers');
  }

  async listAvailableNodes(_identity: InvectIdentity | null) {
    return await this.request<unknown[]>('GET', '/actions/nodes');
  }
}
