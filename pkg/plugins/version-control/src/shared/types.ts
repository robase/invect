// =============================================================================
// Version Control Plugin — Shared Types (browser-safe, no runtime code)
// =============================================================================

/** Supported sync modes */
export const VC_SYNC_MODES = ['direct-commit', 'pr-per-save', 'pr-per-publish'] as const;
export type VcSyncMode = (typeof VC_SYNC_MODES)[number];

/** Sync direction */
export const VC_SYNC_DIRECTIONS = ['push', 'pull', 'bidirectional'] as const;
export type VcSyncDirection = (typeof VC_SYNC_DIRECTIONS)[number];

/** Sync history action types */
export type VcSyncAction = 'push' | 'pull' | 'pr-created' | 'pr-merged' | 'conflict';

/** Status of a synced flow */
export type VcSyncStatus = 'synced' | 'pending' | 'conflict' | 'not-connected' | 'error';

/** Git provider authentication config */
export type GitProviderAuth =
  | { type: 'token'; token: string }
  | { type: 'app'; appId: string; privateKey: string; installationId?: number }
  | { type: 'credential'; credentialId: string };

/** Sync config record (mirrors vc_sync_config table) */
export interface VcSyncConfig {
  id: string;
  flowId: string;
  provider: string;
  repo: string;
  branch: string;
  filePath: string;
  mode: VcSyncMode;
  syncDirection: VcSyncDirection;
  lastSyncedAt: string | null;
  lastCommitSha: string | null;
  lastSyncedVersion: number | null;
  draftBranch: string | null;
  activePrNumber: number | null;
  activePrUrl: string | null;
  enabled: boolean;
}

/** Sync history record (mirrors vc_sync_history table) */
export interface VcSyncHistoryRecord {
  id: string;
  flowId: string;
  action: VcSyncAction;
  commitSha: string | null;
  prNumber: number | null;
  version: number | null;
  message: string | null;
  createdAt: string;
  createdBy: string | null;
}

/** Sync status response for a flow */
export interface VcFlowSyncStatus {
  flowId: string;
  status: VcSyncStatus;
  config: VcSyncConfig | null;
  lastSync: VcSyncHistoryRecord | null;
}

/** Configure sync request body */
export interface ConfigureSyncInput {
  repo?: string;
  branch?: string;
  filePath?: string;
  mode?: VcSyncMode;
  syncDirection?: VcSyncDirection;
  enabled?: boolean;
}

/** Push/pull result */
export interface VcSyncResult {
  success: boolean;
  commitSha?: string;
  prNumber?: number;
  prUrl?: string;
  error?: string;
  action: VcSyncAction;
}
