/**
 * DemoApiClient — A mock ApiClient that returns static data for frontend-only demos.
 *
 * Uses a Proxy to intercept all method calls. Methods that have registered mock
 * data return it; all others return safe empty defaults (empty arrays, empty objects).
 * Write operations (create, update, delete, execute) are silently no-ops.
 */

import type {
  Flow,
  FlowRun,
  NodeExecution,
  Credential,
  ReactFlowData,
  PaginatedResponse,
  DashboardStats,
  AgentToolDefinition,
  NodeDefinition,
} from '../api/types';

export interface DemoData {
  /** Flows to show on the dashboard */
  flows?: Flow[];
  /** Map of flowId → ReactFlowData for the flow editor canvas */
  flowReactFlowData?: Record<string, ReactFlowData>;
  /** Node definitions for the palette and registry */
  nodeDefinitions?: NodeDefinition[];
  /** Agent tool definitions */
  agentTools?: AgentToolDefinition[];
  /** Dashboard stats override */
  dashboardStats?: Partial<DashboardStats>;
  /** Flow runs (execution history) */
  flowRuns?: FlowRun[];
  /** Node executions keyed by flowRunId */
  nodeExecutions?: Record<string, NodeExecution[]>;
  /** Credentials */
  credentials?: Credential[];
  /** Chat messages keyed by flowId */
  chatMessages?: Record<
    string,
    Array<{
      id: string;
      flowId: string;
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      toolMeta?: Record<string, unknown> | null;
      createdAt: string;
    }>
  >;
}

const EMPTY_PAGINATED = <T>(items: T[] = []): PaginatedResponse<T> => ({
  data: items,
  pagination: {
    page: 1,
    limit: items.length || 20,
    totalPages: 1,
  },
});

const DEFAULT_STATS: DashboardStats = {
  totalFlows: 0,
  totalRuns: 0,
  runsLast24h: 0,
  activeRuns: 0,
  successRate: 100,
  failedRunsLast24h: 0,
  runsByStatus: {},
  recentRuns: [],
};

// No-op function to satisfy lint rules about empty functions
const noop = () => {
  // intentionally empty — demo mock
};

/**
 * Creates a mock API client backed entirely by static data.
 * No HTTP requests are ever made.
 */
export function createDemoApiClient(data: DemoData = {}): Record<string, unknown> {
  const {
    flows = [],
    flowReactFlowData = {},
    nodeDefinitions = [],
    agentTools = [],
    dashboardStats = {},
    flowRuns = [],
    nodeExecutions = {},
    credentials = [],
    chatMessages = {},
  } = data;

  const stats: DashboardStats = {
    ...DEFAULT_STATS,
    totalFlows: flows.length,
    totalRuns: flowRuns.length,
    runsLast24h: flowRuns.length,
    successRate:
      flowRuns.length > 0
        ? Math.round(
            (flowRuns.filter((r) => r.status === 'SUCCESS').length / flowRuns.length) * 100,
          )
        : 100,
    runsByStatus: flowRuns.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    recentRuns: flowRuns.slice(0, 10),
    ...dashboardStats,
  } as DashboardStats;

  // Method implementations for read operations
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    // Identity
    getBaseURL: () => 'demo://mock',
    setBaseURL: noop,
    setUserId: noop,

    // Dashboard
    getDashboardStats: async () => stats,

    // Flows
    getFlows: async () => EMPTY_PAGINATED(flows),
    getFlow: async (...args: unknown[]) => {
      const id = args[0] as string;
      return flows.find((f) => f.id === id) ?? flows[0] ?? null;
    },
    getFlowReactFlowData: async (...args: unknown[]) => {
      const flowId = args[0] as string;
      return flowReactFlowData[flowId] ?? null;
    },
    getFlowVersions: async () => EMPTY_PAGINATED([]),

    // Nodes
    getAvailableNodes: async () => nodeDefinitions,
    resolveNodeDefinition: async () => null,
    loadFieldOptions: async () => [],

    // Agent tools
    getAgentTools: async () => agentTools,

    // Credentials
    listCredentials: async () => credentials,
    getCredential: async (...args: unknown[]) => {
      const id = args[0] as string;
      return credentials.find((c) => c.id === id) ?? null;
    },
    getCredentialUsage: async () => ({ flowsCount: 0, nodesCount: 0, lastUsedAt: null }),

    // OAuth2 (empty)
    getOAuth2Providers: async () => [],
    getOAuth2Provider: async () => null,

    // Flow runs
    getFlowRun: async (...args: unknown[]) => {
      const id = args[0] as string;
      return flowRuns.find((r) => r.id === id) ?? null;
    },
    getFlowRunsByFlowId: async (...args: unknown[]) => {
      const flowId = args[0] as string;
      const matching = flowRuns.filter((r) => r.flowId === flowId);
      return EMPTY_PAGINATED(matching);
    },
    getAllFlowRuns: async () => EMPTY_PAGINATED(flowRuns),

    // Node executions
    getNodeExecutionsByFlowRun: async (...args: unknown[]) => {
      const flowRunId = args[0] as string;
      return nodeExecutions[flowRunId] ?? [];
    },
    getAllNodeExecutions: async () => {
      const all = Object.values(nodeExecutions).flat();
      return EMPTY_PAGINATED(all);
    },

    // Models (empty)
    getModels: async () => [],
    getModelsForCredential: async () => [],

    // Triggers (empty)
    listTriggersForFlow: async () => [],
    getTrigger: async () => null,

    // Chat
    getChatStatus: async () => ({ enabled: true }),
    getChatModels: async () => [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    ],
    getChatMessages: async (...args: unknown[]) => {
      const flowId = args[0] as string;
      return chatMessages[flowId] ?? [];
    },

    // === Write operations (all no-ops for demo) ===
    createFlow: async () => flows[0] ?? {},
    createFlowWithVersion: async () => flows[0] ?? {},
    updateFlow: async () => flows[0] ?? {},
    deleteFlow: async () => undefined,
    createFlowVersion: async () => ({}),
    validateFlow: async () => ({ isValid: true, errors: [], warnings: [] }),
    executeFlow: async () => ({}),
    executeFlowToNode: async () => ({}),
    testNode: async () => ({}),
    testModelPrompt: async () => ({}),
    testJsExpression: async () => ({}),
    testMapper: async () => ({}),
    createCredential: async () => ({}),
    updateCredential: async () => ({}),
    deleteCredential: async () => undefined,
    testCredential: async () => ({ success: true }),
    testCredentialRequest: async () => ({}),
    startOAuth2Flow: async () => ({}),
    handleOAuth2Callback: async () => ({}),
    refreshOAuth2Credential: async () => ({}),
    pauseFlowRun: async () => ({}),
    resumeFlowRun: async () => ({}),
    cancelFlowRun: async () => ({}),
    createTrigger: async () => ({}),
    updateTrigger: async () => ({}),
    deleteTrigger: async () => undefined,
    syncTriggersForFlow: async () => ({}),
    sendChatMessage: async () => ({}),
    saveChatMessages: async () => ({}),
    deleteChatMessages: async () => ({}),
  };

  // Proxy catches any method not explicitly listed above and returns a safe fallback
  return new Proxy(methods, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop];
      }
      // Unknown method — return async no-op
      return async () => null;
    },
  });
}
