/**
 * createInvect() — Single async factory that returns a fully initialized InvectInstance.
 *
 * Replaces the two-phase `new Invect(config)` → `await initialize()` pattern.
 * The returned object is guaranteed to be ready for use — no initialization checks needed.
 */

import { ServiceFactory } from '../services/service-factory';
import { DefaultNodeRegistryFactory, NodeExecutorRegistry } from '../nodes/executor-registry';
import { InvectConfig, InvectConfigSchema } from '../schemas';
import { DatabaseError } from '../types/common/errors.types';
import { LoggerManager, type ScopedLoggingConfig } from '../utils/logger';
import { JsExpressionService, getTemplateService } from '../services/templating';
import type { TemplateService } from '../services/templating';
import { PluginManager } from '../services/plugin-manager';
import type { InvectPlugin } from '../types/plugin.types';
import { AuthorizationService, createAuthorizationService } from '../services/auth';
import {
  ActionRegistry,
  initializeGlobalActionRegistry,
  createToolExecutorForAction,
  registerBuiltinActions,
} from '../actions';
import {
  AgentToolRegistry,
  initializeGlobalToolRegistry,
  getGlobalToolRegistry,
} from '../services/agent-tools';
import { AgentNodeExecutor } from '../nodes/agent-executor';
import type { GraphNodeType } from '../types.internal';
import type { CredentialAuthType } from '../database/schema-sqlite';

import type { InvectInstance } from './types';
import { createFlowsAPI } from './flows';
import { createFlowVersionsAPI } from './flow-versions';
import { createFlowRunsAPI } from './flow-runs';
import { createCredentialsAPI } from './credentials';
import { createTriggersAPI } from './triggers';
import { createAgentAPI } from './agent';
import { createChatAPI } from './chat';
import { createActionsAPI } from './actions';
import { createTestingAPI } from './testing';
import { createAuthAPI } from './auth';
import { createPluginsAPI } from './plugins';

/**
 * Check if we're in a build-time environment where database connections should be avoided.
 */
function isBuildTime(): boolean {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return true;
  }
  if (process.env.VERCEL_ENV && process.env.CI) {
    return true;
  }
  if (
    process.env.CI &&
    (process.env.NODE_ENV === 'production' ||
      process.env.BUILD_PHASE ||
      process.argv.includes('build'))
  ) {
    return true;
  }
  return false;
}

/**
 * Register all actions as agent tools in the global tool registry.
 */
function registerActionsAsTools(actionRegistry: ActionRegistry): void {
  let toolRegistry: AgentToolRegistry;
  try {
    toolRegistry = getGlobalToolRegistry();
  } catch {
    return;
  }

  for (const action of actionRegistry.getAll()) {
    const toolDef = actionRegistry.toAgentToolDefinition(action.id);
    if (toolDef && !toolRegistry.has(toolDef.id)) {
      toolRegistry.register(toolDef, createToolExecutorForAction(action));
    }
  }
}

/**
 * Seed default credentials (non-blocking helper).
 */
async function seedDefaultCredentials(sf: ServiceFactory, config: InvectConfig): Promise<void> {
  const seeds = config.defaultCredentials;
  if (!seeds?.length) {
    return;
  }

  const credentialsService = sf.getCredentialsService();
  const existing = await credentialsService.list();
  const existingByName = new Map(existing.map((c) => [c.name, c]));

  for (const seed of seeds) {
    try {
      const { provider, ...rest } = seed;
      const metadata = { ...rest.metadata, ...(provider ? { provider } : {}) };
      const existingCred = existingByName.get(seed.name);

      if (existingCred) {
        await credentialsService.update(existingCred.id, {
          name: rest.name,
          type: rest.type,
          authType: rest.authType as CredentialAuthType,
          config: rest.config,
          description: rest.description,
          isShared: rest.isShared,
          metadata,
        });
        config.logger.debug(`Upserted credential "${seed.name}" (${existingCred.id})`);
      } else {
        const created = await credentialsService.create({
          name: rest.name,
          type: rest.type,
          authType: rest.authType as CredentialAuthType,
          config: rest.config,
          description: rest.description,
          isShared: rest.isShared,
          metadata,
        });
        // eslint-disable-next-line no-console
        console.log(`🔐 Seeded credential: ${created.name} (${created.id})`);
      }
    } catch (error) {
      config.logger.warn(`Failed to upsert credential "${seed.name}"`, error);
    }
  }
}

/**
 * Create a fully initialized Invect instance.
 *
 * This is the recommended way to create an Invect instance. Unlike `new Invect(config)`,
 * the returned object is guaranteed to be fully initialized and ready for use.
 *
 * @example
 * ```typescript
 * const invect = await createInvect({
 *   database: { type: 'sqlite', connectionString: 'file:./dev.db' },
 * });
 *
 * const flow = await invect.flows.create({ name: 'My Flow' });
 * const result = await invect.runs.start(flow.id, { input: 'hello' });
 *
 * await invect.shutdown();
 * ```
 */
export async function createInvect(config: InvectConfig): Promise<InvectInstance> {
  // Parse and validate config
  const parsedConfig = InvectConfigSchema.parse(config);

  // Build-time check (Next.js, Vercel)
  if (isBuildTime()) {
    throw new DatabaseError('Invect Core initialization skipped during build', {
      reason: 'build_time_skip',
      phase: process.env.NEXT_PHASE || 'unknown',
    });
  }

  // Initialize logger
  const loggingConfig: ScopedLoggingConfig = {
    level: parsedConfig.logging?.level || 'info',
    scopes: parsedConfig.logging?.scopes,
  };
  const loggerManager = new LoggerManager(loggingConfig);
  parsedConfig.logger = loggerManager.getBasicLogger();
  const logger = parsedConfig.logger;

  logger.info('Initializing Invect Core...');

  try {
    // Initialize authorization service
    const authService: AuthorizationService = createAuthorizationService({ logger });

    // Initialize plugin manager
    const pluginManager = new PluginManager(
      (parsedConfig.plugins as InvectPlugin[] | undefined) ?? [],
    );

    // Initialize action registry + built-in actions
    const actionRegistry: ActionRegistry = initializeGlobalActionRegistry(logger);
    registerBuiltinActions(actionRegistry);
    logger.info(
      `Registered ${actionRegistry.size} built-in actions from ${actionRegistry.getProviders().length} providers`,
    );

    // Initialize plugins (register plugin actions, call init hooks)
    await pluginManager.initializePlugins({
      config: parsedConfig as unknown as Record<string, unknown>,
      logger,
      registerAction: (action) => {
        actionRegistry.register(action);
      },
    });

    if (pluginManager.getPlugins().length > 0) {
      logger.info(
        `Initialized ${pluginManager.getPlugins().length} plugin(s): ${pluginManager
          .getPlugins()
          .map((p) => p.id)
          .join(', ')}`,
      );
    }

    // Initialize node registry
    const nodeRegistry: NodeExecutorRegistry =
      await DefaultNodeRegistryFactory.createDefault(logger);
    const toolRegistry = await initializeGlobalToolRegistry(logger);
    logger.debug(`Initialized agent tool registry with ${toolRegistry.size} tools`);

    // Update agent executor with tool registry
    const agentExecutor = nodeRegistry.get('AGENT' as GraphNodeType);
    if (agentExecutor && 'setToolRegistry' in agentExecutor) {
      (agentExecutor as unknown as AgentNodeExecutor).setToolRegistry(toolRegistry);
    }

    // Initialize JS expression engine (QuickJS sandbox for data mapper)
    let jsExpressionService: JsExpressionService | null = null;
    let templateService: TemplateService | null = null;
    try {
      jsExpressionService = new JsExpressionService({}, logger);
      await jsExpressionService.initialize();
      templateService = getTemplateService(jsExpressionService, logger);
      logger.debug('JS expression engine + template service initialized');
    } catch (error) {
      jsExpressionService = null;
      templateService = null;
      logger.warn(
        'JS expression engine unavailable; continuing without data mapper and template expression support',
        { error: error instanceof Error ? (error.stack ?? error.message) : String(error) },
      );
    }

    // Register action-based tools
    registerActionsAsTools(actionRegistry);

    // Initialize service factory
    const sf = new ServiceFactory(
      parsedConfig,
      nodeRegistry,
      actionRegistry,
      pluginManager,
      jsExpressionService ?? undefined,
      templateService ?? undefined,
    );
    await sf.initialize();

    // Build sub-APIs
    const flows = createFlowsAPI(sf, logger);
    const versions = createFlowVersionsAPI(sf, logger);
    const runs = createFlowRunsAPI(sf, logger);
    const credentials = createCredentialsAPI(sf, logger);
    const triggers = createTriggersAPI(sf, logger);
    const agent = createAgentAPI(sf);
    const chat = createChatAPI(sf);
    const actions = createActionsAPI(actionRegistry, nodeRegistry, sf, logger);
    const testing = createTestingAPI(
      sf,
      actionRegistry,
      nodeRegistry,
      jsExpressionService,
      templateService,
      parsedConfig,
    );
    const auth = createAuthAPI(authService, pluginManager, sf);
    const plugins = createPluginsAPI(pluginManager, sf);

    // Assemble the instance
    const instance: InvectInstance = {
      flows,
      versions,
      runs,
      credentials,
      triggers,
      agent,
      chat,
      actions,
      testing,
      auth,
      plugins,

      // Root-level logging
      getLogger(scope, context?) {
        return loggerManager.getLogger(scope, context);
      },
      getLoggerManager() {
        return loggerManager;
      },
      setLogLevel(scope, level) {
        loggerManager.setLogLevel(scope, level);
      },

      // Lifecycle
      async shutdown() {
        logger.info('Shutting down Invect Core...');

        try {
          // Mark in-progress flows as failed before tearing down services
          if (sf.isInitialized()) {
            try {
              const flowRunsService = sf.getFlowRunsService();
              const failedCount = await flowRunsService.failStaleRuns(0);
              if (failedCount > 0) {
                logger.warn(
                  `Graceful shutdown: marked ${failedCount} in-progress flow run(s) as FAILED`,
                );
              }
            } catch (error) {
              logger.error('Failed to mark in-progress runs during shutdown', error);
            }
          }

          // Shutdown plugins (reverse order)
          await pluginManager.shutdownPlugins(logger);

          // Close service factory
          await sf.close();

          // Dispose JS expression engine
          if (jsExpressionService) {
            jsExpressionService.dispose();
          }

          logger.info('Invect Core shutdown completed');
        } catch (error) {
          logger.error('Error during Invect Core shutdown', error);
          throw new DatabaseError('Invect Core shutdown failed', { error });
        }
      },

      async startBatchPolling() {
        await sf.getBaseAIClient().startBatchPolling();
      },

      async stopBatchPolling() {
        await sf.getBaseAIClient().stopBatchPolling();
      },

      async startCronScheduler() {
        const cronEnabled = parsedConfig.triggers?.cronEnabled ?? true;
        if (!cronEnabled) {
          logger.info('Cron scheduler disabled via config');
          return;
        }
        logger.info('Starting cron scheduler');
        await sf.getCronScheduler().start();
      },

      stopCronScheduler() {
        logger.info('Stopping cron scheduler');
        sf.getCronScheduler().stop();
      },

      async refreshCronScheduler() {
        await sf.getCronScheduler().refresh();
      },

      async healthCheck() {
        const h = await sf.healthCheck();
        return h.services;
      },
    };

    // Wire InvectInstance into ChatStreamService (post-init, breaking the circular dep)
    const chatService = sf.getChatStreamService();
    chatService.setInvectInstance(instance);

    // Seed default credentials (non-blocking)
    seedDefaultCredentials(sf, parsedConfig).catch((err) => {
      logger.error('Default credential seeding failed', err);
    });

    return instance;
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    logger.error('Failed to initialize Invect Core', error);
    throw new DatabaseError('Invect Core initialization failed', { error });
  }
}
