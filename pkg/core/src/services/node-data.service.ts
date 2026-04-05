// Node Data Service - Framework-agnostic node testing and data helpers
import jsonLogic from 'json-logic-js';
import { DatabaseService } from './database/database.service';
import { Logger, InvectConfig, InvectDatabaseConfig } from 'src/schemas';
import { DatabaseError, ValidationError } from 'src/types/common/errors.types';
import { Model, BaseAIClient, BatchProvider } from './ai/base-client';
import type { TemplateService } from './templating/template.service';

type BasePromptRequest = {
  prompt: string;
  model: string;
  provider: BatchProvider;
  /** Credential ID used to resolve the API key for this request. */
  credentialId?: string;
  outputJsonSchema?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
};

export interface PromptRequest extends BasePromptRequest {
  useBatchProcessing?: false;
}

export interface BatchRequest extends BasePromptRequest {
  useBatchProcessing: true;
  nodeId: string;
  flowRunId: string;
}

export type SubmitPromptRequest = PromptRequest | BatchRequest;

/**
 * Database connection configuration for SQL queries
 */
export interface DatabaseConnectionConfig {
  /** Database type: sqlite, postgres, mysql */
  type: 'sqlite' | 'postgres' | 'mysql';
  /** Connection string (e.g., postgres://user:pass@host:5432/dbname) */
  connectionString: string;
  /** Optional: SSL configuration */
  ssl?: boolean | { rejectUnauthorized?: boolean };
  /** Optional: Connection pool size */
  poolSize?: number;
}

export interface SubmitSQLQueryRequest {
  query: string;
  /** Database connection configuration from credential */
  connectionConfig: DatabaseConnectionConfig;
}

export type SQLQueryResult =
  | {
      success: true;
      data: Record<string, unknown>[];
      columns: string[];
      rowCount: number;
      query: string;
    }
  | {
      success: false;
      error: string;
      query: string;
    };

/**
 * Node Data Service implementation
 * Provides testing and validation utilities for different node types
 */
export class NodeDataService {
  private initialized = false;
  private cachedListModels: {
    models: Model[];
    defaultModel: string;
  } | null = null;
  private cachedProviderModels = new Map<
    BatchProvider,
    {
      models: Model[];
      defaultModel: string;
      fetchedAt: number;
    }
  >();
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 60 minutes in milliseconds

  constructor(
    private readonly config: InvectConfig,
    private readonly logger: Logger,
    private readonly databaseService: DatabaseService,
    private readonly aiClient: BaseAIClient,
    private readonly templateService?: TemplateService,
  ) {}

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('NodeDataService already initialized');
      return;
    }

    this.logger.info('Initializing NodeDataService');

    try {
      // The database service should already be initialized by the service factory
      if (!this.databaseService) {
        throw new DatabaseError('Database service is required for NodeDataService');
      }

      this.initialized = true;
      this.logger.info('NodeDataService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize NodeDataService', error);
      throw error;
    }
  }

  /**
   * Close the service
   */
  async close(): Promise<void> {
    if (!this.initialized) {
      this.logger.debug('NodeDataService not initialized, nothing to close');
      return;
    }

    this.logger.info('Closing NodeDataService');
    this.initialized = false;
    this.cachedListModels = null;
    this.logger.info('NodeDataService closed successfully');
  }

  // =====================================
  // SQL QUERY TESTING METHODS
  // =====================================

  /**
   * Execute a database query using credential-based connection config
   */
  async runSqlQuery({ query, connectionConfig }: SubmitSQLQueryRequest): Promise<SQLQueryResult> {
    this.ensureInitialized();

    try {
      // Build database config from credential connection config
      // Map 'postgres' to 'postgresql' for InvectDatabaseConfig compatibility
      const dbType = connectionConfig.type === 'postgres' ? 'postgresql' : connectionConfig.type;
      const dbConfig: InvectDatabaseConfig = {
        id: `credential-${connectionConfig.type}`,
        type: dbType as 'postgresql' | 'sqlite' | 'mysql',
        connectionString: connectionConfig.connectionString,
      };

      const result = await this.databaseService.executeQuery(query, dbConfig);

      // Extract column names from first row if available
      const columns = result.length > 0 ? Object.keys(result[0] as object) : [];
      const rowCount = result.length;

      this.logger.debug('Query executed successfully', {
        rowCount,
        columnCount: columns.length,
        databaseType: connectionConfig.type,
      });

      return {
        success: true,
        data: result,
        columns: columns,
        rowCount: rowCount,
        query: query,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Database query failed', { error: errorMessage, query });

      return {
        success: false,
        error: errorMessage,
        query: query,
      };
    }
  }

  /**
   * Get available databases
   */
  getAvailableDatabases(): InvectDatabaseConfig[] {
    this.ensureInitialized();
    return [this.config.database];
  }

  async runTemplateReplacement(
    template: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    this.ensureInitialized();

    try {
      if (this.templateService) {
        const result = this.templateService.render(template, variables);
        this.logger.debug('Template processed successfully', { templateLength: template.length });
        // Always return string for this API (used by template_string action)
        if (result === null || result === undefined) {
          return '';
        }
        if (typeof result === 'object') {
          return JSON.stringify(result);
        }
        return String(result);
      }
      // Fallback: no template service available — return template as-is
      this.logger.warn('TemplateService not available, returning template unprocessed');
      return template;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Template processing failed', { error: errorMessage, template });
      throw new Error(`Template processing failed: ${errorMessage}`);
    }
  }

  /**
   * Helper method to safely parse JSON
   */
  private tryParseJSON(text: string): object | undefined {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  testJsonLogic(conditionLogic: Record<string, unknown>, evaluationData: object): boolean {
    this.ensureInitialized();

    try {
      // Use json-logic-js to apply the logic rules to the evaluation data
      const result = jsonLogic.apply(conditionLogic, evaluationData);

      // json-logic can return various types, but for condition testing we need a boolean
      // Convert truthy/falsy values to strict boolean
      return Boolean(result);
    } catch (error) {
      // Log the error for debugging purposes
      this.logger.error('JSON Logic evaluation failed', {
        error: error instanceof Error ? error.message : String(error),
        conditionLogic,
        evaluationData,
      });

      // For safety, return false when logic evaluation fails
      return false;
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<{
    models: Model[];
    defaultModel: string;
  }> {
    this.ensureInitialized();

    const now = Date.now();
    if (this.cachedListModels && now - this.lastFetchTime < this.CACHE_DURATION) {
      return this.cachedListModels;
    }

    try {
      const configuredProviders = this.getConfiguredProviders();
      const aggregatedModels: Model[] = [];
      let defaultModel: string | undefined;

      if (configuredProviders.length === 0) {
        this.logger.warn('No AI providers configured. Returning empty model list');
      }

      for (const provider of configuredProviders) {
        try {
          const providerResult = await this.getModelsForProvider(provider);
          aggregatedModels.push(...providerResult.models);
          if (!defaultModel) {
            defaultModel = providerResult.defaultModel;
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch models for provider ${provider}`, error);
        }
      }

      if (!defaultModel) {
        defaultModel = aggregatedModels[0]?.id || 'No model available';
      }

      const result = {
        models: aggregatedModels,
        defaultModel,
      };

      this.cachedListModels = result;
      this.lastFetchTime = now;

      this.logger.debug('Retrieved available models', { count: result.models.length });

      return result;
    } catch (error) {
      this.logger.error('Failed to get available models', error);
      return this.cachedListModels || { models: [], defaultModel: 'No model available' };
    }
  }

  async getModelsForProvider(provider: BatchProvider): Promise<{
    models: Model[];
    defaultModel: string;
  }> {
    this.ensureInitialized();

    const cached = this.cachedProviderModels.get(provider);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < this.CACHE_DURATION) {
      return { models: cached.models, defaultModel: cached.defaultModel };
    }

    const providerResult = await this.aiClient.listModelsForProvider(provider);
    const filteredModels = this.filterChatCompletionModels(provider, providerResult.models);

    this.cachedProviderModels.set(provider, {
      models: filteredModels,
      defaultModel: providerResult.defaultModel,
      fetchedAt: now,
    });

    return { models: filteredModels, defaultModel: providerResult.defaultModel };
  }

  private filterChatCompletionModels(provider: BatchProvider, models: Model[]): Model[] {
    if (models.length === 0) {
      return models;
    }

    if (provider === BatchProvider.OPENAI) {
      return models.filter((model) => {
        const id = model.id.toLowerCase();
        if (!id.startsWith('gpt')) {
          return false;
        }
        return !/(audio|embedding|search|tts|vision)/.test(id);
      });
    }

    if (provider === BatchProvider.ANTHROPIC) {
      return models.filter((model) => model.id.toLowerCase().startsWith('claude'));
    }

    return models;
  }

  private getConfiguredProviders(): BatchProvider[] {
    // Providers are now configured via credentials in the UI.
    // Return all known providers so model listing can attempt each.
    return [BatchProvider.OPENAI, BatchProvider.ANTHROPIC, BatchProvider.OPENROUTER];
  }

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ValidationError('NodeDataService not initialized. Call initialize() first.');
    }
  }
}
