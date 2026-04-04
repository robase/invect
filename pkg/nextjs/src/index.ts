import {
  BatchProvider,
  Invect,
  InvectConfig,
  GraphNodeType,
  createPluginDatabaseApi,
} from '@invect/core';
import { ZodError } from 'zod';

/**
 * Invect Next.js API Route Handler
 *
 * Usage in your Next.js app:
 *
 * // app/api/invect/[...invect]/route.ts
 * import { createInvectHandler } from "@invect/nextjs";
 *
 * const config = { ... }; // Your Invect config
 * const handler = createInvectHandler(config);
 *
 * export const GET = handler.GET;
 * export const POST = handler.POST;
 * export const PATCH = handler.PATCH;
 * export const PUT = handler.PUT;
 * export const DELETE = handler.DELETE;
 */

interface InvectHandler {
  GET: (request: Request, context: { params: Promise<{ invect: string[] }> }) => Promise<Response>;
  POST: (request: Request, context: { params: Promise<{ invect: string[] }> }) => Promise<Response>;
  PATCH: (
    request: Request,
    context: { params: Promise<{ invect: string[] }> },
  ) => Promise<Response>;
  PUT: (request: Request, context: { params: Promise<{ invect: string[] }> }) => Promise<Response>;
  DELETE: (
    request: Request,
    context: { params: Promise<{ invect: string[] }> },
  ) => Promise<Response>;
}

const parseParamsFromSearch = (value: string | null): Record<string, unknown> => {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export function createInvectHandler(config: InvectConfig): InvectHandler {
  let core: InstanceType<typeof Invect> | null = null;
  let initializationPromise: Promise<void> | null = null;

  // Lazy initialization - only initialize when first request comes in
  const ensureInitialized = async (): Promise<InstanceType<typeof Invect>> => {
    if (core && core.isInitialized()) {
      return core;
    }

    if (!initializationPromise) {
      initializationPromise = (async () => {
        try {
          // Skip initialization during build time
          if (
            process.env.NODE_ENV === 'production' &&
            process.env.NEXT_PHASE === 'phase-production-build'
          ) {
            throw new Error('Skipping database initialization during build');
          }

          core = new Invect(config);
          await core.initialize();
          await core.startBatchPolling();
          // eslint-disable-next-line no-console
          console.log('✅ Invect initialized and batch polling started');
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to initialize Invect Core:', error);
          core = null;
          initializationPromise = null;
          throw error;
        }
      })();
    }

    await initializationPromise;

    if (!core) {
      throw new Error('Invect Core failed to initialize');
    }

    return core;
  };

  // Helper function to get initialized core
  const getInitializedCore = async (): Promise<InstanceType<typeof Invect> | Response> => {
    try {
      return await ensureInitialized();
    } catch (error) {
      // The DatabaseService startup checks already log detailed, helpful
      // messages to the console. Avoid duplicating them — just log a short
      // pointer so the developer knows where to look.
      const errMsg = error instanceof Error ? error.message : String(error);

      // Only log the full error if it's NOT one of our own startup-check
      // errors (those have already been logged with the big banner).
      const isStartupCheckError =
        (errMsg.includes('missing') && errMsg.includes('table')) ||
        errMsg.includes('DATABASE NOT READY') ||
        errMsg.includes('DATABASE CONNECTION FAILED') ||
        errMsg.includes('connectivity check failed');

      if (!isStartupCheckError) {
        // eslint-disable-next-line no-console
        console.error('Invect initialization failed:', error);
      }

      return Response.json(
        {
          error: 'Service Unavailable',
          message: errMsg,
        },
        { status: 503 },
      );
    }
  };

  // Helper function to handle errors
  const handleError = (error: unknown): Response => {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        },
        { status: 400 },
      );
    }

    // Handle other known errors
    if (error && typeof error === 'object' && 'name' in error && error.name === 'DatabaseError') {
      return Response.json(
        {
          error: 'Database Error',
          message: error instanceof Error ? error.message : 'A database error occurred',
        },
        { status: 500 },
      );
    }

    // Handle errors that carry their own statusCode (e.g. ValidationError, NotFoundError)
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof (error as { statusCode: unknown }).statusCode === 'number'
    ) {
      const statusCode = (error as { statusCode: number }).statusCode;
      const message = error instanceof Error ? error.message : 'An error occurred';
      const code =
        'code' in error && typeof (error as { code: unknown }).code === 'string'
          ? (error as { code: string }).code
          : undefined;
      return Response.json(
        {
          error: statusCode < 500 ? 'Bad Request' : 'Internal Server Error',
          message,
          ...(code ? { code } : {}),
        },
        { status: statusCode },
      );
    }

    // Handle generic errors
    // eslint-disable-next-line no-console
    console.error('Invect Handler Error:', error);
    return Response.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      },
      { status: 500 },
    );
  };

  // Helper function to parse request body
  const parseRequestBody = async (request: Request) => {
    try {
      const contentType = request.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await request.json();
      }
      return {};
    } catch {
      return {};
    }
  };

  // Route handler function
  const handleRequest = async (
    request: Request,
    context: { params: Promise<{ invect: string[] }> },
  ): Promise<Response> => {
    try {
      // Get initialized core
      const coreOrResponse = await getInitializedCore();
      if (coreOrResponse instanceof Response) {
        return coreOrResponse;
      }
      const initializedCore = coreOrResponse;

      const method = request.method;
      const params = await context.params;
      const path = params.invect.join('/');

      // Clone the request before consuming the body so plugin handlers
      // (e.g. better-auth) can read the raw body stream themselves.
      const requestClone = request.clone();

      const body = await parseRequestBody(request);
      const url = new URL(request.url);
      const searchParams = url.searchParams;

      // =====================================
      // FLOW MANAGEMENT ROUTES
      // =====================================

      // GET /flows/list — simple GET endpoint
      if (method === 'GET' && path === 'flows/list') {
        const flows = await initializedCore.listFlows();
        return Response.json(flows);
      }

      if (method === 'POST' && path === 'flows/list') {
        const flows = await initializedCore.listFlows(body);
        return Response.json(flows);
      }

      if (method === 'POST' && path === 'flows') {
        const flow = await initializedCore.createFlow(body);
        return Response.json(flow, { status: 201 });
      }

      if (method === 'POST' && path === 'validate-flow') {
        const { flowId, flowDefinition } = body;
        const result = await initializedCore.validateFlowDefinition(flowId, flowDefinition);
        return Response.json(result);
      }

      // GET /flows/:flowId/react-flow
      if (method === 'GET' && path.match(/^flows\/[^/]+\/react-flow$/)) {
        const flowId = path.split('/')[1];
        const options: { version?: string; flowRunId?: string } = {};
        const version = searchParams.get('version');
        const flowRunId = searchParams.get('flowRunId');
        if (version) {
          options.version = version;
        }
        if (flowRunId) {
          options.flowRunId = flowRunId;
        }
        const result = await initializedCore.renderToReactFlow(flowId, options);
        return Response.json(result);
      }

      // =====================================
      // FLOW VERSION MANAGEMENT ROUTES
      // =====================================

      if (method === 'POST' && path.match(/^flows\/[^/]+\/versions\/list$/)) {
        const flowId = path.split('/')[1];
        const versions = await initializedCore.listFlowVersions(flowId, body);
        return Response.json(versions);
      }

      if (method === 'POST' && path.match(/^flows\/[^/]+\/versions$/) && !path.endsWith('/list')) {
        const flowId = path.split('/')[1];
        const version = await initializedCore.createFlowVersion(flowId, body);
        return Response.json(version, { status: 201 });
      }

      if (method === 'GET' && path.match(/^flows\/[^/]+\/versions\/[^/]+$/)) {
        const parts = path.split('/');
        const flowId = parts[1];
        const version = parts[3];
        const flowVersion = await initializedCore.getFlowVersion(flowId, version);
        if (!flowVersion) {
          return Response.json(
            { error: 'Not Found', message: `Version ${version} not found for flow ${flowId}` },
            { status: 404 },
          );
        }
        return Response.json(flowVersion);
      }

      // =====================================
      // FLOW RUN EXECUTION ROUTES
      // =====================================

      // POST /flows/:flowId/run-to-node/:nodeId
      if (method === 'POST' && path.match(/^flows\/[^/]+\/run-to-node\/[^/]+$/)) {
        const parts = path.split('/');
        const flowId = parts[1];
        const nodeId = parts[3];
        const { inputs = {}, options } = body;
        const result = await initializedCore.executeFlowToNode(flowId, nodeId, inputs, options);
        return Response.json(result, { status: 201 });
      }

      if (method === 'POST' && path.match(/^flows\/[^/]+\/run$/)) {
        const flowId = path.split('/')[1];
        const { inputs = {}, options } = body;
        const result = await initializedCore.startFlowRunAsync(flowId, inputs, options);
        return Response.json(result, { status: 201 });
      }

      if (method === 'POST' && path === 'flow-runs/list') {
        const flowRuns = await initializedCore.listFlowRuns(body);
        return Response.json(flowRuns);
      }

      if (method === 'POST' && path.match(/^flow-runs\/[^/]+\/resume$/)) {
        const flowRunId = path.split('/')[1];
        const result = await initializedCore.resumeExecution(flowRunId);
        return Response.json(result);
      }

      if (method === 'POST' && path.match(/^flow-runs\/[^/]+\/cancel$/)) {
        const flowRunId = path.split('/')[1];
        const result = await initializedCore.cancelFlowRun(flowRunId);
        return Response.json(result);
      }

      if (method === 'POST' && path.match(/^flow-runs\/[^/]+\/pause$/)) {
        const flowRunId = path.split('/')[1];
        const { reason } = body;
        const result = await initializedCore.pauseFlowRun(flowRunId, reason);
        return Response.json(result);
      }

      // GET /flow-runs/:flowRunId/node-executions
      if (method === 'GET' && path.match(/^flow-runs\/[^/]+\/node-executions$/)) {
        const flowRunId = path.split('/')[1];
        const nodeExecutions = await initializedCore.getNodeExecutionsByRunId(flowRunId);
        return Response.json(nodeExecutions);
      }

      // GET /flow-runs/:flowRunId/stream - SSE stream of execution events
      if (method === 'GET' && path.match(/^flow-runs\/[^/]+\/stream$/)) {
        const flowRunId = path.split('/')[1];
        const stream = initializedCore.createFlowRunEventStream(flowRunId);

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of stream) {
                const data = JSON.stringify(event);
                controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
              }
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Stream failed';
              controller.enqueue(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({ type: 'error', message })}\n\n`,
                ),
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      }

      // GET /flows/:flowId/flow-runs
      if (method === 'GET' && path.match(/^flows\/[^/]+\/flow-runs$/)) {
        const flowId = path.split('/')[1];
        const flowRuns = await initializedCore.listFlowRunsByFlowId(flowId);
        return Response.json(flowRuns);
      }

      // GET /flow-runs/:flowRunId (must come AFTER more specific flow-runs/ routes)
      if (method === 'GET' && path.match(/^flow-runs\/[^/]+$/)) {
        const flowRunId = path.split('/')[1];
        const flowRun = await initializedCore.getFlowRunById(flowRunId);
        return Response.json(flowRun);
      }

      // =====================================
      // NODE EXECUTION ROUTES
      // =====================================

      if (method === 'POST' && path === 'node-executions/list') {
        const nodeExecutions = await initializedCore.listNodeExecutions(body);
        return Response.json(nodeExecutions);
      }

      // =====================================
      // NODE DATA & TESTING ROUTES
      // =====================================

      if (method === 'POST' && path === 'node-data/sql-query') {
        const result = await initializedCore.executeSqlQuery(body);
        return Response.json(result);
      }

      if (method === 'POST' && path === 'node-data/test-expression') {
        const result = await initializedCore.testJsExpression(body);
        return Response.json(result);
      }

      if (method === 'POST' && path === 'node-data/test-mapper') {
        const result = await initializedCore.testMapper(body);
        return Response.json(result);
      }

      if (method === 'POST' && path === 'node-data/model-query') {
        const result = await initializedCore.testModelPrompt(body);
        return Response.json(result);
      }

      if (method === 'GET' && path === 'node-data/models') {
        const credentialId = searchParams.get('credentialId');
        const providerParam = searchParams.get('provider');

        if (credentialId) {
          return Response.json(await initializedCore.getModelsForCredential(credentialId));
        }
        if (providerParam) {
          const normalized = providerParam.trim().toUpperCase();
          if (!Object.values(BatchProvider).includes(normalized as BatchProvider)) {
            return Response.json(
              { error: 'INVALID_PROVIDER', message: `Unsupported provider '${providerParam}'` },
              { status: 400 },
            );
          }
          return Response.json(
            await initializedCore.getModelsForProvider(normalized as BatchProvider),
          );
        }
        return Response.json(await initializedCore.getAvailableModels());
      }

      if (method === 'GET' && path === 'node-data/databases') {
        return Response.json(initializedCore.getAvailableDatabases());
      }

      if (method === 'POST' && path === 'node-config/update') {
        const response = await initializedCore.handleNodeConfigUpdate(body);
        return Response.json(response);
      }

      if (method === 'GET' && path.startsWith('node-definition/')) {
        const rawNodeType = path.split('/')[1] ?? '';
        const nodeTypeParam = rawNodeType.includes('.') ? rawNodeType : rawNodeType.toUpperCase();

        const isLegacyEnum = !rawNodeType.includes('.') && nodeTypeParam in GraphNodeType;
        const isActionId = rawNodeType.includes('.');

        if (!isLegacyEnum && !isActionId) {
          return Response.json(
            { error: 'INVALID_NODE_TYPE', message: `Unknown node type '${rawNodeType}'` },
            { status: 400 },
          );
        }

        const params = parseParamsFromSearch(searchParams.get('params'));
        const changeField = searchParams.get('changeField') ?? undefined;
        const changeValue = searchParams.get('changeValue') ?? undefined;
        const nodeId = searchParams.get('nodeId') ?? `definition-${nodeTypeParam.toLowerCase()}`;
        const flowId = searchParams.get('flowId') ?? undefined;

        const response = await initializedCore.handleNodeConfigUpdate({
          nodeType: nodeTypeParam as GraphNodeType,
          nodeId,
          flowId,
          params,
          change: changeField ? { field: changeField, value: changeValue } : undefined,
        });
        return Response.json(response);
      }

      // GET /nodes — available node definitions
      if (method === 'GET' && path === 'nodes') {
        return Response.json(initializedCore.getAvailableNodes());
      }

      // GET /actions/:actionId/fields/:fieldName/options — dynamic field options
      if (method === 'GET' && path.match(/^actions\/[^/]+\/fields\/[^/]+\/options$/)) {
        const parts = path.split('/');
        const actionId = parts[1];
        const fieldName = parts[3];
        let dependencyValues: Record<string, unknown> = {};
        const depsParam = searchParams.get('deps');
        if (depsParam) {
          try {
            dependencyValues = JSON.parse(depsParam);
          } catch {
            return Response.json({ error: 'Invalid deps JSON' }, { status: 400 });
          }
        }
        return Response.json(
          await initializedCore.resolveFieldOptions(actionId, fieldName, dependencyValues),
        );
      }

      // POST /nodes/test — test a single node in isolation
      if (method === 'POST' && path === 'nodes/test') {
        const { nodeType, params: nodeParams, inputData } = body;
        if (!nodeType || typeof nodeType !== 'string') {
          return Response.json(
            { error: 'nodeType is required and must be a string' },
            { status: 400 },
          );
        }
        if (!nodeParams || typeof nodeParams !== 'object') {
          return Response.json(
            { error: 'params is required and must be an object' },
            { status: 400 },
          );
        }
        return Response.json(await initializedCore.testNode(nodeType, nodeParams, inputData || {}));
      }

      // =====================================
      // CREDENTIAL ROUTES
      // =====================================

      // OAuth2 routes (must come before generic credential routes)
      if (method === 'GET' && path === 'credentials/oauth2/providers') {
        return Response.json(initializedCore.getOAuth2Providers());
      }

      if (method === 'GET' && path.match(/^credentials\/oauth2\/providers\/[^/]+$/)) {
        const providerId = path.split('/')[3];
        const provider = initializedCore.getOAuth2Provider(providerId);
        if (!provider) {
          return Response.json({ error: 'OAuth2 provider not found' }, { status: 404 });
        }
        return Response.json(provider);
      }

      if (method === 'POST' && path === 'credentials/oauth2/start') {
        const {
          providerId,
          clientId,
          clientSecret,
          redirectUri,
          scopes,
          returnUrl,
          credentialName,
        } = body;
        if (!providerId || !clientId || !clientSecret || !redirectUri) {
          return Response.json(
            { error: 'Missing required fields: providerId, clientId, clientSecret, redirectUri' },
            { status: 400 },
          );
        }
        const result = initializedCore.startOAuth2Flow(
          providerId,
          { clientId, clientSecret, redirectUri },
          { scopes, returnUrl, credentialName },
        );
        return Response.json(result);
      }

      if (method === 'POST' && path === 'credentials/oauth2/callback') {
        const { code, state, clientId, clientSecret, redirectUri } = body;
        if (!code || !state || !clientId || !clientSecret || !redirectUri) {
          return Response.json(
            { error: 'Missing required fields: code, state, clientId, clientSecret, redirectUri' },
            { status: 400 },
          );
        }
        const credential = await initializedCore.handleOAuth2Callback(code, state, {
          clientId,
          clientSecret,
          redirectUri,
        });
        return Response.json(credential);
      }

      if (method === 'GET' && path === 'credentials/expiring') {
        const daysParam = searchParams.get('daysUntilExpiry');
        const days = daysParam ? parseInt(daysParam) : 7;
        return Response.json(await initializedCore.getExpiringCredentials(days));
      }

      if (method === 'POST' && path === 'credentials/test-request') {
        const {
          url: targetUrl,
          method: reqMethod = 'GET',
          headers: reqHeaders = {},
          body: reqBody,
        } = body;
        if (!targetUrl) {
          return Response.json({ error: 'URL is required' }, { status: 400 });
        }
        const fetchOptions: RequestInit = { method: reqMethod, headers: reqHeaders };
        if (reqBody && ['POST', 'PUT', 'PATCH'].includes(reqMethod)) {
          fetchOptions.body = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
        }
        const resp = await fetch(targetUrl, fetchOptions);
        const respText = await resp.text();
        let respBody: unknown;
        try {
          respBody = JSON.parse(respText);
        } catch {
          respBody = respText;
        }
        return Response.json({
          status: resp.status,
          statusText: resp.statusText,
          ok: resp.ok,
          body: respBody,
        });
      }

      if (method === 'POST' && path === 'credentials') {
        const credential = await initializedCore.createCredential(body);
        return Response.json(credential, { status: 201 });
      }

      if (method === 'GET' && path === 'credentials') {
        const filters: Record<string, unknown> = {};
        const type = searchParams.get('type');
        const authType = searchParams.get('authType');
        const isActive = searchParams.get('isActive');
        if (type) {
          filters.type = type;
        }
        if (authType) {
          filters.authType = authType;
        }
        if (isActive !== null) {
          filters.isActive = isActive === 'true';
        }
        return Response.json(
          await initializedCore.listCredentials(
            filters as import('@invect/core').CredentialFilters,
          ),
        );
      }

      // POST /credentials/:id/refresh
      if (method === 'POST' && path.match(/^credentials\/[^/]+\/refresh$/)) {
        const credId = path.split('/')[1];
        return Response.json(await initializedCore.refreshOAuth2Credential(credId));
      }

      // POST /credentials/:id/track-usage
      if (method === 'POST' && path.match(/^credentials\/[^/]+\/track-usage$/)) {
        const credId = path.split('/')[1];
        await initializedCore.updateCredentialLastUsed(credId);
        return new Response(null, { status: 204 });
      }

      // POST /credentials/:id/test
      if (method === 'POST' && path.match(/^credentials\/[^/]+\/test$/)) {
        const credentialId = path.split('/')[1];
        const result = await initializedCore.testCredential(credentialId);
        return Response.json(result);
      }

      // GET /credentials/:id
      if (method === 'GET' && path.match(/^credentials\/[^/]+$/)) {
        const credentialId = path.split('/')[1];
        return Response.json(await initializedCore.getCredential(credentialId));
      }

      // DELETE /credentials/:id
      if (method === 'DELETE' && path.match(/^credentials\/[^/]+$/)) {
        const credentialId = path.split('/')[1];
        await initializedCore.deleteCredential(credentialId);
        return new Response(null, { status: 204 });
      }

      // GET /triggers/:triggerId
      if (method === 'GET' && path.match(/^triggers\/[^/]+$/)) {
        const triggerId = path.split('/')[1];
        const trigger = await initializedCore.getTrigger(triggerId);
        if (!trigger) {
          return Response.json(
            { error: 'Not Found', message: `Trigger ${triggerId} not found` },
            { status: 404 },
          );
        }
        return Response.json(trigger);
      }

      if (method === 'PUT' && path.match(/^triggers\/[^/]+$/)) {
        const triggerId = path.split('/')[1];
        const trigger = await initializedCore.updateTrigger(triggerId, body);
        if (!trigger) {
          return Response.json({ error: 'Not Found' }, { status: 404 });
        }
        return Response.json(trigger);
      }

      if (method === 'DELETE' && path.match(/^triggers\/[^/]+$/)) {
        const triggerId = path.split('/')[1];
        await initializedCore.deleteTrigger(triggerId);
        return new Response(null, { status: 204 });
      }

      // =====================================
      // AGENT TOOLS ROUTES
      // =====================================

      if (method === 'GET' && path === 'agent/tools') {
        return Response.json(initializedCore.getAgentTools());
      }

      // =====================================
      // DASHBOARD ROUTES
      // =====================================

      if (method === 'GET' && path === 'dashboard/stats') {
        return Response.json(await initializedCore.getDashboardStats());
      }

      // =====================================
      // CHAT ROUTES
      // =====================================

      if (method === 'GET' && path === 'chat/status') {
        return Response.json({ enabled: initializedCore.isChatEnabled() });
      }

      // POST /chat - Streaming chat assistant endpoint (SSE via Web ReadableStream)
      if (method === 'POST' && path === 'chat') {
        const { messages, context: chatContext } = body;

        if (!messages || !Array.isArray(messages)) {
          return Response.json(
            { error: 'Validation Error', message: '"messages" must be an array of chat messages' },
            { status: 400 },
          );
        }

        const stream = await initializedCore.createChatStream({
          messages,
          context: chatContext || {},
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of stream) {
                const data = JSON.stringify(event);
                controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
              }
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Chat stream failed';
              controller.enqueue(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({ type: 'error', message, recoverable: false })}\n\n`,
                ),
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      }

      if (method === 'GET' && path.match(/^chat\/messages\/[^/]+$/)) {
        const flowId = path.split('/')[2];
        return Response.json(await initializedCore.getChatMessages(flowId));
      }

      if (method === 'PUT' && path.match(/^chat\/messages\/[^/]+$/)) {
        const flowId = path.split('/')[2];
        const { messages } = body;
        if (!messages || !Array.isArray(messages)) {
          return Response.json({ error: '"messages" must be an array' }, { status: 400 });
        }
        return Response.json(await initializedCore.saveChatMessages(flowId, messages));
      }

      if (method === 'DELETE' && path.match(/^chat\/messages\/[^/]+$/)) {
        const flowId = path.split('/')[2];
        await initializedCore.deleteChatMessages(flowId);
        return Response.json({ success: true });
      }

      // =====================================
      // FLOW CRUD (generic — must come AFTER all more-specific /flows/ routes)
      // =====================================

      if (method === 'GET' && path.match(/^flows\/[^/]+$/)) {
        const flowId = path.split('/')[1];
        return Response.json(await initializedCore.getFlow(flowId));
      }

      if (method === 'PUT' && path.match(/^flows\/[^/]+$/)) {
        const flowId = path.split('/')[1];
        return Response.json(await initializedCore.updateFlow(flowId, body));
      }

      if (method === 'DELETE' && path.match(/^flows\/[^/]+$/)) {
        const flowId = path.split('/')[1];
        await initializedCore.deleteFlow(flowId);
        return new Response(null, { status: 204 });
      }

      // =====================================
      // PLUGIN ENDPOINTS
      // Delegate to plugin-defined routes under the plugins/ prefix
      // =====================================
      if (path.startsWith('plugins/')) {
        const pluginPath = '/' + path.replace(/^plugins\/?/, '');
        const endpoints = initializedCore.getPluginEndpoints();

        const matchedEndpoint = endpoints.find((ep) => {
          if (ep.method !== method) {
            return false;
          }
          const pattern = ep.path
            .replace(/\*/g, '(.*)') // wildcard * → match any path segments
            .replace(/:([^/]+)/g, '([^/]+)'); // :param → match single segment
          return new RegExp(`^${pattern}$`).test(pluginPath);
        });

        if (!matchedEndpoint) {
          return Response.json(
            { error: 'Not Found', message: `Plugin route ${method} ${pluginPath} not found` },
            { status: 404 },
          );
        }

        // Extract path params
        const paramNames: string[] = [];
        const paramPattern = matchedEndpoint.path
          .replace(/\*/g, '(.*)') // wildcard * → match rest of path
          .replace(/:([^/]+)/g, (_m: string, name: string) => {
            paramNames.push(name);
            return '([^/]+)';
          });
        const paramMatch = new RegExp(`^${paramPattern}$`).exec(pluginPath);
        const pluginParams: Record<string, string> = {};
        if (paramMatch) {
          paramNames.forEach((name, i) => {
            pluginParams[name] = paramMatch[i + 1] || '';
          });
        }

        // Resolve identity for this request by running plugin onRequest hooks.
        // The auth plugin writes the resolved session identity onto the context object.
        const pluginRequestContext = {
          path: '/' + path.replace(/^plugins\/?/, ''),
          method,
          identity: null as import('@invect/core').InvectIdentity | null,
        };
        const hookResult = await initializedCore
          .getPluginHookRunner()
          .runOnRequest(requestClone.clone(), pluginRequestContext);
        if (hookResult.intercepted && hookResult.response) {
          return hookResult.response;
        }

        const pluginResult = await matchedEndpoint.handler({
          body,
          params: pluginParams,
          query: Object.fromEntries(new URL(request.url).searchParams.entries()),
          headers: (() => {
            const h: Record<string, string | undefined> = {};
            request.headers.forEach((v, k) => {
              h[k] = v;
            });
            return h;
          })(),
          identity: pluginRequestContext.identity,
          database: createPluginDatabaseApi(initializedCore.getDatabaseConnection()),
          request: requestClone,
          core: {
            getPermissions: (identity) => initializedCore.getPermissions(identity),
            getAvailableRoles: () => initializedCore.getAvailableRoles(),
            getResolvedRole: (identity) =>
              initializedCore.getAuthService().getResolvedRole(identity),
            isFlowAccessTableEnabled: () => initializedCore.isFlowAccessTableEnabled(),
            listFlowAccess: (flowId) => initializedCore.listFlowAccess(flowId),
            grantFlowAccess: (input) => initializedCore.grantFlowAccess(input),
            revokeFlowAccess: (accessId) => initializedCore.revokeFlowAccess(accessId),
            getAccessibleFlowIds: (userId, teamIds) =>
              initializedCore.getAccessibleFlowIds(userId, teamIds),
            getFlowPermission: (flowId, userId, teamIds) =>
              initializedCore.getFlowPermission(flowId, userId, teamIds),
            authorize: (context) => initializedCore.authorize(context),
          },
        });

        // Handle raw Response objects
        if (pluginResult instanceof Response) {
          return pluginResult;
        }

        // Handle streaming responses
        if ('stream' in pluginResult && pluginResult.stream) {
          return new Response(pluginResult.stream as ReadableStream, {
            status: pluginResult.status || 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }

        // Standard JSON response
        const jsonBody = 'body' in pluginResult ? pluginResult.body : null;
        return Response.json(jsonBody, { status: pluginResult.status || 200 });
      }

      // Route not found
      return Response.json(
        {
          error: 'Not Found',
          message: `Route ${method} /${path} not found`,
        },
        { status: 404 },
      );
    } catch (error) {
      return handleError(error);
    }
  };

  return {
    GET: handleRequest,
    POST: handleRequest,
    PATCH: handleRequest,
    PUT: handleRequest,
    DELETE: handleRequest,
  };
}

/**
 * Convenience function for creating a simple handler when you don't need catch-all routing
 * This creates individual route handlers for specific endpoints
 */
export function createInvectEndpoint(config: InvectConfig) {
  let core: InstanceType<typeof Invect> | null = null;
  let initializationPromise: Promise<void> | null = null;

  const ensureInitialized = async (): Promise<InstanceType<typeof Invect>> => {
    if (core && core.isInitialized()) {
      return core;
    }

    if (!initializationPromise) {
      initializationPromise = (async () => {
        try {
          core = new Invect(config);
          await core.initialize();
          await core.startBatchPolling();
          // eslint-disable-next-line no-console
          console.log('✅ Invect batch polling started');
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to initialize Invect Core:', error);
          core = null;
          initializationPromise = null;
          throw error;
        }
      })();
    }

    await initializationPromise;

    if (!core) {
      throw new Error('Invect Core failed to initialize');
    }

    return core;
  };

  return {
    core: () => core,

    // Helper to create individual endpoint handlers
    createEndpoint: (
      handler: (core: InstanceType<typeof Invect>, request: Request) => Promise<Response>,
    ) => {
      return async (request: Request) => {
        try {
          const initializedCore = await ensureInitialized();
          return await handler(initializedCore, request);
        } catch (error) {
          if (error instanceof ZodError) {
            return Response.json(
              {
                error: 'Validation Error',
                message: 'Invalid request data',
                details: error.errors.map((err) => ({
                  path: err.path.join('.'),
                  message: err.message,
                  code: err.code,
                })),
              },
              { status: 400 },
            );
          }

          // eslint-disable-next-line no-console
          console.error('Invect Endpoint Error:', error);
          return Response.json(
            {
              error: 'Internal Server Error',
              message: 'An unexpected error occurred',
            },
            { status: 500 },
          );
        }
      };
    },
  };
}

// Re-export types from core for convenience
export type { InvectConfig } from '@invect/core';
