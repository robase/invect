import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  BatchProvider,
  createInvect,
  InvectConfig,
  GraphNodeType,
  InvectIdentity,
  InvectPermission,
  InvectResourceType,
  createPluginDatabaseApi,
} from '@invect/core';
import type { CredentialFilters, InvectInstance } from '@invect/core';
import { asyncHandler } from './async-handler';
import { ZodError } from 'zod';

// Extend Express Request type to include Invect identity
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Invect identity resolved from host app auth */
      invectIdentity?: InvectIdentity | null;
    }
  }
}

function parseParamsFromQuery(queryValue: unknown): Record<string, unknown> {
  if (!queryValue) {
    return {};
  }

  if (typeof queryValue === 'string') {
    try {
      return JSON.parse(queryValue);
    } catch {
      return {};
    }
  }

  if (Array.isArray(queryValue)) {
    const last = queryValue[queryValue.length - 1];
    if (typeof last === 'string') {
      try {
        return JSON.parse(last);
      } catch {
        return {};
      }
    }
    return {};
  }

  if (typeof queryValue === 'object') {
    return Object.entries(queryValue).reduce<Record<string, unknown>>((acc, [key, value]) => {
      acc[key] = Array.isArray(value) ? value[value.length - 1] : value;
      return acc;
    }, {});
  }

  return {};
}

function coerceQueryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value ?? undefined;
}

/**
 * Create Invect Express Router
 */
export async function createInvectRouter(config: InvectConfig): Promise<Router> {
  const invect = await createInvect(config);

  // Start batch polling for automatic batch completion handling
  await invect.startBatchPolling();
  // eslint-disable-next-line no-console
  console.log('✅ Invect batch polling started');

  // Start cron scheduler for automatic cron trigger execution
  await invect.startCronScheduler();
  // eslint-disable-next-line no-console
  console.log('✅ Invect cron scheduler started');

  const router = Router();

  // =====================================
  // AUTHENTICATION MIDDLEWARE
  // =====================================

  /**
   * Auth middleware - resolves identity from host app and attaches to request.
   *
   * The host app provides a `resolveUser` callback in the config that extracts
   * the user identity from the request (e.g., from JWT, session, API key).
   */
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    // Always run plugin onRequest hooks so that identity is resolved even
    // when auth enforcement is disabled.  Plugins such as @invect/user-auth
    // populate the identity from session cookies in this hook.
    try {
      const webRequestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const webRequestInit: RequestInit = {
        method: req.method,
        headers: req.headers as HeadersInit,
      };
      const webRequest = new globalThis.Request(webRequestUrl, webRequestInit);
      const hookContext = {
        path: req.path,
        method: req.method,
        identity: null as InvectIdentity | null,
      };

      const hookResult = await invect.plugins.getHookRunner().runOnRequest(webRequest, hookContext);
      if (hookResult.intercepted && hookResult.response) {
        const arrayBuf = await hookResult.response.arrayBuffer();
        res.status(hookResult.response.status);
        hookResult.response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        return res.send(Buffer.from(arrayBuf));
      }

      req.invectIdentity = hookContext.identity ?? null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Auth resolution error:', error);
      req.invectIdentity = null;
    }

    next();
  });

  // =====================================
  // AUTHORIZATION HELPER
  // =====================================

  /**
   * Create an authorization middleware for a specific permission.
   * Uses the standard authorize() path which delegates to plugin hooks (e.g., RBAC).
   */
  function requirePermission(
    permission: InvectPermission,
    getResourceId?: (req: Request) => string | undefined,
  ) {
    return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      const identity = req.invectIdentity ?? null;
      const resourceId = getResourceId ? getResourceId(req) : undefined;
      const resourceType = permission.split(':')[0] as InvectResourceType;

      const result = await invect.auth.authorize({
        identity,
        action: permission,
        resource: resourceId
          ? {
              type: resourceType,
              id: resourceId,
            }
          : undefined,
      });

      if (!result.allowed) {
        const status = identity ? 403 : 401;
        return res.status(status).json({
          error: status === 403 ? 'Forbidden' : 'Unauthorized',
          message: result.reason || 'Access denied',
        });
      }

      next();
    });
  }

  // =====================================
  // DASHBOARD ROUTES
  // =====================================

  /**
   * GET /dashboard/stats - Get dashboard statistics
   * Core method: ✅ getDashboardStats()
   * Returns: DashboardStats (flow counts, run counts by status, recent activity)
   */
  router.get(
    '/dashboard/stats',
    asyncHandler(async (_req: Request, res: Response) => {
      const stats = await invect.flows.getDashboardStats();
      res.json(stats);
    }),
  );

  // =====================================
  // FLOW MANAGEMENT ROUTES
  // =====================================

  /**
   * GET /flows/list - List all flows (simple GET endpoint)
   * Core method: ✅ listFlows()
   * Permission: flow:read
   */
  router.get(
    '/flows/list',
    requirePermission('flow:read'),
    asyncHandler(async (_req: Request, res: Response) => {
      const flows = await invect.flows.list();
      res.json(flows);
    }),
  );

  /**
   * POST /flows/list - List flows with optional filtering and pagination
   * Core method: ✅ listFlows(options?: QueryOptions<Flow>)
   * Body: QueryOptions<Flow>
   * Permission: flow:read
   */
  router.post(
    '/flows/list',
    requirePermission('flow:read'),
    asyncHandler(async (req: Request, res: Response) => {
      const flows = await invect.flows.list(req.body);
      res.json(flows);
    }),
  );

  /**
   * POST /flows - Create a new flow
   * Core method: ✅ createFlow(flowData: CreateFlowRequest)
   * Permission: flow:create
   */
  router.post(
    '/flows',
    requirePermission('flow:create'),
    asyncHandler(async (req: Request, res: Response) => {
      const flow = await invect.flows.create(req.body);
      res.status(201).json(flow);
    }),
  );

  /**
   * GET /flows/:id - Get flow by ID
   * Core method: ✅ getFlow(flowId: string)
   * Permission: flow:read (with resource check)
   */
  router.get(
    '/flows/:id',
    requirePermission('flow:read', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const flow = await invect.flows.get(req.params.id);
      res.json(flow);
    }),
  );

  /**
   * PUT /flows/:id - Update flow
   * Core method: ✅ updateFlow(flowId: string, updateData: UpdateFlowInput)
   * Permission: flow:update (with resource check)
   */
  router.put(
    '/flows/:id',
    requirePermission('flow:update', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const flow = await invect.flows.update(req.params.id, req.body);
      res.json(flow);
    }),
  );

  /**
   * DELETE /flows/:id - Delete flow
   * Core method: ✅ deleteFlow(flowId: string)
   * Permission: flow:delete (with resource check)
   */
  router.delete(
    '/flows/:id',
    requirePermission('flow:delete', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      await invect.flows.delete(req.params.id);
      res.status(204).send();
    }),
  );

  /**
   * POST /validate-flow - Validate flow definition
   * Core method: ✅ validateFlowDefinition(flowId: string, flowDefinition: InvectDefinition)
   * Permission: flow:read
   */
  router.post(
    '/validate-flow',
    requirePermission('flow:read'),
    asyncHandler(async (req: Request, res: Response) => {
      const { flowId, flowDefinition } = req.body;
      const result = await invect.flows.validate(flowId, flowDefinition);
      res.json(result);
    }),
  );

  /**
   * GET /flows/:flowId/react-flow - Get flow data in React Flow format
   * Core method: ✅ renderToReactFlow(flowId: string, options)
   * Query params: version, flowRunId
   */
  router.get(
    '/flows/:flowId/react-flow',
    asyncHandler(async (req: Request, res: Response) => {
      interface ReactFlowQueryParams {
        version?: string | 'latest';
        flowRunId?: string;
      }

      const queryParams = req.query as ReactFlowQueryParams;
      const options: { version?: string | number | 'latest'; flowRunId?: string } = {};

      // Extract and validate query parameters
      if (queryParams.version) {
        options.version = queryParams.version;
      }
      if (queryParams.flowRunId) {
        options.flowRunId = queryParams.flowRunId;
      }

      const result = await invect.flows.renderToReactFlow(req.params.flowId, options);
      res.json(result);
    }),
  );

  // =====================================
  // FLOW VERSION MANAGEMENT ROUTES
  // =====================================

  /**
   * POST /flows/:id/versions/list - Get flow versions with optional filtering and pagination
   * Core method: ✅ listFlowVersions(flowId: string, options?: QueryOptions<FlowVersion>)
   * Body: QueryOptions<FlowVersion>
   */
  router.post(
    '/flows/:id/versions/list',
    asyncHandler(async (req: Request, res: Response) => {
      const versions = await invect.versions.list(req.params.id, req.body);
      res.json(versions);
    }),
  );

  /**
   * POST /flows/:id/versions - Create flow version
   * Core method: ✅ createFlowVersion(flowId: string, versionData: CreateFlowVersionRequest)
   * Permission: flow-version:create (with resource check on flow)
   */
  router.post(
    '/flows/:id/versions',
    requirePermission('flow-version:create', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const version = await invect.versions.create(req.params.id, req.body);
      res.status(201).json(version);
    }),
  );

  /**
   * GET /flows/:id/versions/:version - Get specific flow version (supports 'latest')
   * Core method: ✅ getFlowVersion(flowId: string, version: string | number | "latest")
   * Permission: flow-version:read (with resource check on flow)
   */
  router.get(
    '/flows/:id/versions/:version',
    requirePermission('flow-version:read', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const version = await invect.versions.get(req.params.id, req.params.version);
      if (!version) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Version ${req.params.version} not found for flow ${req.params.id}`,
        });
      }
      res.json(version);
    }),
  );

  // =====================================
  // FLOW RUN EXECUTION ROUTES
  // =====================================

  /**
   * POST /flows/:flowId/run - Start flow execution (async - returns immediately)
   * Core method: ✅ startFlowRunAsync(flowId: string, inputs: FlowInputs, options?: ExecuteFlowOptions)
   * Returns immediately with flow run ID. The flow executes in the background.
   * Permission: flow-run:create (with resource check on flow)
   */
  router.post(
    '/flows/:flowId/run',
    requirePermission('flow-run:create', (req) => req.params.flowId),
    asyncHandler(async (req: Request, res: Response) => {
      const { inputs = {}, options } = req.body;
      const result = await invect.runs.startAsync(req.params.flowId, inputs, options);
      res.status(201).json(result);
    }),
  );

  /**
   * POST /flows/:flowId/run-to-node/:nodeId - Execute flow up to a specific node
   * Only executes the upstream nodes required to produce output for the target node.
   * Core method: ✅ executeFlowToNode(flowId, targetNodeId, inputs, options)
   * Permission: flow-run:create (with resource check on flow)
   */
  router.post(
    '/flows/:flowId/run-to-node/:nodeId',
    requirePermission('flow-run:create', (req) => req.params.flowId),
    asyncHandler(async (req: Request, res: Response) => {
      const { inputs = {}, options } = req.body;
      const result = await invect.runs.executeToNode(
        req.params.flowId,
        req.params.nodeId,
        inputs,
        options,
      );
      res.status(201).json(result);
    }),
  );

  /**
   * POST /flow-runs/list - Get all flow runs with optional filtering and pagination
   * Core method: ✅ listFlowRuns(options?: QueryOptions<FlowRun>)
   * Body: QueryOptions<FlowRun>
   * Permission: flow-run:read
   */
  router.post(
    '/flow-runs/list',
    requirePermission('flow-run:read'),
    asyncHandler(async (req: Request, res: Response) => {
      const flowRuns = await invect.runs.list(req.body);
      res.json(flowRuns);
    }),
  );

  /**
   * GET /flow-runs/:flowRunId - Get specific flow run by ID
   * Core method: ✅ getFlowRunById(flowRunId: string)
   */
  router.get(
    '/flow-runs/:flowRunId',
    asyncHandler(async (req: Request, res: Response) => {
      const flowRun = await invect.runs.get(req.params.flowRunId);
      res.json(flowRun);
    }),
  );

  /**
   * GET /flows/:flowId/flow-runs - Get flow runs for a specific flow
   * Core method: ✅ listFlowRunsByFlowId(flowId: string)
   */
  router.get(
    '/flows/:flowId/flow-runs',
    asyncHandler(async (req: Request, res: Response) => {
      const flowRuns = await invect.runs.listByFlowId(req.params.flowId);
      res.json(flowRuns);
    }),
  );

  /**
   * POST /flow-runs/:flowRunId/resume - Resume paused flow execution
   * Core method: ✅ resumeExecution(executionId: string)
   */
  router.post(
    '/flow-runs/:flowRunId/resume',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invect.runs.resume(req.params.flowRunId);
      res.json(result);
    }),
  );

  /**
   * POST /flow-runs/:flowRunId/cancel - Cancel flow execution
   * Core method: ✅ cancelFlowRun(flowRunId: string)
   */
  router.post(
    '/flow-runs/:flowRunId/cancel',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invect.runs.cancel(req.params.flowRunId);
      res.json(result);
    }),
  );

  /**
   * POST /flow-runs/:flowRunId/pause - Pause flow execution
   * Core method: ✅ pauseFlowRun(flowRunId: string, reason?: string)
   */
  router.post(
    '/flow-runs/:flowRunId/pause',
    asyncHandler(async (req: Request, res: Response) => {
      const { reason } = req.body;
      const result = await invect.runs.pause(req.params.flowRunId, reason);
      res.json(result);
    }),
  );

  // =====================================
  // NODE EXECUTION ROUTES
  // =====================================

  /**
   * GET /flow-runs/:flowRunId/node-executions - Get node executions for a flow run
   * Core method: ✅ getNodeExecutionsByRunId(flowRunId: string)
   */
  router.get(
    '/flow-runs/:flowRunId/node-executions',
    asyncHandler(async (req: Request, res: Response) => {
      const nodeExecutions = await invect.runs.getNodeExecutions(req.params.flowRunId);
      res.json(nodeExecutions);
    }),
  );

  /**
   * GET /flow-runs/:flowRunId/stream - SSE stream of execution events
   * Core method: ✅ createFlowRunEventStream(flowRunId: string)
   *
   * Streams node-execution and flow-run updates in real time.
   * First event is a "snapshot", then incremental updates, ending with "end".
   */
  router.get(
    '/flow-runs/:flowRunId/stream',
    asyncHandler(async (req: Request, res: Response) => {
      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        const stream = invect.runs.createEventStream(req.params.flowRunId);

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
          res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', message })}\n\n`);
        } else {
          return res.status(500).json({ error: 'Internal Server Error', message });
        }
      } finally {
        res.end();
      }
    }),
  );

  /**
   * POST /node-executions/list - Get all node executions with optional filtering and pagination
   * Core method: ✅ listNodeExecutions(options?: QueryOptions<NodeExecution>)
   * Body: QueryOptions<NodeExecution>
   */
  router.post(
    '/node-executions/list',
    asyncHandler(async (req: Request, res: Response) => {
      const nodeExecutions = await invect.runs.listNodeExecutions(req.body);
      res.json(nodeExecutions);
    }),
  );

  // =====================================
  // NODE DATA & TESTING ROUTES
  // =====================================

  /**
   * POST /node-data/sql-query - Execute SQL query for testing
   * Core method: ✅ executeSqlQuery(request: SubmitSQLQueryRequest)
   */
  router.post(
    '/node-data/sql-query',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invect.testing.executeSqlQuery(req.body);
      res.json(result);
    }),
  );

  /**
   * POST /node-data/test-expression - Test a JS expression in the QuickJS sandbox
   * Core method: ✅ testJsExpression({ expression, context })
   */
  router.post(
    '/node-data/test-expression',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invect.testing.testJsExpression(req.body);
      res.json(result);
    }),
  );

  /**
   * POST /node-data/test-mapper - Test a mapper expression with mode semantics
   * Core method: ✅ testMapper({ expression, incomingData, mode? })
   */
  router.post(
    '/node-data/test-mapper',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invect.testing.testMapper(req.body);
      res.json(result);
    }),
  );

  /**
   * POST /node-data/model-query - Test model prompt
   * Core method: ✅ testModelPrompt(request: SubmitPromptRequest)
   */
  router.post(
    '/node-data/model-query',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invect.testing.testModelPrompt(req.body);
      res.json(result);
    }),
  );

  /**
   * GET /node-data/models - Get available AI models
   * Core method: ✅ getAvailableModels()
   */
  router.get(
    '/node-data/models',
    asyncHandler(async (req: Request, res: Response) => {
      const credentialId =
        typeof req.query.credentialId === 'string' ? req.query.credentialId.trim() : '';
      const providerQuery =
        typeof req.query.provider === 'string' ? req.query.provider.trim().toUpperCase() : '';

      if (credentialId) {
        const response = await invect.testing.getModelsForCredential(credentialId);
        res.json(response);
        return;
      }

      if (providerQuery) {
        if (!Object.values(BatchProvider).includes(providerQuery as BatchProvider)) {
          res.status(400).json({
            error: 'INVALID_PROVIDER',
            message: `Unsupported provider '${providerQuery}'. Expected one of: ${Object.values(BatchProvider).join(', ')}`,
          });
          return;
        }

        const provider = providerQuery as BatchProvider;
        const response = await invect.testing.getModelsForProvider(provider);
        res.json(response);
        return;
      }

      const models = await invect.testing.getAvailableModels();
      res.json(models);
    }),
  );

  /**
   * GET /node-data/databases - Get available databases
   * Core method: ✅ getAvailableDatabases()
   */
  router.get(
    '/node-data/databases',
    asyncHandler(async (req: Request, res: Response) => {
      const databases = invect.testing.getAvailableDatabases();
      res.json(databases);
    }),
  );

  /**
   * POST /node-config/update - Generic node configuration updates
   * Core method: ✅ handleNodeConfigUpdate(event: NodeConfigUpdateEvent)
   */
  router.post(
    '/node-config/update',
    asyncHandler(async (req: Request, res: Response) => {
      const response = await invect.actions.handleConfigUpdate(req.body);
      res.json(response);
    }),
  );

  router.get(
    '/node-definition/:nodeType',
    asyncHandler(async (req: Request, res: Response) => {
      const rawNodeType = req.params.nodeType ?? '';

      // Accept both legacy GraphNodeType enum values (uppercase) and
      // action IDs (e.g. "core.model", "gmail.send_message").
      const nodeTypeParam = rawNodeType.includes('.')
        ? rawNodeType // action ID — pass through as-is
        : rawNodeType.toUpperCase(); // legacy — uppercase to match enum

      const isLegacyEnum = !rawNodeType.includes('.') && nodeTypeParam in GraphNodeType;
      const isActionId = rawNodeType.includes('.');

      if (!isLegacyEnum && !isActionId) {
        res.status(400).json({
          error: 'INVALID_NODE_TYPE',
          message: `Unknown node type '${req.params.nodeType}'`,
        });
        return;
      }

      const params = parseParamsFromQuery(req.query.params);
      const changeField =
        typeof req.query.changeField === 'string' ? req.query.changeField : undefined;
      const changeValue = coerceQueryValue(req.query.changeValue);
      const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : undefined;
      const flowId = typeof req.query.flowId === 'string' ? req.query.flowId : undefined;

      const response = await invect.actions.handleConfigUpdate({
        nodeType: nodeTypeParam as GraphNodeType,
        nodeId: nodeId ?? `definition-${nodeTypeParam.toLowerCase()}`,
        flowId,
        params,
        change: changeField ? { field: changeField, value: changeValue } : undefined,
      });

      res.json(response);
    }),
  );

  /**
   * GET /nodes - Get available node definitions
   * Core method: ✅ getAvailableNodes()
   */
  router.get(
    '/nodes',
    asyncHandler(async (req: Request, res: Response) => {
      const nodes = invect.actions.getAvailableNodes();
      res.json(nodes);
    }),
  );

  /**
   * GET /actions/:actionId/fields/:fieldName/options - Load dynamic field options
   * Core method: ✅ resolveFieldOptions(actionId, fieldName, deps)
   *
   * Query params:
   *   deps - JSON-encoded object of dependency field values
   */
  router.get(
    '/actions/:actionId/fields/:fieldName/options',
    asyncHandler(async (req: Request, res: Response) => {
      const { actionId, fieldName } = req.params;

      let dependencyValues: Record<string, unknown> = {};
      if (typeof req.query.deps === 'string') {
        try {
          dependencyValues = JSON.parse(req.query.deps);
        } catch {
          res.status(400).json({ error: 'Invalid deps JSON' });
          return;
        }
      }

      const result = await invect.actions.resolveFieldOptions(actionId, fieldName, dependencyValues);
      res.json(result);
    }),
  );

  /**
   * POST /nodes/test - Test/execute a single node in isolation
   * Core method: ✅ testNode(nodeType, params, inputData)
   * Body: { nodeType: string, params: Record<string, unknown>, inputData?: Record<string, unknown> }
   */
  router.post(
    '/nodes/test',
    asyncHandler(async (req: Request, res: Response) => {
      const { nodeType, params, inputData } = req.body;

      if (!nodeType || typeof nodeType !== 'string') {
        return res.status(400).json({ error: 'nodeType is required and must be a string' });
      }

      if (!params || typeof params !== 'object') {
        return res.status(400).json({ error: 'params is required and must be an object' });
      }

      const result = await invect.testing.testNode(nodeType, params, inputData || {});
      res.json(result);
    }),
  );

  // =====================================
  // CREDENTIALS MANAGEMENT ROUTES
  // =====================================

  /**
   * POST /credentials - Create a new credential
   * Core method: ✅ createCredential(input: CreateCredentialInput)
   * Permission: credential:create
   */
  router.post(
    '/credentials',
    requirePermission('credential:create'),
    asyncHandler(async (req: Request, res: Response) => {
      // Resolve userId from auth context, body, or header; fallback to identity id or 'anonymous'
      const resolvedUserId =
        req.invectIdentity?.id ||
        (req as Request & { user?: { id?: string } }).user?.id ||
        req.body.userId ||
        req.header('x-user-id') ||
        'anonymous';

      const credential = await invect.credentials.create({ ...req.body, userId: resolvedUserId });
      res.status(201).json(credential);
    }),
  );

  /**
   * GET /credentials - List credentials with optional filtering and pagination
   * Core method: ✅ listCredentials(filters?: CredentialFilters, options?: QueryOptions)
   * Query params: type?, authType?, isActive?, page?, limit?
   * Permission: credential:read
   */
  router.get(
    '/credentials',
    requirePermission('credential:read'),
    asyncHandler(async (req: Request, res: Response) => {
      const filters: CredentialFilters = {
        type: req.query.type as CredentialFilters['type'],
        authType: req.query.authType as CredentialFilters['authType'],
        isActive:
          req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      };
      const credentials = await invect.credentials.list(filters);
      res.json(credentials);
    }),
  );

  /**
   * GET /credentials/:id - Get credential by ID
   * Core method: ✅ getCredential(id: string)
   * Permission: credential:read (with resource check)
   */
  router.get(
    '/credentials/:id',
    requirePermission('credential:read', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const credential = await invect.credentials.get(req.params.id);
      res.json(credential);
    }),
  );

  /**
   * PUT /credentials/:id - Update credential
   * Core method: ✅ updateCredential(id: string, input: UpdateCredentialInput)
   * Permission: credential:update (with resource check)
   */
  router.put(
    '/credentials/:id',
    requirePermission('credential:update', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const credential = await invect.credentials.update(req.params.id, req.body);
      res.json(credential);
    }),
  );

  /**
   * DELETE /credentials/:id - Delete credential
   * Core method: ✅ deleteCredential(id: string)
   * Permission: credential:delete (with resource check)
   */
  router.delete(
    '/credentials/:id',
    requirePermission('credential:delete', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      await invect.credentials.delete(req.params.id);
      res.status(204).send();
    }),
  );

  /**
   * POST /credentials/:id/test - Test credential validity
   * Core method: ✅ testCredential(id: string)
   * Permission: credential:read (with resource check)
   */
  router.post(
    '/credentials/:id/test',
    requirePermission('credential:read', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await invect.credentials.test(req.params.id);
      res.json(result);
    }),
  );

  /**
   * POST /credentials/:id/track-usage - Update credential last used timestamp
   * Core method: ✅ updateCredentialLastUsed(id: string)
   * Permission: credential:read (with resource check)
   */
  router.post(
    '/credentials/:id/track-usage',
    requirePermission('credential:read', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      await invect.credentials.updateLastUsed(req.params.id);
      res.status(204).send();
    }),
  );

  /**
   * GET /credentials/:id/webhook - Get webhook info for a credential
   * Core method: ✅ CredentialsService.getWebhookInfo(id)
   * Permission: credential:read (with resource check)
   */
  router.get(
    '/credentials/:id/webhook',
    requirePermission('credential:read', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const webhookInfo = await invect.credentials.getWebhookInfo(req.params.id);
      if (!webhookInfo) {
        return res.status(404).json({ error: 'Webhook not enabled for credential' });
      }
      res.json(webhookInfo);
    }),
  );

  /**
   * GET /credentials/:id/webhook-info - Backwards-compatible alias for webhook info
   */
  router.get(
    '/credentials/:id/webhook-info',
    requirePermission('credential:read', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const webhookInfo = await invect.credentials.getWebhookInfo(req.params.id);
      if (!webhookInfo) {
        return res.status(404).json({ error: 'Webhook not enabled for credential' });
      }
      res.json(webhookInfo);
    }),
  );

  /**
   * POST /credentials/:id/webhook - Enable webhook for a credential
   * Core method: ✅ CredentialsService.enableWebhook(id)
   * Permission: credential:update (with resource check)
   */
  router.post(
    '/credentials/:id/webhook',
    requirePermission('credential:update', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const webhookInfo = await invect.credentials.enableWebhook(req.params.id);
      res.json(webhookInfo);
    }),
  );

  /**
   * POST /credentials/:id/webhook/enable - Backwards-compatible alias for enabling webhooks
   */
  router.post(
    '/credentials/:id/webhook/enable',
    requirePermission('credential:update', (req) => req.params.id),
    asyncHandler(async (req: Request, res: Response) => {
      const webhookInfo = await invect.credentials.enableWebhook(req.params.id);
      res.json(webhookInfo);
    }),
  );

  /**
   * POST /webhooks/credentials/:webhookPath - Public credential webhook ingestion endpoint
   * Core methods: ✅ CredentialsService.findByWebhookPath(webhookPath), updateCredentialLastUsed(id)
   */
  router.post(
    '/webhooks/credentials/:webhookPath',
    asyncHandler(async (req: Request, res: Response) => {
      const credential = await invect.credentials.findByWebhookPath(req.params.webhookPath);

      if (!credential) {
        return res.status(404).json({ ok: false, error: 'Credential webhook not found' });
      }

      res.json({
        ok: true,
        credentialId: credential.id,
        triggeredFlows: 0,
        runs: [],
        body: req.body ?? null,
      });
    }),
  );

  /**
   * GET /credentials/expiring - Get credentials expiring soon
   * Core method: ✅ getExpiringCredentials(daysUntilExpiry?: number)
   * Query params: daysUntilExpiry (default: 7)
   * Permission: credential:read
   */
  router.get(
    '/credentials/expiring',
    requirePermission('credential:read'),
    asyncHandler(async (req: Request, res: Response) => {
      const daysUntilExpiry = req.query.daysUntilExpiry
        ? parseInt(req.query.daysUntilExpiry as string)
        : 7;

      const credentials = await invect.credentials.getExpiring(daysUntilExpiry);
      res.json(credentials);
    }),
  );

  /**
   * POST /credentials/test-request - Test a credential by making an HTTP request
   * This endpoint proxies HTTP requests to avoid CORS issues when testing credentials
   * Body: { url, method, headers, body }
   */
  router.post(
    '/credentials/test-request',
    asyncHandler(async (req: Request, res: Response) => {
      const { url, method = 'GET', headers = {}, body } = req.body;

      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      // Validate URL to prevent SSRF
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        res.status(400).json({ error: 'Only HTTP and HTTPS protocols are allowed' });
        return;
      }
      const h = parsedUrl.hostname;
      if (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '[::1]' ||
        h === '0.0.0.0' ||
        /^10\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
        /^192\.168\./.test(h) ||
        /^169\.254\./.test(h) ||
        /^f[cd]/i.test(h) ||
        h.includes(':')
      ) {
        res
          .status(400)
          .json({ error: 'Requests to private/internal network addresses are not allowed' });
        return;
      }

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: headers as Record<string, string>,
        };

        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
          fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        const responseText = await response.text();

        // Try to parse as JSON, fallback to text
        let responseBody: unknown;
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = responseText;
        }

        res.json({
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          body: responseBody,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Request failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }),
  );

  // =====================================
  // OAUTH2 ROUTES
  // =====================================

  /**
   * GET /credentials/oauth2/providers - List all available OAuth2 providers
   */
  router.get(
    '/credentials/oauth2/providers',
    asyncHandler(async (_req: Request, res: Response) => {
      const providers = invect.credentials.getOAuth2Providers();
      res.json(providers);
    }),
  );

  /**
   * GET /credentials/oauth2/providers/:providerId - Get a specific OAuth2 provider
   */
  router.get(
    '/credentials/oauth2/providers/:providerId',
    asyncHandler(async (req: Request, res: Response) => {
      const provider = invect.credentials.getOAuth2Provider(req.params.providerId);
      if (!provider) {
        res.status(404).json({ error: 'OAuth2 provider not found' });
        return;
      }
      res.json(provider);
    }),
  );

  /**
   * POST /credentials/oauth2/start - Start OAuth2 authorization flow
   * Body: { providerId, clientId, clientSecret, redirectUri, scopes?, returnUrl?, credentialName? }
   * Returns: { authorizationUrl, state }
   */
  router.post(
    '/credentials/oauth2/start',
    asyncHandler(async (req: Request, res: Response) => {
      const { providerId, clientId, clientSecret, redirectUri, scopes, returnUrl, credentialName } =
        req.body;

      if (!providerId || !clientId || !clientSecret || !redirectUri) {
        res.status(400).json({
          error: 'Missing required fields: providerId, clientId, clientSecret, redirectUri',
        });
        return;
      }

      const result = invect.credentials.startOAuth2Flow(
        providerId,
        { clientId, clientSecret, redirectUri },
        { scopes, returnUrl, credentialName },
      );

      res.json(result);
    }),
  );

  /**
   * POST /credentials/oauth2/callback - Handle OAuth2 callback and exchange code for tokens
   * Body: { code, state, clientId, clientSecret, redirectUri }
   * Creates a new credential with the obtained tokens
   */
  router.post(
    '/credentials/oauth2/callback',
    asyncHandler(async (req: Request, res: Response) => {
      const { code, state, clientId, clientSecret, redirectUri } = req.body;

      if (!code || !state || !clientId || !clientSecret || !redirectUri) {
        res.status(400).json({
          error: 'Missing required fields: code, state, clientId, clientSecret, redirectUri',
        });
        return;
      }

      const credential = await invect.credentials.handleOAuth2Callback(code, state, {
        clientId,
        clientSecret,
        redirectUri,
      });

      res.json(credential);
    }),
  );

  /**
   * GET /credentials/oauth2/callback - Handle OAuth2 callback (for redirect-based flows)
   * Query: code, state
   * Redirects to the return URL with credential ID or error
   */
  router.get(
    '/credentials/oauth2/callback',
    asyncHandler(async (req: Request, res: Response) => {
      const { code, state, error, error_description } = req.query;

      // Check for OAuth error
      if (error) {
        const errorMsg = error_description || error;
        // Get pending state to find return URL
        const pendingState = invect.credentials.getOAuth2PendingState(state as string);
        const returnUrl = pendingState?.returnUrl || '/';
        const separator = returnUrl.includes('?') ? '&' : '?';
        res.redirect(
          `${returnUrl}${separator}oauth_error=${encodeURIComponent(errorMsg as string)}`,
        );
        return;
      }

      if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state parameter' });
        return;
      }

      // Get pending state to retrieve client credentials and return URL
      const pendingState = invect.credentials.getOAuth2PendingState(state as string);
      if (!pendingState) {
        res.status(400).json({ error: 'Invalid or expired OAuth state' });
        return;
      }

      // For GET callback, we need the client credentials to be stored in session or config
      // This is a simplified flow - in production, you'd store these securely
      res.json({
        message:
          'OAuth callback received. Use POST /credentials/oauth2/callback to exchange the code.',
        code,
        state,
        providerId: pendingState.providerId,
        returnUrl: pendingState.returnUrl,
      });
    }),
  );

  /**
   * POST /credentials/:id/refresh - Manually refresh an OAuth2 credential's access token
   */
  router.post(
    '/credentials/:id/refresh',
    asyncHandler(async (req: Request, res: Response) => {
      const credential = await invect.credentials.refreshOAuth2Credential(req.params.id);
      res.json(credential);
    }),
  );

  // =====================================
  // TRIGGER MANAGEMENT ROUTES
  // =====================================

  /**
   * GET /flows/:flowId/triggers - List all trigger registrations for a flow
   * Core method: ✅ listTriggersForFlow(flowId)
   * Permission: flow:read (with resource check)
   */
  router.get(
    '/flows/:flowId/triggers',
    requirePermission('flow:read', (req) => req.params.flowId),
    asyncHandler(async (req: Request, res: Response) => {
      const triggers = await invect.triggers.list(req.params.flowId);
      res.json(triggers);
    }),
  );

  /**
   * POST /flows/:flowId/triggers - Create a trigger registration for a flow
   * Core method: ✅ createTrigger(input)
   * Permission: flow:update (with resource check)
   */
  router.post(
    '/flows/:flowId/triggers',
    requirePermission('flow:update', (req) => req.params.flowId),
    asyncHandler(async (req: Request, res: Response) => {
      const trigger = await invect.triggers.create({
        ...req.body,
        flowId: req.params.flowId,
      });
      res.status(201).json(trigger);
    }),
  );

  /**
   * POST /flows/:flowId/triggers/sync - Sync triggers from the flow definition
   * Core method: ✅ syncTriggersForFlow(flowId, definition)
   * Permission: flow:update (with resource check)
   */
  router.post(
    '/flows/:flowId/triggers/sync',
    requirePermission('flow:update', (req) => req.params.flowId),
    asyncHandler(async (req: Request, res: Response) => {
      const { definition } = req.body;
      const triggers = await invect.triggers.sync(req.params.flowId, definition);
      res.json(triggers);
    }),
  );

  /**
   * GET /triggers/:triggerId - Get a single trigger by ID
   * Core method: ✅ getTrigger(triggerId)
   */
  router.get(
    '/triggers/:triggerId',
    asyncHandler(async (req: Request, res: Response) => {
      const trigger = await invect.triggers.get(req.params.triggerId);
      if (!trigger) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Trigger ${req.params.triggerId} not found`,
        });
      }
      res.json(trigger);
    }),
  );

  /**
   * PUT /triggers/:triggerId - Update a trigger registration
   * Core method: ✅ updateTrigger(triggerId, input)
   */
  router.put(
    '/triggers/:triggerId',
    asyncHandler(async (req: Request, res: Response) => {
      const trigger = await invect.triggers.update(req.params.triggerId, req.body);
      if (!trigger) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Trigger ${req.params.triggerId} not found`,
        });
      }
      res.json(trigger);
    }),
  );

  /**
   * DELETE /triggers/:triggerId - Delete a trigger registration
   * Core method: ✅ deleteTrigger(triggerId)
   */
  router.delete(
    '/triggers/:triggerId',
    asyncHandler(async (req: Request, res: Response) => {
      await invect.triggers.delete(req.params.triggerId);
      res.status(204).send();
    }),
  );

  // =====================================
  // AGENT TOOLS ROUTES
  // =====================================

  /**
   * GET /agent/tools - List all available agent tools
   * Core method: ✅ getAgentTools()
   */
  router.get(
    '/agent/tools',
    asyncHandler(async (_req: Request, res: Response) => {
      const tools = invect.agent.getTools();
      res.json(tools);
    }),
  );

  // =====================================
  // CHAT ASSISTANT ROUTES
  // =====================================

  /**
   * GET /chat/status - Check if chat assistant is enabled
   * Core method: ✅ isChatEnabled()
   */
  router.get(
    '/chat/status',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json({ enabled: invect.chat.isEnabled() });
    }),
  );

  /**
   * POST /chat - Streaming chat assistant endpoint (SSE)
   * Core method: ✅ createChatStream()
   *
   * Request body: { messages: ChatMessage[], context: ChatContext }
   * Response: Server-Sent Events stream of ChatStreamEvents
   */
  router.post(
    '/chat',
    asyncHandler(async (req: Request, res: Response) => {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: '"messages" must be an array of chat messages',
        });
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders();

      // Resolve identity for RBAC (from middleware)
      const identity =
        (req as Request & { __invectIdentity?: InvectIdentity | null }).__invectIdentity ??
        undefined;

      try {
        const stream = await invect.chat.createStream({
          messages,
          context: context || {},
          identity,
        });

        // Stream events as SSE frames
        for await (const event of stream) {
          // Check if client disconnected
          if (res.destroyed) {
            break;
          }

          const data = JSON.stringify(event);
          res.write(`event: ${event.type}\ndata: ${data}\n\n`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Chat stream failed';
        // If headers already sent, write error as SSE event
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
    }),
  );

  // =====================================
  // CHAT MESSAGE PERSISTENCE ROUTES
  // =====================================

  /**
   * GET /chat/messages/:flowId - Get persisted chat messages for a flow
   * Core method: ✅ getChatMessages()
   */
  router.get(
    '/chat/messages/:flowId',
    asyncHandler(async (req: Request, res: Response) => {
      const messages = await invect.chat.getMessages(req.params.flowId);
      res.json(messages);
    }),
  );

  /**
   * PUT /chat/messages/:flowId - Save (replace) chat messages for a flow
   * Core method: ✅ saveChatMessages()
   *
   * Request body: { messages: Array<{ role, content, toolMeta? }> }
   */
  router.put(
    '/chat/messages/:flowId',
    asyncHandler(async (req: Request, res: Response) => {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: '"messages" must be an array',
        });
      }
      const saved = await invect.chat.saveMessages(req.params.flowId, messages);
      res.json(saved);
    }),
  );

  /**
   * DELETE /chat/messages/:flowId - Delete all chat messages for a flow
   * Core method: ✅ deleteChatMessages()
   */
  router.delete(
    '/chat/messages/:flowId',
    asyncHandler(async (req: Request, res: Response) => {
      await invect.chat.deleteMessages(req.params.flowId);
      res.json({ success: true });
    }),
  );

  // =====================================
  // PLUGIN ENDPOINTS
  // Mount API endpoints defined by plugins via invect.plugins.getEndpoints()
  // =====================================
  router.all(
    '/plugins/*',
    asyncHandler(async (req: Request, res: Response) => {
      const endpoints = invect.plugins.getEndpoints();
      // Strip the /plugins prefix — endpoint paths are defined relative to it
      // e.g. req.path="/plugins/auth/api/auth/sign-in/email" → "/auth/api/auth/sign-in/email"
      const pluginPath = (req.path || '/').replace(/^\/plugins/, '') || '/';
      const method = req.method.toUpperCase();

      const matchedEndpoint = endpoints.find((ep) => {
        if (ep.method !== method) {
          return false;
        }
        // Path matching with Express-style :params and * wildcards
        const pattern = ep.path
          .replace(/\*/g, '(.*)') // wildcard * → match any path segments
          .replace(/:([^/]+)/g, '([^/]+)'); // :param → match single segment
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
      const paramPattern = matchedEndpoint.path
        .replace(/\*/g, '(.*)') // wildcard * → match rest of path
        .replace(/:([^/]+)/g, (_m, name) => {
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
        if (!invect.auth.hasPermission(identity, matchedEndpoint.permission)) {
          return res.status(403).json({
            error: 'Forbidden',
            message: `Missing permission: ${matchedEndpoint.permission}`,
          });
        }
      }

      // Build a Web Request from the Express req so plugin handlers
      // (e.g. better-auth) that rely on the Fetch API Request work correctly.
      const webRequestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const webRequestInit: RequestInit = {
        method: req.method,
        headers: req.headers as HeadersInit,
      };
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
        // Re-serialize the already-parsed body so the stream is consumable
        webRequestInit.body = JSON.stringify(req.body || {});
      }
      const webRequest = new globalThis.Request(webRequestUrl, webRequestInit);

      const result = await matchedEndpoint.handler({
        body: req.body || {},
        params,
        query: (req.query || {}) as Record<string, string | undefined>,
        headers: req.headers as Record<string, string | undefined>,
        identity: req.invectIdentity ?? null,
        database: createPluginDatabaseApi(invect.plugins.getDatabaseConnection()),
        request: webRequest,
        core: {
          getPermissions: (identity) => invect.auth.getPermissions(identity),
          getAvailableRoles: () => invect.auth.getAvailableRoles(),
          getResolvedRole: (identity) => invect.auth.getResolvedRole(identity),
          authorize: (context) => invect.auth.authorize(context),
        },
      });

      // Handle raw Response objects
      if (result instanceof Response) {
        const arrayBuf = await result.arrayBuffer();
        res.status(result.status);
        // Forward all headers — but handle Set-Cookie specially since
        // Headers.forEach() combines multiple Set-Cookie values into one
        // comma-separated string, which breaks cookie parsing.
        result.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'set-cookie') {
            res.setHeader(key, value);
          }
        });
        // Use getSetCookie() to get individual Set-Cookie headers intact
        const setCookies = result.headers.getSetCookie?.();
        if (setCookies && setCookies.length > 0) {
          res.setHeader('set-cookie', setCookies);
        }
        res.send(Buffer.from(arrayBuf));
        return;
      }

      // Handle streaming responses
      if ('stream' in result && result.stream) {
        res.status(result.status || 200);
        res.setHeader('Content-Type', 'text/event-stream');
        const reader = result.stream.getReader();
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
      res.status(jsonResult.status || 200).json(jsonResult.body);
    }),
  );

  // Error handling middleware - must be last
  router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    }

    // Handle other known errors
    if (error.name === 'DatabaseError') {
      return res.status(500).json({
        error: 'Database Error',
        message: error.message || 'A database error occurred',
      });
    }

    // Handle generic errors
    // eslint-disable-next-line no-console
    console.error('Invect Router Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  return router;
}
