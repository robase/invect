import type { InvectPlugin } from '@invect/core';

export interface VercelWorkflowsPluginOptions {
  // Optional: base URL for the Vercel deployment (used in logging / config validation).
  deploymentUrl?: string;
}

// Server plugin for documenting Vercel Workflows integration with an Invect server.
// This plugin has no database schema and no server-side endpoints of its own —
// Vercel Workflows routes are authored and compiled by the user's Next.js app.
// Its purpose is to validate configuration and surface the integration context
// to other plugins (e.g. trigger registration).
export function vercelWorkflowsPlugin(options: VercelWorkflowsPluginOptions = {}): InvectPlugin {
  return {
    id: 'vercel-workflows',
    schema: {},
    actions: [],
    endpoints: [],

    async init(ctx) {
      ctx.logger.info('[vercel-workflows] Plugin initialised', {
        deploymentUrl: options.deploymentUrl ?? '(not set)',
        note: 'Flows run inside Vercel Workflow "use workflow" functions. No server-side routing is needed.',
      });
      return {};
    },
  };
}
