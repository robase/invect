// Framework-agnostic Service Factory for Invect core
import { FlowsService } from './flows/flows.service';
import { FlowRunsService } from './flow-runs/flow-runs.service';
import { NodeExecutionService } from './node-executions/node-execution.service';
import { FlowOrchestrationService } from './flow-orchestration.service';
import { DatabaseService } from './database/database.service';
import { NodeDataService } from './node-data.service';
import { GraphService } from './graph.service';
import { BatchJobsService } from './batch-jobs/batch-jobs.service';
import { BaseAIClient } from './ai/base-client';
import { CredentialsService } from './credentials/credentials.service';
import { EncryptionService } from './credentials/encryption.service';
import { AgentToolExecutionService } from './agent-tool-executions/agent-tool-execution.service';
import { FlowAccessService } from './auth/flow-access.service';
import { FlowTriggersService } from './triggers/flow-triggers.service';
import { CronSchedulerService } from './triggers/cron-scheduler.service';
import { ChatStreamService } from './chat/chat-stream.service';
import { ExecutionEventBus, getExecutionEventBus } from './execution-event-bus';
import { DatabaseError } from 'src/types/common/errors.types';
import { Logger, InvectConfig } from 'src/types/schemas';
import { NodeExecutorRegistry } from 'src/nodes/executor-registry';
import { FlowVersionsService } from './flow-versions/flow-versions.service';
import { ReactFlowRendererService } from './react-flow-renderer.service';
import type { PluginHookRunner } from 'src/types/plugin.types';

/**
 * Core Services container
 */
interface CoreServices {
  flowsService: FlowsService;
  flowVersionsService: FlowVersionsService;
  flowRunsService: FlowRunsService;
  nodeExecutionsService: NodeExecutionService;
  orchestrationService: FlowOrchestrationService;
  databaseService: DatabaseService;
  nodeDataService: NodeDataService;
  graphService: GraphService;
  batchJobsService: BatchJobsService;
  baseAIClient: BaseAIClient;
  reactFlowRendererService: ReactFlowRendererService;
  credentialsService: CredentialsService;
  agentToolExecutionService: AgentToolExecutionService;
  flowAccessService: FlowAccessService;
  triggersService: FlowTriggersService;
  cronScheduler: CronSchedulerService;
  chatStreamService: ChatStreamService;
  executionEventBus: ExecutionEventBus;
}

/**
 * Service Factory for creating and managing core services
 */
export class ServiceFactory {
  private services: CoreServices | null = null;
  private initialized = false;
  logger: Logger;

  constructor(
    private readonly config: InvectConfig,
    private readonly nodeRegistry: NodeExecutorRegistry,
    /** The Invect core instance (for passing to ChatStreamService → tools) */
    private readonly invectRef?: unknown,
    /** Action registry for chat system prompt context */
    private readonly actionRegistryRef?: unknown,
    /** Plugin hook runner for lifecycle hooks */
    private readonly pluginHookRunner?: PluginHookRunner,
    /** JS expression service for data mapper (sandbox) */
    private readonly jsExpressionServiceRef?: import('./templating/js-expression.service').JsExpressionService,
    /** Template service for resolving {{ }} expressions in node params */
    private readonly templateServiceRef?: import('./templating/template.service').TemplateService,
  ) {
    this.logger = config.logger; // Fallback to console if no logger provided
    if (!this.nodeRegistry) {
      throw new Error('Node registry is not provided, cannot initialize services without it');
    } else {
      this.logger.debug('Node registry provided, will register default executors');
    }
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Service factory already initialized');
      return;
    }

    this.logger.info('Initializing service factory');

    try {
      // 1. Create database service first (no dependencies)
      // Schema verification always runs on startup to catch missing tables/columns.
      const verificationOpts = {
        strict: false,
        plugins: (this.config.plugins || []) as import('src/types/plugin.types').InvectPlugin[],
      };
      const databaseService = new DatabaseService(
        this.config.baseDatabaseConfig,
        this.logger,
        verificationOpts,
        (this.config.plugins || []) as import('src/types/plugin.types').InvectPlugin[],
      );
      await databaseService.initialize();

      // 3. Create BatchJobsService (database only, no AI client)
      const batchJobsService = new BatchJobsService(this.logger, databaseService);

      // 4. Create BaseAIClient (adapters are registered dynamically from credentials)
      const baseAIClient = new BaseAIClient(this.logger, batchJobsService);

      // 5. Create other services
      const flowVersionsService = new FlowVersionsService(this.logger, databaseService);
      const flowsService = new FlowsService(this.logger, databaseService);
      const nodeExecutionsService = new NodeExecutionService(this.logger, databaseService);
      const flowRunsService = new FlowRunsService(this.logger, databaseService, flowsService);
      const nodeDataService = new NodeDataService(
        this.config,
        this.logger,
        databaseService,
        baseAIClient,
        this.templateServiceRef,
      );
      const graphService = new GraphService(this.logger, nodeExecutionsService);
      const reactFlowRendererService = new ReactFlowRendererService(
        this.logger,
        flowsService,
        flowVersionsService,
        flowRunsService,
        nodeExecutionsService,
      );

      // 5b. Create credentials service with encryption
      const encryptionService = new EncryptionService({
        masterKey: process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-production',
      });
      const credentialsService = new CredentialsService(
        databaseService.adapter,
        encryptionService,
        this.logger,
      );

      // 5c. Create agent tool execution service
      const agentToolExecutionService = new AgentToolExecutionService(this.logger, databaseService);

      // 5d. Create flow access service (always available; plugins like RBAC activate it)
      const flowAccessService = new FlowAccessService({
        adapter: databaseService.adapter,
        logger: this.logger,
      });

      // 5e. Create triggers service (needs orchestration, wired after orchestration is created)
      // Placeholder — we wire the real orchestrationService reference below.

      // 6. Create orchestration service with proper dependencies
      const orchestrationService = new FlowOrchestrationService(
        this.logger,
        flowRunsService,
        nodeExecutionsService,
        flowsService,
        nodeDataService,
        graphService,
        this.nodeRegistry,
        batchJobsService,
        credentialsService, // Add credentials service
        baseAIClient, // Add baseAIClient for agent prompt support
        agentToolExecutionService, // Add agent tool execution service
        // Execution config: heartbeat, flow timeout, stale-run detection
        {
          heartbeatIntervalMs: this.config.execution?.heartbeatIntervalMs ?? 30_000,
          flowTimeoutMs: this.config.execution?.flowTimeoutMs ?? 600_000,
          staleRunCheckIntervalMs: this.config.execution?.staleRunCheckIntervalMs ?? 60_000,
        },
        this.pluginHookRunner, // Plugin hooks for flow/node execution lifecycle
        this.jsExpressionServiceRef, // JS expression engine for data mapper
        this.templateServiceRef, // Template service for {{ }} expression resolution
      );

      // 6b. Create triggers service (depends on orchestration)
      const triggersService = new FlowTriggersService(
        this.logger,
        databaseService,
        flowsService,
        flowVersionsService,
        orchestrationService,
      );

      // 6c. Create cron scheduler (depends on triggers service)
      const cronScheduler = new CronSchedulerService(this.logger, triggersService);

      // 6d. Create chat stream service
      const chatStreamService = new ChatStreamService(
        this.logger,
        credentialsService,
        flowsService,
        flowVersionsService,
        (this.actionRegistryRef as import('src/actions').ActionRegistry) ?? null,
        this.invectRef,
      );

      // 6e. Wire execution event bus to services that write state
      const executionEventBus = getExecutionEventBus();
      flowRunsService.setEventBus(executionEventBus);
      nodeExecutionsService.setEventBus(executionEventBus);

      // Initialize services
      await Promise.all([
        batchJobsService.initialize(),
        flowsService.initialize(),
        flowRunsService.initialize(),
        nodeExecutionsService.initialize(),
        orchestrationService.initialize(),
        nodeDataService.initialize(),
        reactFlowRendererService.initialize(),
        agentToolExecutionService.initialize(),
        triggersService.initialize(),
      ]);

      // Store services
      this.services = {
        flowsService,
        flowVersionsService,
        flowRunsService,
        nodeExecutionsService,
        orchestrationService,
        databaseService,
        nodeDataService,
        graphService,
        batchJobsService,
        baseAIClient,
        reactFlowRendererService,
        credentialsService,
        agentToolExecutionService,
        flowAccessService,
        triggersService,
        cronScheduler,
        chatStreamService,
        executionEventBus,
      };

      this.initialized = true;
      this.logger.info('Service factory initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize service factory', error);
      throw new DatabaseError('Failed to initialize service factory', { error });
    }
  }

  /**
   * Get all services
   */
  getServices(): CoreServices {
    if (!this.services) {
      throw new Error('Service factory not initialized');
    }
    return this.services;
  }

  /**
   * Get flow service
   */
  getFlowService(): FlowsService {
    return this.getServices().flowsService;
  }

  /**
   * Get execution service
   */
  getFlowRunsService(): FlowRunsService {
    return this.getServices().flowRunsService;
  }

  /**
   * Get execution trace service
   */
  getNodeExecutionsService(): NodeExecutionService {
    return this.getServices().nodeExecutionsService;
  }

  /**
   * Get orchestration service
   */
  getOrchestrationService(): FlowOrchestrationService {
    return this.getServices().orchestrationService;
  }

  getFlowVersionsService() {
    return this.getServices().flowVersionsService;
  }

  /**
   * Get database service
   */
  getDatabaseService(): DatabaseService {
    return this.getServices().databaseService;
  }

  /**
   * Get node data service
   */
  getNodeDataService(): NodeDataService {
    return this.getServices().nodeDataService;
  }

  /**
   * Get graph service
   */
  getGraphService(): GraphService {
    return this.getServices().graphService;
  }

  /**
   * Get base AI client
   */
  getBaseAIClient(): BaseAIClient {
    return this.getServices().baseAIClient;
  }

  /**
   * Get React Flow renderer service
   */
  getReactFlowRendererService(): ReactFlowRendererService {
    return this.getServices().reactFlowRendererService;
  }

  /**
   * Get credentials service
   */
  getCredentialsService(): CredentialsService {
    return this.getServices().credentialsService;
  }

  /**
   * Get agent tool execution service
   */
  getAgentToolExecutionService(): AgentToolExecutionService {
    return this.getServices().agentToolExecutionService;
  }

  /**
   * Get flow access service (for Invect-managed flow permissions).
   */
  getFlowAccessService(): FlowAccessService {
    return this.getServices().flowAccessService;
  }

  /**
   * Get triggers service
   */
  getTriggersService(): FlowTriggersService {
    return this.getServices().triggersService;
  }

  /**
   * Get cron scheduler service
   */
  getCronScheduler(): CronSchedulerService {
    return this.getServices().cronScheduler;
  }

  /**
   * Get chat stream service
   */
  getChatStreamService(): ChatStreamService {
    return this.getServices().chatStreamService;
  }

  /**
   * Get execution event bus for SSE streaming
   */
  getExecutionEventBus(): ExecutionEventBus {
    return this.getServices().executionEventBus;
  }

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    services: Record<string, boolean>;
    timestamp: string;
  }> {
    const serviceResults: Record<string, boolean> = {};
    let allHealthy = true;

    if (!this.services) {
      return {
        healthy: false,
        services: { factory: false },
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Test database connectivity
      await this.services.databaseService.healthCheck();
      serviceResults.database = true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      serviceResults.database = false;
      allHealthy = false;
    }

    // For other services, we'll just check if they're initialized
    serviceResults.nodeData = !!this.services.nodeDataService;
    serviceResults.flow = !!this.services.flowsService;
    serviceResults.execution = !!this.services.flowRunsService;
    serviceResults.executionTrace = !!this.services.nodeExecutionsService;
    serviceResults.orchestration = !!this.services.orchestrationService;
    serviceResults.graph = !!this.services.graphService;

    return {
      healthy: allHealthy,
      services: serviceResults,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Close all services and cleanup
   */
  async close(): Promise<void> {
    if (!this.services) {
      this.logger.debug('Service factory not initialized, nothing to close');
      return;
    }

    this.logger.info('Closing service factory');

    try {
      await Promise.all([
        this.services.flowsService.close(),
        this.services.flowRunsService.close(),
        this.services.nodeExecutionsService.close(),
        this.services.orchestrationService.close(),
        this.services.databaseService.close(),
        this.services.nodeDataService.close(),
        // Note: GraphService doesn't have a close method as it's stateless
      ]);

      this.services = null;
      this.initialized = false;
      this.logger.info('Service factory closed successfully');
    } catch (error) {
      this.logger.error('Error closing service factory', error);
      throw new DatabaseError('Error closing service factory', { error });
    }
  }

  /**
   * Check if the factory is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
