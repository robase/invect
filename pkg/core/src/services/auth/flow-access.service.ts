/**
 * Flow Access Service
 *
 * Manages flow-level access permissions stored in the Invect database.
 * Supports both user-level and team-level access control.
 *
 * Uses the InvectAdapter for database operations (no direct Drizzle usage).
 */

import type { Logger } from '../../types/schemas-fresh/invect-config';
import type { InvectAdapter, WhereClause } from '../../database/adapter';

// Types for the service
export type FlowAccessPermission = 'owner' | 'editor' | 'operator' | 'viewer';

export interface FlowAccessRecord {
  id: string;
  flowId: string;
  userId?: string | null;
  teamId?: string | null;
  permission: FlowAccessPermission;
  grantedBy?: string | null;
  grantedAt: Date | string;
  expiresAt?: Date | string | null;
}

export interface GrantFlowAccessInput {
  flowId: string;
  userId?: string;
  teamId?: string;
  permission: FlowAccessPermission;
  grantedBy?: string;
  expiresAt?: Date | string;
}

export interface FlowAccessQuery {
  userId?: string;
  teamIds?: string[];
  flowId?: string;
  includeExpired?: boolean;
}

export interface FlowAccessServiceOptions {
  adapter: InvectAdapter;
  logger?: Logger;
}

const TABLE = 'flow_access';

/**
 * Permission hierarchy for access checks.
 * Higher number = more permissions.
 */
const PERMISSION_LEVELS: Record<FlowAccessPermission, number> = {
  viewer: 1,
  operator: 2,
  editor: 3,
  owner: 4,
};

/**
 * FlowAccessService - Manages flow access permissions
 */
export class FlowAccessService {
  private readonly adapter: InvectAdapter;
  private readonly logger?: Logger;

  constructor(options: FlowAccessServiceOptions) {
    this.adapter = options.adapter;
    this.logger = options.logger;
  }

  /**
   * Grant access to a flow for a user or team.
   */
  async grantAccess(input: GrantFlowAccessInput): Promise<FlowAccessRecord> {
    if (!input.userId && !input.teamId) {
      throw new Error('Either userId or teamId must be provided');
    }
    if (input.userId && input.teamId) {
      throw new Error('Cannot set both userId and teamId - use one or the other');
    }

    this.logger?.debug('Granting flow access', { input });

    // Check if access already exists
    const existing = await this.findExistingAccess(input.flowId, input.userId, input.teamId);

    if (existing) {
      // Update existing access
      const updated = await this.adapter.update<Record<string, unknown>>({
        model: TABLE,
        where: [{ field: 'id', value: existing.id }],
        update: {
          permission: input.permission,
          granted_by: input.grantedBy,
          granted_at: new Date(),
          expires_at: input.expiresAt ?? null,
        },
      });

      if (!updated) {
        throw new Error(`Flow access ${existing.id} no longer exists`);
      }

      const record = this.normalize(updated);
      this.logger?.info('Updated flow access', { id: record.id, flowId: input.flowId });
      return record;
    }

    // Create new access
    const created = await this.adapter.create({
      model: TABLE,
      data: {
        flow_id: input.flowId,
        user_id: input.userId ?? null,
        team_id: input.teamId ?? null,
        permission: input.permission,
        granted_by: input.grantedBy ?? null,
        granted_at: new Date(),
        expires_at: input.expiresAt ?? null,
      },
    });

    const record = this.normalize(created);
    this.logger?.info('Granted flow access', { id: record.id, flowId: input.flowId });
    return record;
  }

  /**
   * Revoke access to a flow for a user or team.
   */
  async revokeAccess(accessId: string): Promise<void> {
    this.logger?.debug('Revoking flow access', { accessId });

    await this.adapter.delete({
      model: TABLE,
      where: [{ field: 'id', value: accessId }],
    });

    this.logger?.info('Revoked flow access', { accessId });
  }

  /**
   * Revoke all access to a flow for a specific user or team.
   */
  async revokeAccessForUserOrTeam(flowId: string, userId?: string, teamId?: string): Promise<void> {
    if (!userId && !teamId) {
      throw new Error('Either userId or teamId must be provided');
    }

    const where: WhereClause[] = [{ field: 'flow_id', value: flowId }];
    if (userId) {
      where.push({ field: 'user_id', value: userId });
    }
    if (teamId) {
      where.push({ field: 'team_id', value: teamId });
    }

    await this.adapter.delete({ model: TABLE, where });

    this.logger?.info('Revoked flow access for user/team', { flowId, userId, teamId });
  }

  /**
   * List all access records for a flow.
   */
  async listFlowAccess(flowId: string): Promise<FlowAccessRecord[]> {
    const rows = await this.adapter.findMany<Record<string, unknown>>({
      model: TABLE,
      where: [{ field: 'flow_id', value: flowId }],
    });
    return rows.map((r) => this.normalize(r));
  }

  /**
   * Get all flows a user has access to (directly or via teams).
   * Fetches matching records and filters in application code.
   */
  async getAccessibleFlowIds(userId: string, teamIds: string[] = []): Promise<string[]> {
    // Fetch user-level access
    const userRows = await this.adapter.findMany<Record<string, unknown>>({
      model: TABLE,
      where: [{ field: 'user_id', value: userId }],
      select: ['flow_id', 'expires_at'],
    });

    // Fetch team-level access
    let teamRows: Record<string, unknown>[] = [];
    if (teamIds.length > 0) {
      teamRows = await this.adapter.findMany<Record<string, unknown>>({
        model: TABLE,
        where: [{ field: 'team_id', operator: 'in', value: teamIds }],
        select: ['flow_id', 'expires_at'],
      });
    }

    const now = new Date();
    const flowIds = new Set<string>();

    for (const row of [...userRows, ...teamRows]) {
      const expiresAt = row.expires_at ?? row.expiresAt;
      if (expiresAt && new Date(expiresAt as string) <= now) {
        continue;
      }
      flowIds.add(String(row.flow_id ?? row.flowId));
    }

    return [...flowIds];
  }

  /**
   * Check if a user has access to a flow with at least the required permission.
   */
  async hasFlowAccess(
    flowId: string,
    userId: string,
    teamIds: string[] = [],
    requiredPermission: FlowAccessPermission = 'viewer',
  ): Promise<boolean> {
    const records = await this.getFlowAccessRecords(flowId, userId, teamIds);
    const requiredLevel = PERMISSION_LEVELS[requiredPermission];
    return records.some((r) => PERMISSION_LEVELS[r.permission] >= requiredLevel);
  }

  /**
   * Get the highest permission level a user has for a flow.
   */
  async getFlowPermission(
    flowId: string,
    userId: string,
    teamIds: string[] = [],
  ): Promise<FlowAccessPermission | null> {
    const records = await this.getFlowAccessRecords(flowId, userId, teamIds);

    if (records.length === 0) {
      return null;
    }

    let highest: FlowAccessPermission = 'viewer';
    for (const record of records) {
      if (PERMISSION_LEVELS[record.permission] > PERMISSION_LEVELS[highest]) {
        highest = record.permission;
      }
    }
    return highest;
  }

  /**
   * Auto-grant owner access when a flow is created.
   */
  async grantOwnerAccess(flowId: string, userId: string): Promise<FlowAccessRecord> {
    return this.grantAccess({
      flowId,
      userId,
      permission: 'owner',
      grantedBy: userId,
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────

  /**
   * Get non-expired access records for a user (direct + teams) on a specific flow.
   */
  private async getFlowAccessRecords(
    flowId: string,
    userId: string,
    teamIds: string[],
  ): Promise<FlowAccessRecord[]> {
    // User-level records for this flow
    const userRows = await this.adapter.findMany<Record<string, unknown>>({
      model: TABLE,
      where: [
        { field: 'flow_id', value: flowId },
        { field: 'user_id', value: userId },
      ],
    });

    // Team-level records for this flow
    let teamRows: Record<string, unknown>[] = [];
    if (teamIds.length > 0) {
      teamRows = await this.adapter.findMany<Record<string, unknown>>({
        model: TABLE,
        where: [
          { field: 'flow_id', value: flowId },
          { field: 'team_id', operator: 'in', value: teamIds },
        ],
      });
    }

    const now = new Date();
    return [...userRows, ...teamRows]
      .map((r) => this.normalize(r))
      .filter((r) => {
        if (!r.expiresAt) {
          return true;
        }
        return new Date(r.expiresAt as string) > now;
      });
  }

  /**
   * Find existing access record for a user/team on a flow.
   */
  private async findExistingAccess(
    flowId: string,
    userId?: string,
    teamId?: string,
  ): Promise<FlowAccessRecord | null> {
    const where: WhereClause[] = [{ field: 'flow_id', value: flowId }];
    if (userId) {
      where.push({ field: 'user_id', value: userId });
    }
    if (teamId) {
      where.push({ field: 'team_id', value: teamId });
    }

    const row = await this.adapter.findOne<Record<string, unknown>>({
      model: TABLE,
      where,
    });

    return row ? this.normalize(row) : null;
  }

  /**
   * Normalize a raw database row into a FlowAccessRecord.
   */
  private normalize(raw: Record<string, unknown>): FlowAccessRecord {
    return {
      id: String(raw.id),
      flowId: String(raw.flow_id ?? raw.flowId),
      userId: (raw.user_id ?? raw.userId ?? null) as string | null,
      teamId: (raw.team_id ?? raw.teamId ?? null) as string | null,
      permission: String(raw.permission) as FlowAccessPermission,
      grantedBy: (raw.granted_by ?? raw.grantedBy ?? null) as string | null,
      grantedAt: (raw.granted_at ?? raw.grantedAt ?? new Date()) as Date | string,
      expiresAt: (raw.expires_at ?? raw.expiresAt ?? null) as Date | string | null,
    };
  }
}
