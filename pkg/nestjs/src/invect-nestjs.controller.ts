import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Req,
  Res,
  All,
  BadRequestException,
  NotFoundException,
  HttpCode,
} from '@nestjs/common';
import { BatchProvider, Invect, FlowValidationResult } from '@invect/core';
import type {
  NodeConfigUpdateEvent,
  NodeConfigUpdateResponse,
  CreateFlowRequest,
  UpdateFlowInput,
  InvectDefinition,
  QueryOptions,
  CreateFlowVersionRequest,
  ExecuteFlowOptions,
  SubmitSQLQueryRequest,
  SubmitPromptRequest,
  Flow,
  FlowVersion,
  FlowRun,
  NodeExecution,
  FlowInputs,
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialFilters,
  CreateTriggerInput,
  UpdateTriggerInput,
  ChatStreamEvent,
  InvectIdentity,
} from '@invect/core';
import { GraphNodeType } from '@invect/core/types';
import type { Request, Response } from 'express';

type PostgreSqlClientLike = {
  unsafe<T = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<T[]>;
};

type SqliteClientLike = {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number };
  };
};

type MysqlClientLike = {
  execute<T = Record<string, unknown>>(
    statement: string,
    params: unknown[],
  ): Promise<[T[] | unknown, unknown]>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      invectIdentity?: InvectIdentity | null;
    }
  }
}

function parseParamsFromQuery(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    if (typeof last === 'string') {
      try {
        return JSON.parse(last);
      } catch {
        return {};
      }
    }
    return {};
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, entry]) => {
        acc[key] = Array.isArray(entry) ? entry[entry.length - 1] : entry;
        return acc;
      },
      {},
    );
  }

  return {};
}

function createPluginDatabaseApi(invect: Invect) {
  const connection = invect.getDatabaseConnection();

  const normalizeSql = (statement: string): string => {
    if (connection.type !== 'postgresql') {
      return statement;
    }

    let index = 0;
    return statement.replace(/\?/g, () => `$${++index}`);
  };

  const query = async <T = Record<string, unknown>>(
    statement: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    switch (connection.type) {
      case 'postgresql': {
        const client = (connection.db as unknown as { $client: PostgreSqlClientLike }).$client;
        return await client.unsafe<T>(normalizeSql(statement), params);
      }
      case 'sqlite': {
        const client = (connection.db as unknown as { $client: SqliteClientLike }).$client;
        return client.prepare(statement).all(...params) as T[];
      }
      case 'mysql': {
        const client = (connection.db as unknown as { $client: MysqlClientLike }).$client;
        const [rows] = await client.execute<T>(statement, params);
        return Array.isArray(rows) ? rows : [];
      }
    }

    throw new Error(`Unsupported database type: ${String((connection as { type?: string }).type)}`);
  };

  return {
    type: connection.type,
    query,
    async execute(statement: string, params: unknown[] = []): Promise<void> {
      await query(statement, params);
    },
  };
}

function coerceQueryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value ?? undefined;
}

@Controller()
export class InvectController {
  constructor(@Inject('INVECT_CORE') private readonly invect: Invect) {}

  // =====================================
  // FLOW MANAGEMENT ROUTES
  // =====================================

  /**
   * GET /flows - List flows with optional filtering and pagination
   * Core method: ✅ listFlows(options?: QueryOptions<Flow>)
   */
  @Get('flows')
  async listFlows(@Query() query: Record<string, unknown>) {
    return await this.invect.listFlows(query as QueryOptions<Flow>);
  }

  /**
   * GET /flows/list - List flows (Express-compatible alias)
   * POST /flows/list - List flows with body filters (Express-compatible alias)
   */
  @Get('flows/list')
  async listFlowsGetAlias(@Query() query: Record<string, unknown>) {
    return await this.invect.listFlows(query as QueryOptions<Flow>);
  }

  @Post('flows/list')
  async listFlowsPostAlias(@Body() body: Record<string, unknown>) {
    return await this.invect.listFlows(body as QueryOptions<Flow>);
  }

  /**
   * POST /flows - Create a new flow
   * Core method: ✅ createFlow(flowData: CreateFlowRequest)
   */
  @Post('flows')
  async createFlow(@Body() body: CreateFlowRequest) {
    return await this.invect.createFlow(body);
  }

  /**
   * GET /flows/:id - Get flow by ID
   * Core method: ✅ getFlow(flowId: string)
   */
  @Get('flows/:id')
  async getFlow(@Param('id') id: string) {
    return await this.invect.getFlow(id);
  }

  /**
   * PUT /flows/:id - Update flow
   * Core method: ✅ updateFlow(flowId: string, updateData: UpdateFlowInput)
   */
  @Put('flows/:id')
  async updateFlow(@Param('id') id: string, @Body() body: UpdateFlowInput) {
    return await this.invect.updateFlow(id, body);
  }

  /**
   * DELETE /flows/:id - Delete flow
   * Core method: ✅ deleteFlow(flowId: string)
   */
  @Delete('flows/:id')
  async deleteFlow(@Param('id') id: string) {
    await this.invect.deleteFlow(id);
    // NestJS automatically returns 200 OK for successful DELETE operations
    // If you prefer 204 No Content, you can add @HttpCode(204) decorator
  }

  /**
   * POST /validate-flow - Validate flow definition
   * Core method: ✅ validateFlowDefinition(flowId: string, flowDefinition: InvectDefinition)
   */
  @Post('validate-flow')
  async validateFlow(
    @Body() body: { flowId: string; flowDefinition: InvectDefinition },
  ): Promise<FlowValidationResult> {
    const { flowId, flowDefinition } = body;
    return await this.invect.validateFlowDefinition(flowId, flowDefinition);
  }

  /**
   * GET /flows/:flowId/react-flow - Get flow data in React Flow format
   * Core method: ✅ renderToReactFlow(flowId, options)
   */
  @Get('flows/:flowId/react-flow')
  async renderToReactFlow(
    @Param('flowId') flowId: string,
    @Query('version') version?: string,
    @Query('flowRunId') flowRunId?: string,
  ) {
    const options: Record<string, unknown> = {};
    if (version) {
      options.version = version;
    }
    if (flowRunId) {
      options.flowRunId = flowRunId;
    }
    return await this.invect.renderToReactFlow(flowId, options);
  }

  // =====================================
  // FLOW VERSION MANAGEMENT ROUTES
  // =====================================

  /**
   * POST /flows/:id/versions/list - Get flow versions with optional filtering and pagination
   * Core method: ✅ listFlowVersions(flowId, options)
   */
  @Post('flows/:id/versions/list')
  async listFlowVersionsPost(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return await this.invect.listFlowVersions(id, body as QueryOptions<FlowVersion>);
  }

  /**
   * GET /flows/:id/versions - Get flow versions with optional filtering and pagination
   * Core method: ✅ listFlowVersions(flowId: string, options?: QueryOptions<FlowVersion>)
   */
  @Get('flows/:id/versions')
  async getFlowVersions(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    return await this.invect.listFlowVersions(id, query as QueryOptions<FlowVersion>);
  }

  /**
   * POST /flows/:id/versions - Create flow version
   * Core method: ✅ createFlowVersion(flowId: string, versionData: CreateFlowVersionRequest)
   */
  @Post('flows/:id/versions')
  async createFlowVersion(@Param('id') id: string, @Body() body: CreateFlowVersionRequest) {
    return await this.invect.createFlowVersion(id, body);
  }

  /**
   * GET /flows/:id/versions/:version - Get specific flow version (supports 'latest')
   * Core method: ✅ getFlowVersion(flowId, version)
   */
  @Get('flows/:id/versions/:version')
  async getFlowVersion(@Param('id') id: string, @Param('version') version: string) {
    const result = await this.invect.getFlowVersion(id, version);
    if (!result) {
      throw new NotFoundException(`Version ${version} not found for flow ${id}`);
    }
    return result;
  }

  // =====================================
  // FLOW RUN EXECUTION ROUTES
  // =====================================

  /**
   * POST /flows/:flowId/run - Start flow execution
   * Core method: ✅ startFlowRunAsync(flowId, inputs, options)
   */
  @Post('flows/:flowId/run')
  async startFlowRun(
    @Param('flowId') flowId: string,
    @Body() body: { inputs?: Record<string, unknown>; options?: ExecuteFlowOptions },
  ) {
    const { inputs = {}, options } = body;
    return await this.invect.startFlowRunAsync(flowId, inputs as FlowInputs, options);
  }

  /**
   * POST /flows/:flowId/run-to-node/:nodeId - Execute flow up to a specific node
   * Core method: ✅ executeFlowToNode(flowId, targetNodeId, inputs, options)
   */
  @Post('flows/:flowId/run-to-node/:nodeId')
  async executeFlowToNode(
    @Param('flowId') flowId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { inputs?: Record<string, unknown>; options?: ExecuteFlowOptions },
  ) {
    const { inputs = {}, options } = body;
    return await this.invect.executeFlowToNode(flowId, nodeId, inputs as FlowInputs, options);
  }

  /**
   * POST /flow-runs/list - List flow runs with optional filtering and pagination
   * Core method: ✅ listFlowRuns(options)
   */
  @Post('flow-runs/list')
  async listFlowRunsPost(@Body() body: Record<string, unknown>) {
    return await this.invect.listFlowRuns(body as QueryOptions<FlowRun>);
  }

  /**
   * GET /flow-runs - Get all flow runs with optional filtering and pagination
   * Core method: ✅ listFlowRuns(options?: QueryOptions<FlowRun>)
   */
  @Get('flow-runs')
  async listFlowRuns(@Query() query: Record<string, unknown>) {
    return await this.invect.listFlowRuns(query as QueryOptions<FlowRun>);
  }

  /**
   * GET /flow-runs/:flowRunId - Get specific flow run by ID
   * Core method: ✅ getFlowRunById(flowRunId: string)
   */
  @Get('flow-runs/:flowRunId')
  async getFlowRun(@Param('flowRunId') flowRunId: string) {
    return await this.invect.getFlowRunById(flowRunId);
  }

  /**
   * GET /flows/:flowId/flow-runs - Get flow runs for a specific flow
   * Core method: ✅ listFlowRunsByFlowId(flowId: string)
   */
  @Get('flows/:flowId/flow-runs')
  async getFlowRunsByFlowId(@Param('flowId') flowId: string) {
    return await this.invect.listFlowRunsByFlowId(flowId);
  }

  /**
   * POST /flow-runs/:flowRunId/resume - Resume paused flow execution
   * Core method: ✅ resumeExecution(executionId: string)
   */
  @Post('flow-runs/:flowRunId/resume')
  async resumeFlowRun(@Param('flowRunId') flowRunId: string) {
    return await this.invect.resumeExecution(flowRunId);
  }

  /**
   * POST /flow-runs/:flowRunId/cancel - Cancel flow execution
   * Core method: ✅ cancelFlowRun(flowRunId: string)
   */
  @Post('flow-runs/:flowRunId/cancel')
  async cancelFlowRun(@Param('flowRunId') flowRunId: string) {
    return await this.invect.cancelFlowRun(flowRunId);
  }

  /**
   * POST /flow-runs/:flowRunId/pause - Pause flow execution
   * Core method: ✅ pauseFlowRun(flowRunId: string, reason?: string)
   */
  @Post('flow-runs/:flowRunId/pause')
  async pauseFlowRun(@Param('flowRunId') flowRunId: string, @Body() body?: { reason?: string }) {
    const reason = body?.reason;
    return await this.invect.pauseFlowRun(flowRunId, reason);
  }

  // =====================================
  // NODE EXECUTION ROUTES
  // =====================================

  /**
   * GET /flow-runs/:flowRunId/node-executions - Get node executions for a flow run
   * Core method: ✅ getNodeExecutionsByRunId(flowRunId: string)
   */
  @Get('flow-runs/:flowRunId/node-executions')
  async getNodeExecutionsByRunId(@Param('flowRunId') flowRunId: string) {
    return await this.invect.getNodeExecutionsByRunId(flowRunId);
  }

  /**
   * GET /flow-runs/:flowRunId/stream - SSE stream of execution events
   * Core method: ✅ createFlowRunEventStream(flowRunId: string)
   */
  @Get('flow-runs/:flowRunId/stream')
  async streamFlowRun(
    @Param('flowRunId') flowRunId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = this.invect.createFlowRunEventStream(flowRunId);
      for await (const event of stream) {
        if (res.destroyed) {
          break;
        }
        const data = JSON.stringify(event);
        res.write(`event: ${event.type}\ndata: ${data}\n\n`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Stream failed';
      if (res.headersSent) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ type: 'error', message })}\n\n`,
        );
      } else {
        return res.status(500).json({ error: 'Internal Server Error', message });
      }
    } finally {
      res.end();
    }
  }

  /**
   * GET /node-executions - Get all node executions with optional filtering and pagination
   * Core method: ✅ listNodeExecutions(options?: QueryOptions<NodeExecution>)
   */
  @Get('node-executions')
  async listNodeExecutions(@Query() query: Record<string, unknown>) {
    return await this.invect.listNodeExecutions(query as QueryOptions<NodeExecution>);
  }

  /**
   * POST /node-executions/list - List node executions with body filters
   * Core method: ✅ listNodeExecutions(options)
   */
  @Post('node-executions/list')
  async listNodeExecutionsPost(@Body() body: Record<string, unknown>) {
    return await this.invect.listNodeExecutions(body as QueryOptions<NodeExecution>);
  }

  // =====================================
  // NODE DATA & TESTING ROUTES
  // =====================================

  /**
   * POST /node-data/sql-query - Execute SQL query for testing
   * Core method: ✅ executeSqlQuery(request: SubmitSQLQueryRequest)
   */
  @Post('node-data/sql-query')
  async executeSqlQuery(@Body() body: SubmitSQLQueryRequest) {
    return await this.invect.executeSqlQuery(body);
  }

  /**
   * POST /node-data/test-expression - Test a JS expression in the QuickJS sandbox
   * Core method: ✅ testJsExpression({ expression, context })
   */
  @Post('node-data/test-expression')
  async testJsExpression(@Body() body: { expression: string; context: Record<string, unknown> }) {
    return await this.invect.testJsExpression(body);
  }

  /**
   * POST /node-data/test-mapper - Test a mapper expression with mode semantics
   * Core method: ✅ testMapper({ expression, incomingData, mode? })
   */
  @Post('node-data/test-mapper')
  async testMapper(
    @Body()
    body: {
      expression: string;
      incomingData: Record<string, unknown>;
      mode?: 'auto' | 'iterate' | 'reshape';
    },
  ) {
    return await this.invect.testMapper(body);
  }

  /**
   * POST /node-data/model-query - Test model prompt
   * Core method: ✅ testModelPrompt(request: SubmitPromptRequest)
   */
  @Post('node-data/model-query')
  async testModelPrompt(@Body() body: SubmitPromptRequest) {
    return await this.invect.testModelPrompt(body);
  }

  /**
   * GET /node-data/models - Get available AI models
   * Core method: ✅ getAvailableModels()
   */
  @Get('node-data/models')
  async getAvailableModels(
    @Query('credentialId') credentialId?: string,
    @Query('provider') provider?: string,
  ) {
    if (credentialId) {
      return await this.invect.getModelsForCredential(credentialId);
    }

    if (provider) {
      const normalized = provider.trim().toUpperCase();
      if (!Object.values(BatchProvider).includes(normalized as BatchProvider)) {
        throw new BadRequestException(
          `Unsupported provider '${provider}'. Expected one of: ${Object.values(BatchProvider).join(', ')}`,
        );
      }
      return await this.invect.getModelsForProvider(normalized as BatchProvider);
    }

    return await this.invect.getAvailableModels();
  }

  /**
   * GET /node-data/databases - Get available databases
   * Core method: ✅ getAvailableDatabases()
   */
  @Get('node-data/databases')
  async getAvailableDatabases() {
    return this.invect.getAvailableDatabases();
  }

  /**
   * POST /node-config/update - Generic node configuration updates
   * Core method: ✅ handleNodeConfigUpdate(event)
   */
  @Post('node-config/update')
  async handleNodeConfigUpdate(
    @Body() body: NodeConfigUpdateEvent,
  ): Promise<NodeConfigUpdateResponse> {
    return await this.invect.handleNodeConfigUpdate(body);
  }

  @Get('node-definition/:nodeType')
  async resolveNodeDefinition(
    @Param('nodeType') rawNodeType: string,
    @Query() query: Record<string, unknown>,
  ): Promise<NodeConfigUpdateResponse> {
    // Accept both legacy GraphNodeType enum values (uppercase) and
    // action IDs (e.g. "core.model", "gmail.send_message").
    const nodeTypeParam = rawNodeType.includes('.')
      ? rawNodeType // action ID — pass through as-is
      : rawNodeType.toUpperCase(); // legacy — uppercase to match enum

    const isLegacyEnum = !rawNodeType.includes('.') && nodeTypeParam in GraphNodeType;
    const isActionId = rawNodeType.includes('.');

    if (!isLegacyEnum && !isActionId) {
      throw new BadRequestException(`Unknown node type '${rawNodeType}'`);
    }

    const params = parseParamsFromQuery(query.params);
    const changeField = typeof query.changeField === 'string' ? query.changeField : undefined;
    const changeValue = coerceQueryValue(query.changeValue);
    const nodeId =
      typeof query.nodeId === 'string' ? query.nodeId : `definition-${nodeTypeParam.toLowerCase()}`;
    const flowId = typeof query.flowId === 'string' ? query.flowId : undefined;

    return await this.invect.handleNodeConfigUpdate({
      nodeType: nodeTypeParam as GraphNodeType,
      nodeId,
      flowId,
      params,
      change: changeField ? { field: changeField, value: changeValue } : undefined,
    });
  }

  /**
   * GET /nodes - Get available node definitions
   * Core method: ✅ getAvailableNodes()
   */
  @Get('nodes')
  getAvailableNodes() {
    return this.invect.getAvailableNodes();
  }

  /**
   * GET /actions/:actionId/fields/:fieldName/options - Load dynamic field options
   * Core method: ✅ resolveFieldOptions(actionId, fieldName, deps)
   */
  @Get('actions/:actionId/fields/:fieldName/options')
  async resolveFieldOptions(
    @Param('actionId') actionId: string,
    @Param('fieldName') fieldName: string,
    @Query('deps') deps?: string,
  ): Promise<unknown> {
    let dependencyValues: Record<string, unknown> = {};
    if (deps) {
      try {
        dependencyValues = JSON.parse(deps);
      } catch {
        throw new BadRequestException('Invalid deps JSON');
      }
    }
    return await this.invect.resolveFieldOptions(actionId, fieldName, dependencyValues);
  }

  /**
   * POST /nodes/test - Test/execute a single node in isolation
   * Core method: ✅ testNode(nodeType, params, inputData)
   */
  @Post('nodes/test')
  async testNode(
    @Body()
    body: {
      nodeType: string;
      params: Record<string, unknown>;
      inputData?: Record<string, unknown>;
    },
  ) {
    const { nodeType, params, inputData } = body;
    if (!nodeType || typeof nodeType !== 'string') {
      throw new BadRequestException('nodeType is required and must be a string');
    }
    if (!params || typeof params !== 'object') {
      throw new BadRequestException('params is required and must be an object');
    }
    return await this.invect.testNode(nodeType, params, inputData || {});
  }

  // =====================================
  // CREDENTIAL ROUTES
  // =====================================

  /**
   * POST /credentials - Create a new credential
   */
  @Post('credentials')
  async createCredential(
    @Body()
    body: {
      name: string;
      type: string;
      authType: string;
      config: Record<string, unknown>;
      description?: string;
      workspaceId?: string;
      isShared?: boolean;
      metadata?: Record<string, unknown>;
      expiresAt?: string;
    },
  ): Promise<unknown> {
    return await this.invect.createCredential(body as CreateCredentialInput);
  }

  /**
   * GET /credentials - List credentials
   */
  @Get('credentials')
  async listCredentials(
    @Query('type') type?: string,
    @Query('authType') authType?: string,
    @Query('isActive') isActive?: string,
  ): Promise<unknown> {
    const filters: Record<string, unknown> = {};
    if (type) {
      filters.type = type;
    }
    if (authType) {
      filters.authType = authType;
    }
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    return await this.invect.listCredentials(filters as CredentialFilters);
  }

  /**
   * GET /credentials/:id - Get a credential
   */
  @Get('credentials/:id')
  async getCredential(@Param('id') id: string): Promise<unknown> {
    return await this.invect.getCredential(id);
  }

  /**
   * PUT /credentials/:id - Update a credential
   */
  @Put('credentials/:id')
  async updateCredential(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return await this.invect.updateCredential(id, body as UpdateCredentialInput);
  }

  /**
   * DELETE /credentials/:id - Delete a credential
   */
  @Delete('credentials/:id')
  @HttpCode(204)
  async deleteCredential(@Param('id') id: string) {
    await this.invect.deleteCredential(id);
  }

  /**
   * POST /credentials/:id/test - Test a credential
   */
  @Post('credentials/:id/test')
  async testCredential(@Param('id') id: string) {
    return await this.invect.testCredential(id);
  }

  /**
   * POST /credentials/:id/track-usage - Update credential last used timestamp
   * Core method: ✅ updateCredentialLastUsed(id)
   */
  @Post('credentials/:id/track-usage')
  @HttpCode(204)
  async trackCredentialUsage(@Param('id') id: string) {
    await this.invect.updateCredentialLastUsed(id);
  }

  /**
   * GET /credentials/expiring - Get credentials expiring soon
   * Core method: ✅ getExpiringCredentials(daysUntilExpiry?)
   */
  @Get('credentials/expiring')
  async getExpiringCredentials(
    @Query('daysUntilExpiry') daysUntilExpiry?: string,
  ): Promise<unknown> {
    const days = daysUntilExpiry ? parseInt(daysUntilExpiry) : 7;
    return await this.invect.getExpiringCredentials(days);
  }

  /**
   * POST /credentials/test-request - Proxy HTTP request to test a credential
   */
  @Post('credentials/test-request')
  async testCredentialRequest(
    @Body()
    body: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    },
  ) {
    const { url, method = 'GET', headers = {}, body: reqBody } = body;
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const fetchOptions: RequestInit = { method, headers };
    if (reqBody && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
    }

    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: responseBody,
    };
  }

  // =====================================
  // OAUTH2 ROUTES
  // =====================================

  @Get('credentials/oauth2/providers')
  getOAuth2Providers() {
    return this.invect.getOAuth2Providers();
  }

  @Get('credentials/oauth2/providers/:providerId')
  getOAuth2Provider(@Param('providerId') providerId: string) {
    const provider = this.invect.getOAuth2Provider(providerId);
    if (!provider) {
      throw new NotFoundException('OAuth2 provider not found');
    }
    return provider;
  }

  @Post('credentials/oauth2/start')
  startOAuth2Flow(
    @Body()
    body: {
      providerId: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      scopes?: string[];
      returnUrl?: string;
      credentialName?: string;
    },
  ) {
    const { providerId, clientId, clientSecret, redirectUri, scopes, returnUrl, credentialName } =
      body;
    if (!providerId || !clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'Missing required fields: providerId, clientId, clientSecret, redirectUri',
      );
    }
    return this.invect.startOAuth2Flow(
      providerId,
      { clientId, clientSecret, redirectUri },
      { scopes, returnUrl, credentialName },
    );
  }

  @Post('credentials/oauth2/callback')
  async handleOAuth2Callback(
    @Body()
    body: {
      code: string;
      state: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    },
  ): Promise<unknown> {
    const { code, state, clientId, clientSecret, redirectUri } = body;
    if (!code || !state || !clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'Missing required fields: code, state, clientId, clientSecret, redirectUri',
      );
    }
    return await this.invect.handleOAuth2Callback(code, state, {
      clientId,
      clientSecret,
      redirectUri,
    });
  }

  @Post('credentials/:id/refresh')
  async refreshOAuth2Credential(@Param('id') id: string): Promise<unknown> {
    return await this.invect.refreshOAuth2Credential(id);
  }

  // =====================================
  // DASHBOARD ROUTES
  // =====================================

  @Get('dashboard/stats')
  async getDashboardStats() {
    return await this.invect.getDashboardStats();
  }

  // =====================================
  // CREDENTIAL WEBHOOK ROUTES
  // =====================================

  // =====================================
  // TRIGGER MANAGEMENT ROUTES
  // =====================================

  /**
   * GET /flows/:flowId/triggers - List triggers for a flow
   */
  @Get('flows/:flowId/triggers')
  async listTriggersForFlow(@Param('flowId') flowId: string) {
    return await this.invect.listTriggersForFlow(flowId);
  }

  /**
   * POST /flows/:flowId/triggers - Create a trigger
   */
  @Post('flows/:flowId/triggers')
  async createTrigger(@Param('flowId') flowId: string, @Body() body: Record<string, unknown>) {
    return await this.invect.createTrigger({ ...body, flowId } as CreateTriggerInput);
  }

  /**
   * POST /flows/:flowId/triggers/sync - Sync triggers from definition
   */
  @Post('flows/:flowId/triggers/sync')
  async syncTriggersForFlow(
    @Param('flowId') flowId: string,
    @Body()
    body: {
      definition: { nodes: Array<{ id: string; type: string; params?: Record<string, unknown> }> };
    },
  ) {
    return await this.invect.syncTriggersForFlow(flowId, body.definition);
  }

  /**
   * GET /triggers/:triggerId - Get a trigger
   */
  @Get('triggers/:triggerId')
  async getTrigger(@Param('triggerId') triggerId: string) {
    const trigger = await this.invect.getTrigger(triggerId);
    if (!trigger) {
      throw new NotFoundException(`Trigger ${triggerId} not found`);
    }
    return trigger;
  }

  /**
   * PUT /triggers/:triggerId - Update a trigger
   */
  @Put('triggers/:triggerId')
  async updateTrigger(
    @Param('triggerId') triggerId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const trigger = await this.invect.updateTrigger(triggerId, body as UpdateTriggerInput);
    if (!trigger) {
      throw new NotFoundException(`Trigger ${triggerId} not found`);
    }
    return trigger;
  }

  /**
   * DELETE /triggers/:triggerId - Delete a trigger
   */
  @Delete('triggers/:triggerId')
  @HttpCode(204)
  async deleteTrigger(@Param('triggerId') triggerId: string) {
    await this.invect.deleteTrigger(triggerId);
  }

  // =====================================
  // AGENT TOOLS ROUTES
  // =====================================

  /**
   * GET /agent/tools - List all available agent tools
   */
  @Get('agent/tools')
  getAgentTools() {
    return this.invect.getAgentTools();
  }

  // =====================================
  // CHAT ASSISTANT ROUTES
  // =====================================

  @Get('chat/status')
  getChatStatus() {
    return { enabled: this.invect.isChatEnabled() };
  }

  @Post('chat')
  async streamChat(
    @Body() body: { messages: unknown[]; context?: Record<string, unknown> },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { messages, context } = body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: '"messages" must be an array of chat messages',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = await this.invect.createChatStream({
        messages: messages as Array<{
          role: string;
          content: string;
          toolCalls?: unknown[];
          toolCallId?: string;
        }>,
        context: context || {},
      });
      for await (const event of stream) {
        if (res.destroyed) {
          break;
        }
        const data = JSON.stringify(event);
        res.write(`event: ${(event as ChatStreamEvent).type}\ndata: ${data}\n\n`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Chat stream failed';
      if (res.headersSent) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ type: 'error', message, recoverable: false })}\n\n`,
        );
      } else {
        return res.status(500).json({ error: 'Internal Server Error', message });
      }
    } finally {
      res.end();
    }
  }

  // =====================================
  // CHAT MESSAGE PERSISTENCE ROUTES
  // =====================================

  @Get('chat/messages/:flowId')
  async getChatMessages(@Param('flowId') flowId: string): Promise<unknown> {
    return await this.invect.getChatMessages(flowId);
  }

  @Put('chat/messages/:flowId')
  async saveChatMessages(
    @Param('flowId') flowId: string,
    @Body() body: { messages: unknown[] },
  ): Promise<unknown> {
    if (!body.messages || !Array.isArray(body.messages)) {
      throw new BadRequestException('"messages" must be an array');
    }
    return await this.invect.saveChatMessages(
      flowId,
      body.messages as Array<{
        role: 'user' | 'assistant' | 'system' | 'tool';
        content: string;
        toolMeta?: Record<string, unknown> | null;
      }>,
    );
  }

  @Delete('chat/messages/:flowId')
  async deleteChatMessages(@Param('flowId') flowId: string) {
    await this.invect.deleteChatMessages(flowId);
    return { success: true };
  }

  // =====================================
  // PLUGIN ENDPOINTS
  // Catch-all that delegates to plugin-defined routes
  // =====================================

  @All('plugins/*')
  async handlePluginEndpoint(@Req() req: Request, @Res() res: Response) {
    const endpoints = this.invect.getPluginEndpoints();
    const pluginPath = (req.path as string).replace(/^.*\/plugins/, '') || '/';
    const method = req.method.toUpperCase();

    const matchedEndpoint = endpoints.find((ep) => {
      if (ep.method !== method) {
        return false;
      }
      const pattern = ep.path.replace(/:([^/]+)/g, '([^/]+)');
      return new RegExp(`^${pattern}$`).test(pluginPath);
    });

    if (!matchedEndpoint) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Plugin route ${method} ${pluginPath} not found`,
      });
    }

    // Extract path params
    const paramNames: string[] = [];
    const paramPattern = matchedEndpoint.path.replace(/:([^/]+)/g, (_m: string, name: string) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const paramMatch = new RegExp(`^${paramPattern}$`).exec(pluginPath);
    const params: Record<string, string> = {};
    if (paramMatch) {
      paramNames.forEach((name, i) => {
        params[name] = paramMatch[i + 1] || '';
      });
    }

    // Check endpoint-level auth
    if (!matchedEndpoint.isPublic && matchedEndpoint.permission) {
      const identity = req.invectIdentity ?? null;
      if (!this.invect.hasPermission(identity, matchedEndpoint.permission)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Missing permission: ${matchedEndpoint.permission}`,
        });
      }
    }

    const result = await matchedEndpoint.handler({
      body: req.body || {},
      params,
      query: (req.query || {}) as Record<string, string | undefined>,
      headers: req.headers as Record<string, string | undefined>,
      identity: req.invectIdentity ?? null,
      database: createPluginDatabaseApi(this.invect),
      request: req as unknown as globalThis.Request,
      core: {
        getPermissions: (identity) => this.invect.getPermissions(identity),
        getAvailableRoles: () => this.invect.getAvailableRoles(),
        getResolvedRole: (identity) => this.invect.getAuthService().getResolvedRole(identity),
        isFlowAccessTableEnabled: () => this.invect.isFlowAccessTableEnabled(),
        listFlowAccess: (flowId) => this.invect.listFlowAccess(flowId),
        grantFlowAccess: (input) => this.invect.grantFlowAccess(input),
        revokeFlowAccess: (accessId) => this.invect.revokeFlowAccess(accessId),
        getAccessibleFlowIds: (userId, teamIds) =>
          this.invect.getAccessibleFlowIds(userId, teamIds),
        getFlowPermission: (flowId, userId, teamIds) =>
          this.invect.getFlowPermission(flowId, userId, teamIds),
        authorize: (context) => this.invect.authorize(context),
      },
    });

    // Handle raw Response objects
    if (result instanceof Response) {
      const arrayBuf = await result.arrayBuffer();
      res.status(result.status);
      result.headers.forEach((value: string, key: string) => res.setHeader(key, value));
      res.send(Buffer.from(arrayBuf));
      return;
    }

    // Handle streaming responses
    if ('stream' in result && result.stream) {
      res.status(result.status || 200);
      res.setHeader('Content-Type', 'text/event-stream');
      const streamResult = result as { status?: number; stream: ReadableStream };
      const reader = streamResult.stream.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(value);
        await pump();
      };
      await pump();
      return;
    }

    // Standard JSON response
    const jsonResult = result as { status?: number; body: unknown };
    return res.status(jsonResult.status || 200).json(jsonResult.body);
  }
}
