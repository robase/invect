// =============================================================================
// Version Control Plugin — Main Entry Point
// =============================================================================

import type { InvectPlugin, PluginEndpointContext } from '@invect/core';

import type { VersionControlPluginOptions } from './types';
import type { ConfigureSyncInput } from '../shared/types';
import { VC_SCHEMA } from './schema';
import { VcSyncService } from './sync-service';

/**
 * Create the Version Control plugin.
 *
 * Syncs Invect flows to a Git remote as readable `.flow.ts` files.
 *
 * ```ts
 * import { versionControl } from '@invect/version-control';
 * import { githubProvider } from '@invect/version-control/providers/github';
 *
 * new Invect({
 *   plugins: [
 *     versionControl({
 *       provider: githubProvider({ auth: { type: 'token', token: process.env.GITHUB_TOKEN! } }),
 *       repo: 'acme/workflows',
 *       mode: 'pr-per-publish',
 *     }),
 *   ],
 * });
 * ```
 */
export function versionControl(options: VersionControlPluginOptions): InvectPlugin {
  let syncService: VcSyncService;
  let pluginLogger: { debug: Function; info: Function; warn: Function; error: Function } = console;

  return {
    id: 'version-control',
    name: 'Version Control',

    schema: VC_SCHEMA,

    setupInstructions:
      'Run `npx invect-cli generate` then `npx invect-cli migrate` to create the vc_sync_config and vc_sync_history tables.',

    // =======================================================================
    // Initialization
    // =======================================================================

    init: async (ctx) => {
      pluginLogger = ctx.logger;
      syncService = new VcSyncService(options.provider, options, ctx.logger);
      ctx.logger.info(
        `Version control plugin initialized (provider: ${options.provider.id}, repo: ${options.repo})`,
      );
    },

    // =======================================================================
    // Endpoints
    // =======================================================================

    endpoints: [
      // -- Configure sync for a flow --
      {
        method: 'POST',
        path: '/vc/flows/:flowId/configure',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const input = ctx.body as ConfigureSyncInput;
          const config = await syncService.configureSyncForFlow(ctx.database, flowId, input);
          return { status: 200, body: config };
        },
      },

      // -- Get sync status for a flow --
      {
        method: 'GET',
        path: '/vc/flows/:flowId/status',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const status = await syncService.getFlowSyncStatus(ctx.database, flowId);
          return { status: 200, body: { flowId, ...status } };
        },
      },

      // -- Disconnect sync for a flow --
      {
        method: 'DELETE',
        path: '/vc/flows/:flowId/disconnect',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          await syncService.disconnectFlow(ctx.database, flowId);
          return { status: 200, body: { success: true } };
        },
      },

      // -- Push (DB → remote) --
      {
        method: 'POST',
        path: '/vc/flows/:flowId/push',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const identity = ctx.identity?.id;
          const result = await syncService.pushFlow(ctx.database, flowId, identity);
          return { status: result.success ? 200 : 409, body: result };
        },
      },

      // -- Pull (remote → DB) --
      {
        method: 'POST',
        path: '/vc/flows/:flowId/pull',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const identity = ctx.identity?.id;
          const result = await syncService.pullFlow(ctx.database, flowId, identity);
          return { status: result.success ? 200 : 404, body: result };
        },
      },

      // -- Publish (pr-per-publish mode) --
      {
        method: 'POST',
        path: '/vc/flows/:flowId/publish',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const identity = ctx.identity?.id;
          const result = await syncService.publishFlow(ctx.database, flowId, identity);
          return { status: result.success ? 200 : 400, body: result };
        },
      },

      // -- Force push (conflict resolution — DB wins) --
      {
        method: 'POST',
        path: '/vc/flows/:flowId/force-push',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const identity = ctx.identity?.id;
          const result = await syncService.forcePushFlow(ctx.database, flowId, identity);
          return { status: 200, body: result };
        },
      },

      // -- Force pull (conflict resolution — remote wins) --
      {
        method: 'POST',
        path: '/vc/flows/:flowId/force-pull',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const identity = ctx.identity?.id;
          const result = await syncService.forcePullFlow(ctx.database, flowId, identity);
          return { status: result.success ? 200 : 404, body: result };
        },
      },

      // -- Bulk push all synced flows --
      {
        method: 'POST',
        path: '/vc/push-all',
        handler: async (ctx: PluginEndpointContext) => {
          const configs = await syncService.listSyncedFlows(ctx.database);
          const identity = ctx.identity?.id;
          const results = [];
          for (const config of configs) {
            if (!config.enabled) {
              continue;
            }
            try {
              const result = await syncService.pushFlow(ctx.database, config.flowId, identity);
              results.push({ flowId: config.flowId, flowName: config.flowName, ...result });
            } catch (err) {
              results.push({
                flowId: config.flowId,
                flowName: config.flowName,
                success: false,
                error: (err as Error).message,
                action: 'push' as const,
              });
            }
          }
          return { status: 200, body: { results } };
        },
      },

      // -- Bulk pull all synced flows --
      {
        method: 'POST',
        path: '/vc/pull-all',
        handler: async (ctx: PluginEndpointContext) => {
          const configs = await syncService.listSyncedFlows(ctx.database);
          const identity = ctx.identity?.id;
          const results = [];
          for (const config of configs) {
            if (!config.enabled) {
              continue;
            }
            try {
              const result = await syncService.pullFlow(ctx.database, config.flowId, identity);
              results.push({ flowId: config.flowId, flowName: config.flowName, ...result });
            } catch (err) {
              results.push({
                flowId: config.flowId,
                flowName: config.flowName,
                success: false,
                error: (err as Error).message,
                action: 'pull' as const,
              });
            }
          }
          return { status: 200, body: { results } };
        },
      },

      // -- Webhook receiver --
      {
        method: 'POST',
        path: '/vc/webhook',
        isPublic: true,
        handler: async (ctx: PluginEndpointContext) => {
          if (!options.webhookSecret) {
            return { status: 400, body: { error: 'Webhook secret not configured' } };
          }

          // Verify signature
          const signature = ctx.headers['x-hub-signature-256'] ?? '';
          const body = JSON.stringify(ctx.body);
          if (!options.provider.verifyWebhookSignature(body, signature, options.webhookSecret)) {
            return { status: 401, body: { error: 'Invalid webhook signature' } };
          }

          // Handle PR merge events
          const action = (ctx.body as Record<string, unknown>).action;
          const pullRequest = (ctx.body as Record<string, unknown>).pull_request as
            | { merged: boolean; number: number }
            | undefined;

          if (action === 'closed' && pullRequest?.merged) {
            await handlePrMerged(ctx.database, pullRequest.number);
          }

          return { status: 200, body: { received: true } };
        },
      },

      // -- List all synced flows --
      {
        method: 'GET',
        path: '/vc/flows',
        handler: async (ctx: PluginEndpointContext) => {
          const flows = await syncService.listSyncedFlows(ctx.database);
          return { status: 200, body: { flows } };
        },
      },

      // -- Get sync history for a flow --
      {
        method: 'GET',
        path: '/vc/flows/:flowId/history',
        handler: async (ctx: PluginEndpointContext) => {
          const { flowId } = ctx.params;
          const limit = ctx.query.limit ? parseInt(ctx.query.limit, 10) : 20;
          const history = await syncService.getSyncHistory(ctx.database, flowId, limit);
          return { status: 200, body: { flowId, history } };
        },
      },
    ],

    // =======================================================================
    // Hooks
    // =======================================================================

    // NOTE: Auto-sync on flow version creation is intentionally NOT implemented
    // as a hook. The onResponse hook context doesn't include database access.
    // Instead, auto-sync is handled by the frontend calling POST /vc/flows/:id/push
    // after saving a flow version. This matches the "opt-in per flow" decision —
    // only flows with an enabled vc_sync_config record get synced.

    hooks: {},
  };

  // =========================================================================
  // Webhook handlers (internal)
  // =========================================================================

  async function handlePrMerged(
    db: import('@invect/core').PluginDatabaseApi,
    prNumber: number,
  ): Promise<void> {
    // Find the sync config with this active PR
    const rows = await db.query<{ flow_id: string }>(
      'SELECT flow_id FROM vc_sync_config WHERE active_pr_number = ?',
      [prNumber],
    );

    for (const row of rows) {
      // Clear PR state, update sync status
      await db.execute(
        `UPDATE vc_sync_config
         SET active_pr_number = NULL, active_pr_url = NULL, draft_branch = NULL, updated_at = ?
         WHERE flow_id = ?`,
        [new Date().toISOString(), row.flow_id],
      );

      // Record history
      const { randomUUID } = await import('node:crypto');
      await db.execute(
        `INSERT INTO vc_sync_history (id, flow_id, action, pr_number, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          row.flow_id,
          'pr-merged',
          prNumber,
          `PR #${prNumber} merged`,
          new Date().toISOString(),
        ],
      );

      // Try to clean up the draft branch
      const configs = await db.query<{ draft_branch: string | null; repo: string }>(
        'SELECT draft_branch, repo FROM vc_sync_config WHERE flow_id = ?',
        [row.flow_id],
      );
      if (configs[0]?.draft_branch) {
        try {
          await options.provider.deleteBranch(configs[0].repo, configs[0].draft_branch);
        } catch {
          // Branch may already be deleted by the merge
        }
      }

      pluginLogger.info('PR merged — sync updated', { flowId: row.flow_id, prNumber });
    }
  }
}
