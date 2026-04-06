// =============================================================================
// Version Control Plugin — Backend Types
// =============================================================================

import type { GitProvider } from './git-provider';
import type { VcSyncMode, VcSyncDirection } from '../shared/types';

/** Options for the versionControl() plugin factory */
export interface VersionControlPluginOptions {
  /** Git hosting provider (e.g. githubProvider({ auth: ... })) */
  provider: GitProvider;

  /** Default repository (owner/name) */
  repo: string;

  /** Default target branch */
  defaultBranch?: string;

  /** Directory in the repo for flow files (trailing slash) */
  path?: string;

  /** Default sync mode */
  mode?: VcSyncMode;

  /** Default sync direction */
  syncDirection?: VcSyncDirection;

  /** Webhook secret for verifying incoming webhooks */
  webhookSecret?: string;
}
