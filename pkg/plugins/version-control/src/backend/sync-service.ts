// =============================================================================
// Version Control Sync Service — orchestrates push/pull/publish operations
// =============================================================================

import { randomUUID } from 'node:crypto';

import type { GitProvider } from './git-provider';
import type { PluginDatabaseApi } from '@invect/core';
import type { VersionControlPluginOptions } from './types';
import type {
  VcSyncConfig,
  VcSyncHistoryRecord,
  VcSyncResult,
  VcSyncStatus,
  ConfigureSyncInput,
} from '../shared/types';
import { serializeFlowToTs } from './flow-serializer';

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  tags: string | null;
}

interface FlowVersionRow {
  flowId: string;
  version: number;
  invectDefinition: string;
}

type Logger = {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
};

export class VcSyncService {
  constructor(
    private provider: GitProvider,
    private options: VersionControlPluginOptions,
    private logger: Logger,
  ) {}

  // =========================================================================
  // Configuration
  // =========================================================================

  async configureSyncForFlow(
    db: PluginDatabaseApi,
    flowId: string,
    input: ConfigureSyncInput,
  ): Promise<VcSyncConfig> {
    // Check if flow exists
    const flows = await db.query<FlowRow>('SELECT id, name FROM flows WHERE id = ?', [flowId]);
    if (flows.length === 0) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const flow = flows[0];
    const id = randomUUID();
    const now = new Date().toISOString();

    const repo = input.repo ?? this.options.repo;
    const branch = input.branch ?? this.options.defaultBranch ?? 'main';
    const mode = input.mode ?? this.options.mode ?? 'direct-commit';
    const syncDirection = input.syncDirection ?? this.options.syncDirection ?? 'push';
    const filePath = input.filePath ?? this.buildFilePath(flow.name);

    // Upsert — delete existing config for this flow first
    await db.execute('DELETE FROM vc_sync_config WHERE flow_id = ?', [flowId]);

    await db.execute(
      `INSERT INTO vc_sync_config (id, flow_id, provider, repo, branch, file_path, mode, sync_direction, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, flowId, this.provider.id, repo, branch, filePath, mode, syncDirection, true, now, now],
    );

    return this.getSyncConfig(db, flowId) as Promise<VcSyncConfig>;
  }

  async getSyncConfig(db: PluginDatabaseApi, flowId: string): Promise<VcSyncConfig | null> {
    const rows = await db.query<VcSyncConfigRow>('SELECT * FROM vc_sync_config WHERE flow_id = ?', [
      flowId,
    ]);
    if (rows.length === 0) {
      return null;
    }
    return mapSyncConfigRow(rows[0]);
  }

  async disconnectFlow(db: PluginDatabaseApi, flowId: string): Promise<void> {
    const config = await this.getSyncConfig(db, flowId);
    if (!config) {
      return;
    }

    // If there's an active PR, close it
    if (config.activePrNumber) {
      try {
        await this.provider.closePullRequest(
          config.repo,
          config.activePrNumber,
          'Sync disconnected — flow unlinked from version control.',
        );
      } catch (err) {
        this.logger.warn('Failed to close PR on disconnect', { error: (err as Error).message });
      }
    }

    // If there's a draft branch, try to clean it up
    if (config.draftBranch) {
      try {
        await this.provider.deleteBranch(config.repo, config.draftBranch);
      } catch {
        // Ignore — branch may already be deleted
      }
    }

    await db.execute('DELETE FROM vc_sync_config WHERE flow_id = ?', [flowId]);
  }

  // =========================================================================
  // Push (DB → Remote)
  // =========================================================================

  async pushFlow(db: PluginDatabaseApi, flowId: string, identity?: string): Promise<VcSyncResult> {
    const config = await this.requireConfig(db, flowId);
    const { content, version } = await this.exportFlow(db, flowId);

    try {
      if (config.mode === 'direct-commit') {
        return await this.directCommit(db, config, content, version, identity);
      } else if (config.mode === 'pr-per-save') {
        return await this.commitToPrBranch(db, config, content, version, identity, true);
      } else {
        // pr-per-publish: commit to draft branch, no PR yet
        return await this.commitToDraftBranch(db, config, content, version, identity);
      }
    } catch (err) {
      const message = (err as Error).message;

      // SHA mismatch = conflict
      if (message.includes('409') || message.includes('sha')) {
        await this.recordHistory(db, flowId, 'conflict', { version, message, createdBy: identity });
        return {
          success: false,
          error: 'Conflict: remote file has changed. Use force-push or force-pull.',
          action: 'conflict',
        };
      }

      throw err;
    }
  }

  async forcePushFlow(
    db: PluginDatabaseApi,
    flowId: string,
    identity?: string,
  ): Promise<VcSyncResult> {
    const config = await this.requireConfig(db, flowId);
    const { content, version } = await this.exportFlow(db, flowId);

    // Get current remote SHA (if file exists) to force update
    const remote = await this.provider.getFileContent(config.repo, config.filePath, config.branch);
    const sha = remote?.sha;

    const result = await this.provider.createOrUpdateFile(
      config.repo,
      config.filePath,
      content,
      `chore(flow): force-push ${this.flowFileName(config.filePath)} v${version}`,
      { branch: config.branch, sha },
    );

    await this.updateConfigAfterSync(db, flowId, result.commitSha, version);
    await this.recordHistory(db, flowId, 'push', {
      commitSha: result.commitSha,
      version,
      message: 'Force push (local wins)',
      createdBy: identity,
    });

    return { success: true, commitSha: result.commitSha, action: 'push' };
  }

  // =========================================================================
  // Pull (Remote → DB)
  // =========================================================================

  async pullFlow(db: PluginDatabaseApi, flowId: string, identity?: string): Promise<VcSyncResult> {
    const config = await this.requireConfig(db, flowId);
    const remote = await this.provider.getFileContent(config.repo, config.filePath, config.branch);

    if (!remote) {
      return { success: false, error: 'Remote file not found', action: 'pull' };
    }

    // Check if we're already in sync
    if (config.lastCommitSha && remote.sha === config.lastCommitSha) {
      return { success: true, action: 'pull' }; // Already up to date
    }

    await this.importFlowContent(db, flowId, remote.content, identity);
    await this.updateConfigAfterSync(db, flowId, remote.sha, null);
    await this.recordHistory(db, flowId, 'pull', {
      commitSha: remote.sha,
      message: 'Pulled from remote',
      createdBy: identity,
    });

    return { success: true, commitSha: remote.sha, action: 'pull' };
  }

  async forcePullFlow(
    db: PluginDatabaseApi,
    flowId: string,
    identity?: string,
  ): Promise<VcSyncResult> {
    // Same as pull but ignores SHA check — always overwrites local
    const config = await this.requireConfig(db, flowId);
    const remote = await this.provider.getFileContent(config.repo, config.filePath, config.branch);

    if (!remote) {
      return { success: false, error: 'Remote file not found', action: 'pull' };
    }

    await this.importFlowContent(db, flowId, remote.content, identity);
    await this.updateConfigAfterSync(db, flowId, remote.sha, null);
    await this.recordHistory(db, flowId, 'pull', {
      commitSha: remote.sha,
      message: 'Force pull (remote wins)',
      createdBy: identity,
    });

    return { success: true, commitSha: remote.sha, action: 'pull' };
  }

  // =========================================================================
  // Publish (pr-per-publish mode — open PR from draft branch)
  // =========================================================================

  async publishFlow(
    db: PluginDatabaseApi,
    flowId: string,
    identity?: string,
  ): Promise<VcSyncResult> {
    const config = await this.requireConfig(db, flowId);

    if (config.mode !== 'pr-per-publish') {
      return {
        success: false,
        error: 'Publish is only available in pr-per-publish mode',
        action: 'pr-created',
      };
    }

    if (!config.draftBranch) {
      return {
        success: false,
        error: 'No draft branch found — push changes first',
        action: 'pr-created',
      };
    }

    // Check if there's already an active PR
    if (config.activePrNumber) {
      const pr = await this.provider.getPullRequest(config.repo, config.activePrNumber);
      if (pr.state === 'open') {
        return {
          success: true,
          prNumber: config.activePrNumber,
          prUrl: config.activePrUrl ?? undefined,
          action: 'pr-created',
        };
      }
      // PR was closed/merged — clear it and create a new one
    }

    const fileName = this.flowFileName(config.filePath);
    const pr = await this.provider.createPullRequest(config.repo, {
      title: `feat(flow): publish ${fileName}`,
      body: `Automated PR from Invect — publishing flow changes for \`${fileName}\`.`,
      head: config.draftBranch,
      base: config.branch,
    });

    await db.execute(
      'UPDATE vc_sync_config SET active_pr_number = ?, active_pr_url = ?, updated_at = ? WHERE flow_id = ?',
      [pr.number, pr.url, new Date().toISOString(), flowId],
    );

    await this.recordHistory(db, flowId, 'pr-created', {
      prNumber: pr.number,
      message: `PR #${pr.number} created`,
      createdBy: identity,
    });

    return { success: true, prNumber: pr.number, prUrl: pr.url, action: 'pr-created' };
  }

  // =========================================================================
  // Status & History
  // =========================================================================

  async getFlowSyncStatus(
    db: PluginDatabaseApi,
    flowId: string,
  ): Promise<{
    status: VcSyncStatus;
    config: VcSyncConfig | null;
    lastSync: VcSyncHistoryRecord | null;
  }> {
    const config = await this.getSyncConfig(db, flowId);
    if (!config) {
      return { status: 'not-connected', config: null, lastSync: null };
    }

    const history = await db.query<VcSyncHistoryRow>(
      'SELECT * FROM vc_sync_history WHERE flow_id = ? ORDER BY created_at DESC LIMIT 1',
      [flowId],
    );

    const lastSync = history.length > 0 ? mapHistoryRow(history[0]) : null;

    let status: VcSyncStatus = 'synced';
    if (!config.enabled) {
      status = 'not-connected';
    } else if (lastSync?.action === 'conflict') {
      status = 'conflict';
    } else if (!config.lastSyncedAt) {
      status = 'pending';
    } else {
      // Check if there are newer versions than what was synced
      const versions = await db.query<{ version: number }>(
        'SELECT MAX(version) as version FROM flow_versions WHERE flow_id = ?',
        [flowId],
      );
      const latestVersion = versions[0]?.version;
      if (latestVersion && config.lastSyncedVersion && latestVersion > config.lastSyncedVersion) {
        status = 'pending';
      }
    }

    return { status, config, lastSync };
  }

  async getSyncHistory(
    db: PluginDatabaseApi,
    flowId: string,
    limit = 20,
  ): Promise<VcSyncHistoryRecord[]> {
    const rows = await db.query<VcSyncHistoryRow>(
      'SELECT * FROM vc_sync_history WHERE flow_id = ? ORDER BY created_at DESC LIMIT ?',
      [flowId, limit],
    );
    return rows.map(mapHistoryRow);
  }

  async listSyncedFlows(
    db: PluginDatabaseApi,
  ): Promise<Array<VcSyncConfig & { flowName: string }>> {
    const rows = await db.query<VcSyncConfigRow & { flow_name: string }>(
      `SELECT vc_sync_config.*, flows.name as flow_name
       FROM vc_sync_config
       JOIN flows ON flows.id = vc_sync_config.flow_id
       ORDER BY vc_sync_config.updated_at DESC`,
    );
    return rows.map((r) => ({ ...mapSyncConfigRow(r), flowName: r.flow_name }));
  }

  // =========================================================================
  // Flow deletion hook
  // =========================================================================

  async onFlowDeleted(db: PluginDatabaseApi, flowId: string): Promise<void> {
    const config = await this.getSyncConfig(db, flowId);
    if (!config) {
      return;
    }

    // Delete the file from the remote
    try {
      const remote = await this.provider.getFileContent(
        config.repo,
        config.filePath,
        config.branch,
      );
      if (remote) {
        await this.provider.deleteFile(
          config.repo,
          config.filePath,
          `chore(flow): delete ${this.flowFileName(config.filePath)}`,
          { branch: config.branch, sha: remote.sha },
        );
        this.logger.info('Deleted flow file from remote', { flowId, filePath: config.filePath });
      }
    } catch (err) {
      this.logger.warn('Failed to delete flow file from remote', {
        flowId,
        error: (err as Error).message,
      });
    }

    // Close active PR if any
    if (config.activePrNumber) {
      try {
        await this.provider.closePullRequest(
          config.repo,
          config.activePrNumber,
          'Flow deleted — closing PR.',
        );
      } catch {
        // Ignore
      }
    }

    // Clean up draft branch
    if (config.draftBranch) {
      try {
        await this.provider.deleteBranch(config.repo, config.draftBranch);
      } catch {
        // Ignore
      }
    }

    // DB records cascade-delete from the flows FK
  }

  // =========================================================================
  // Internal — commit strategies
  // =========================================================================

  private async directCommit(
    db: PluginDatabaseApi,
    config: VcSyncConfig,
    content: string,
    version: number,
    identity?: string,
  ): Promise<VcSyncResult> {
    const sha = config.lastCommitSha ?? undefined;

    // Try to get remote SHA if we don't have one (first push)
    let remoteSha = sha;
    if (!remoteSha) {
      const remote = await this.provider.getFileContent(
        config.repo,
        config.filePath,
        config.branch,
      );
      remoteSha = remote?.sha;
    }

    const result = await this.provider.createOrUpdateFile(
      config.repo,
      config.filePath,
      content,
      `chore(flow): update ${this.flowFileName(config.filePath)} v${version}`,
      { branch: config.branch, sha: remoteSha },
    );

    await this.updateConfigAfterSync(db, config.flowId, result.commitSha, version);
    await this.recordHistory(db, config.flowId, 'push', {
      commitSha: result.commitSha,
      version,
      message: `Direct commit v${version}`,
      createdBy: identity,
    });

    return { success: true, commitSha: result.commitSha, action: 'push' };
  }

  private async commitToPrBranch(
    db: PluginDatabaseApi,
    config: VcSyncConfig,
    content: string,
    version: number,
    identity?: string,
    openPr: boolean = true,
  ): Promise<VcSyncResult> {
    const branchName = config.draftBranch ?? `invect/flow/${this.flowSlug(config.filePath)}`;

    // Create branch if it doesn't exist
    const existing = await this.provider.getBranch(config.repo, branchName);
    if (!existing) {
      await this.provider.createBranch(config.repo, branchName, config.branch);
    }

    // Get current file SHA on the branch
    const remote = await this.provider.getFileContent(config.repo, config.filePath, branchName);

    const result = await this.provider.createOrUpdateFile(
      config.repo,
      config.filePath,
      content,
      `chore(flow): update ${this.flowFileName(config.filePath)} v${version}`,
      { branch: branchName, sha: remote?.sha },
    );

    // Save draft branch reference
    await db.execute(
      'UPDATE vc_sync_config SET draft_branch = ?, updated_at = ? WHERE flow_id = ?',
      [branchName, new Date().toISOString(), config.flowId],
    );

    let prNumber = config.activePrNumber ?? undefined;
    let prUrl = config.activePrUrl ?? undefined;

    // Open PR if needed
    if (openPr && !prNumber) {
      const pr = await this.provider.createPullRequest(config.repo, {
        title: `feat(flow): update ${this.flowFileName(config.filePath)}`,
        body: `Automated PR from Invect — flow changes for \`${this.flowFileName(config.filePath)}\`.`,
        head: branchName,
        base: config.branch,
      });
      prNumber = pr.number;
      prUrl = pr.url;

      await db.execute(
        'UPDATE vc_sync_config SET active_pr_number = ?, active_pr_url = ?, updated_at = ? WHERE flow_id = ?',
        [prNumber, prUrl, new Date().toISOString(), config.flowId],
      );

      await this.recordHistory(db, config.flowId, 'pr-created', {
        commitSha: result.commitSha,
        prNumber,
        version,
        message: `PR #${prNumber} created`,
        createdBy: identity,
      });
    } else {
      await this.recordHistory(db, config.flowId, 'push', {
        commitSha: result.commitSha,
        version,
        message: `Updated PR branch v${version}`,
        createdBy: identity,
      });
    }

    await this.updateConfigAfterSync(db, config.flowId, result.commitSha, version);

    return {
      success: true,
      commitSha: result.commitSha,
      prNumber,
      prUrl,
      action: prNumber ? 'pr-created' : 'push',
    };
  }

  private async commitToDraftBranch(
    db: PluginDatabaseApi,
    config: VcSyncConfig,
    content: string,
    version: number,
    identity?: string,
  ): Promise<VcSyncResult> {
    // Same as PR branch commit but without opening a PR
    return this.commitToPrBranch(db, config, content, version, identity, false);
  }

  // =========================================================================
  // Internal — flow export / import
  // =========================================================================

  private async exportFlow(
    db: PluginDatabaseApi,
    flowId: string,
  ): Promise<{ content: string; version: number }> {
    const flows = await db.query<FlowRow>(
      'SELECT id, name, description, tags FROM flows WHERE id = ?',
      [flowId],
    );
    if (flows.length === 0) {
      throw new Error(`Flow not found: ${flowId}`);
    }
    const flow = flows[0];

    const versions = await db.query<FlowVersionRow>(
      'SELECT flow_id, version, invect_definition FROM flow_versions WHERE flow_id = ? ORDER BY version DESC LIMIT 1',
      [flowId],
    );
    if (versions.length === 0) {
      throw new Error(`No versions found for flow: ${flowId}`);
    }
    const fv = versions[0];

    const definition =
      typeof fv.invectDefinition === 'string'
        ? JSON.parse(fv.invectDefinition)
        : fv.invectDefinition;

    let tags: string[] | undefined;
    if (flow.tags) {
      try {
        tags = typeof flow.tags === 'string' ? JSON.parse(flow.tags) : flow.tags;
      } catch {
        tags = undefined;
      }
    }

    const content = serializeFlowToTs(definition, {
      name: flow.name,
      description: flow.description ?? undefined,
      tags,
    });

    return { content, version: fv.version };
  }

  private async importFlowContent(
    db: PluginDatabaseApi,
    flowId: string,
    content: string,
    identity?: string,
  ): Promise<void> {
    // 1. Write .flow.ts content to a temp file
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const tmpDir = mkdtempSync(join(tmpdir(), 'invect-vc-'));
    const tmpFile = join(tmpDir, 'import.flow.ts');

    try {
      writeFileSync(tmpFile, content, 'utf-8');

      // 2. Load the .flow.ts file via jiti (resolves defineFlow + helpers)
      const { createJiti } = await import('jiti');
      const jiti = createJiti(import.meta.url, { interopDefault: true });
      const result = await jiti.import(tmpFile);

      // The file's default export should be an InvectDefinition (from defineFlow)
      const definition = (result as Record<string, unknown>).default ?? result;

      if (
        !definition ||
        typeof definition !== 'object' ||
        !('nodes' in definition) ||
        !('edges' in definition)
      ) {
        throw new Error(
          'Imported .flow.ts file did not produce a valid InvectDefinition. ' +
            'Expected an object with "nodes" and "edges" arrays.',
        );
      }

      // 3. Get current latest version number
      const versions = await db.query<{ version: number }>(
        'SELECT MAX(version) as version FROM flow_versions WHERE flow_id = ?',
        [flowId],
      );
      const nextVersion = (versions[0]?.version ?? 0) + 1;

      // 4. Insert new flow version
      const defJson = typeof definition === 'string' ? definition : JSON.stringify(definition);

      await db.execute(
        `INSERT INTO flow_versions (flow_id, version, invect_definition, created_at, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [flowId, nextVersion, defJson, new Date().toISOString(), identity ?? null],
      );

      // 5. Update flow's live version
      await db.execute('UPDATE flows SET live_version_number = ?, updated_at = ? WHERE id = ?', [
        nextVersion,
        new Date().toISOString(),
        flowId,
      ]);

      this.logger.info('Flow imported from remote', {
        flowId,
        version: nextVersion,
      });
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tmpFile);
        const { rmdirSync } = await import('node:fs');
        rmdirSync(tmpDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // =========================================================================
  // Internal — helpers
  // =========================================================================

  private buildFilePath(flowName: string): string {
    const basePath = this.options.path ?? 'workflows/';
    const slug = flowName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${basePath}${slug}.flow.ts`;
  }

  private flowFileName(filePath: string): string {
    return filePath.split('/').pop() ?? filePath;
  }

  private flowSlug(filePath: string): string {
    const name = this.flowFileName(filePath);
    return name.replace(/\.flow\.ts$/, '');
  }

  private async requireConfig(db: PluginDatabaseApi, flowId: string): Promise<VcSyncConfig> {
    const config = await this.getSyncConfig(db, flowId);
    if (!config) {
      throw new Error(`Flow ${flowId} is not connected to version control`);
    }
    if (!config.enabled) {
      throw new Error(`Version control sync is disabled for flow ${flowId}`);
    }
    return config;
  }

  private async updateConfigAfterSync(
    db: PluginDatabaseApi,
    flowId: string,
    commitSha: string,
    version: number | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    if (version !== null) {
      await db.execute(
        'UPDATE vc_sync_config SET last_synced_at = ?, last_commit_sha = ?, last_synced_version = ?, updated_at = ? WHERE flow_id = ?',
        [now, commitSha, version, now, flowId],
      );
    } else {
      await db.execute(
        'UPDATE vc_sync_config SET last_synced_at = ?, last_commit_sha = ?, updated_at = ? WHERE flow_id = ?',
        [now, commitSha, now, flowId],
      );
    }
  }

  private async recordHistory(
    db: PluginDatabaseApi,
    flowId: string,
    action: import('../shared/types').VcSyncAction,
    opts: {
      commitSha?: string;
      prNumber?: number;
      version?: number;
      message?: string;
      createdBy?: string;
    },
  ): Promise<void> {
    await db.execute(
      `INSERT INTO vc_sync_history (id, flow_id, action, commit_sha, pr_number, version, message, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        flowId,
        action,
        opts.commitSha ?? null,
        opts.prNumber ?? null,
        opts.version ?? null,
        opts.message ?? null,
        new Date().toISOString(),
        opts.createdBy ?? null,
      ],
    );
  }
}

// =============================================================================
// Row mappers (snake_case DB rows → camelCase types)
// =============================================================================

interface VcSyncConfigRow {
  id: string;
  flow_id: string;
  provider: string;
  repo: string;
  branch: string;
  file_path: string;
  mode: string;
  sync_direction: string;
  last_synced_at: string | null;
  last_commit_sha: string | null;
  last_synced_version: number | null;
  draft_branch: string | null;
  active_pr_number: number | null;
  active_pr_url: string | null;
  enabled: boolean | number;
  created_at: string;
  updated_at: string;
}

interface VcSyncHistoryRow {
  id: string;
  flow_id: string;
  action: string;
  commit_sha: string | null;
  pr_number: number | null;
  version: number | null;
  message: string | null;
  created_at: string;
  created_by: string | null;
}

function mapSyncConfigRow(r: VcSyncConfigRow): VcSyncConfig {
  return {
    id: r.id,
    flowId: r.flow_id,
    provider: r.provider,
    repo: r.repo,
    branch: r.branch,
    filePath: r.file_path,
    mode: r.mode as VcSyncConfig['mode'],
    syncDirection: r.sync_direction as VcSyncConfig['syncDirection'],
    lastSyncedAt: r.last_synced_at,
    lastCommitSha: r.last_commit_sha,
    lastSyncedVersion: r.last_synced_version,
    draftBranch: r.draft_branch,
    activePrNumber: r.active_pr_number,
    activePrUrl: r.active_pr_url,
    enabled: r.enabled === true || r.enabled === 1,
  };
}

function mapHistoryRow(r: VcSyncHistoryRow): VcSyncHistoryRecord {
  return {
    id: r.id,
    flowId: r.flow_id,
    action: r.action as VcSyncHistoryRecord['action'],
    commitSha: r.commit_sha,
    prNumber: r.pr_number,
    version: r.version,
    message: r.message,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}
