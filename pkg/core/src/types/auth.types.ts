/**
 * Invect Authentication & Authorization Types
 *
 * Authentication is handled by the auth plugin (better-auth).
 * Invect handles authorization based on the identity resolved by the plugin's onRequest hook.
 */

// =============================================================================
// Identity Types
// =============================================================================

/**
 * Identity resolved from the host app's authentication system.
 * Invect doesn't care HOW you authenticated - just WHO you are.
 */
export interface InvectIdentity {
  /** Unique user identifier from host app (e.g., user ID, email, API key ID) */
  id: string;

  /** Optional display name for UI and audit logs */
  name?: string;

  /**
   * Role within Invect (maps to permissions).
   * Host app can either:
   * 1. Provide a Invect role directly (if they store it)
   * 2. Use roleMapper in config to map their roles → Invect roles
   */
  role?: InvectRole;

  /**
   * Team IDs this user belongs to (from host app).
   * Used for team-level flow access via the auth plugin.
   */
  teamIds?: string[];

  /**
   * Optional: Direct permission overrides (advanced use case).
   * These are checked IN ADDITION to role-based permissions.
   */
  permissions?: InvectPermission[];

  /**
   * Optional: Resource-level access control.
   * Restricts access to specific resources by ID.
   * E.g., user can only access specific flows they created.
   *
   * Use '*' to allow access to all resources of that type.
   * Omit the key entirely to use role-based access (no resource restriction).
   *
   * Note: When the auth plugin is active, flow access is looked up from
   * the database instead of this field.
   */
  resourceAccess?: InvectResourceAccess;

  /** Any additional metadata from host app (for audit logs, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Resource-level access control configuration.
 * Each property is either:
 * - An array of resource IDs the user can access
 * - '*' to allow access to all resources
 * - undefined to not restrict (use role permissions only)
 */
export interface InvectResourceAccess {
  /** Flow IDs the user can access */
  flows?: string[] | '*';
  /** Credential IDs the user can access */
  credentials?: string[] | '*';
}

// =============================================================================
// Role & Permission Types
// =============================================================================

/**
 * Built-in roles with predefined permission sets.
 * Custom roles can be defined via config.customRoles.
 */
export type InvectBuiltInRole = 'admin' | 'editor' | 'operator' | 'viewer';

/**
 * Invect role - either a built-in role or a custom role string.
 */
export type InvectRole = InvectBuiltInRole | string;

/**
 * Granular permissions for Invect resources.
 */
export type InvectPermission =
  // Flow permissions
  | 'flow:create'
  | 'flow:read'
  | 'flow:update'
  | 'flow:delete'
  | 'flow:publish' // Set live version
  // Flow version permissions
  | 'flow-version:create'
  | 'flow-version:read'
  // Execution permissions
  | 'flow-run:create' // Start executions
  | 'flow-run:read'
  | 'flow-run:cancel'
  // Credential permissions
  | 'credential:create'
  | 'credential:read'
  | 'credential:update'
  | 'credential:delete'
  // Agent/tool permissions
  | 'agent-tool:read'
  | 'agent-tool:configure'
  // Node testing
  | 'node:test' // Test individual nodes (SQL, model, etc.)
  // Admin permissions
  | 'admin:*'; // Wildcard - all permissions

/**
 * Resource types that can be protected by authorization.
 */
export type InvectResourceType =
  | 'flow'
  | 'flow-version'
  | 'flow-run'
  | 'node-execution'
  | 'credential'
  | 'agent-tool';

// =============================================================================
// Authorization Context & Results
// =============================================================================

/**
 * Context provided to authorization checks.
 */
export interface AuthorizationContext {
  /** The identity making the request (null if unauthenticated) */
  identity: InvectIdentity | null;

  /** The permission being checked */
  action: InvectPermission;

  /** The resource being accessed (if applicable) */
  resource?: {
    type: InvectResourceType;
    id?: string;
  };
}

/**
 * Result of an authorization check.
 */
export interface AuthorizationResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
}

// =============================================================================
// Auth Events (for host app audit logging)
// =============================================================================

/**
 * Base event data for all auth events.
 */
export interface AuthEventBase {
  /** Timestamp of the event */
  timestamp: Date;
  /** Identity that triggered the event (null if unauthenticated) */
  identity: InvectIdentity | null;
  /** The permission that was checked */
  action: InvectPermission;
  /** The resource involved (if applicable) */
  resource?: {
    type: InvectResourceType;
    id?: string;
  };
}

/**
 * Event emitted when authorization succeeds.
 */
export interface AuthAuthorizedEvent extends AuthEventBase {
  type: 'auth:authorized';
  allowed: true;
}

/**
 * Event emitted when authorization fails.
 */
export interface AuthForbiddenEvent extends AuthEventBase {
  type: 'auth:forbidden';
  allowed: false;
  reason: string;
}

/**
 * Event emitted when authentication fails (no valid identity).
 */
export interface AuthUnauthenticatedEvent {
  type: 'auth:unauthenticated';
  timestamp: Date;
  /** The permission that was attempted */
  action: InvectPermission;
  /** The resource involved (if applicable) */
  resource?: {
    type: InvectResourceType;
    id?: string;
  };
}

/**
 * Union of all auth events.
 */
export type AuthEvent = AuthAuthorizedEvent | AuthForbiddenEvent | AuthUnauthenticatedEvent;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Callback for custom authorization logic.
 * Called after standard RBAC checks.
 *
 * @returns
 * - true: Allow the action
 * - false: Deny the action
 * - undefined: Use default RBAC result
 */
export type CustomAuthorizeFn = (
  context: AuthorizationContext,
) => Promise<boolean | undefined> | boolean | undefined;

/**
 * Authentication/Authorization configuration for Invect.
 */
export interface InvectAuthConfig {
  /**
   * Enable RBAC (Role-Based Access Control).
   * When false, all requests are allowed without authentication checks.
   * @default false
   */
  enabled?: boolean;

  /**
   * Map host app roles to Invect roles.
   * Useful when host app has different role names.
   *
   * @example { 'super_admin': 'admin', 'content_editor': 'editor' }
   */
  roleMapper?: Record<string, InvectRole>;

  /**
   * Define custom roles with specific permissions.
   * Extends built-in roles (admin, editor, operator, viewer).
   *
   * @example { 'qa_tester': ['flow:read', 'flow-run:create', 'flow-run:read'] }
   */
  customRoles?: Record<string, InvectPermission[]>;

  /**
   * Callback for custom authorization logic.
   * Called after standard RBAC checks.
   * Return true to allow, false to deny, undefined to use default.
   */
  customAuthorize?: CustomAuthorizeFn;

  /**
   * Routes that don't require authentication.
   * Matched against the request path.
   *
   * @example ['/health', '/metrics', '/webhooks/*']
   */
  publicRoutes?: string[];

  /**
   * Default role for authenticated users without an explicit role.
   * @default 'viewer'
   */
  defaultRole?: InvectRole;

  /**
   * Behavior when auth fails.
   * - 'throw': Throw an error (401/403)
   * - 'log': Log warning and continue (allow access)
   * - 'deny': Silently deny access
   * @default 'throw'
   */
  onAuthFailure?: 'throw' | 'log' | 'deny';
}

// =============================================================================
// Default Role Permissions
// =============================================================================

/**
 * Default permission sets for built-in roles.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<InvectBuiltInRole, InvectPermission[]> = {
  admin: ['admin:*'],

  editor: [
    'flow:create',
    'flow:read',
    'flow:update',
    'flow:delete',
    'flow:publish',
    'flow-version:create',
    'flow-version:read',
    'flow-run:create',
    'flow-run:read',
    'flow-run:cancel',
    'credential:create',
    'credential:read',
    'credential:update',
    'credential:delete',
    'agent-tool:read',
    'agent-tool:configure',
    'node:test',
  ],

  operator: [
    'flow:read',
    'flow-version:read',
    'flow-run:create',
    'flow-run:read',
    'flow-run:cancel',
    'credential:read',
    'agent-tool:read',
    'node:test',
  ],

  viewer: ['flow:read', 'flow-version:read', 'flow-run:read', 'credential:read', 'agent-tool:read'],
};

/**
 * Map of actions to the permission required.
 * Used for route-level authorization.
 */
export const ACTION_PERMISSION_MAP: Record<string, InvectPermission> = {
  // Flows
  listFlows: 'flow:read',
  getFlow: 'flow:read',
  createFlow: 'flow:create',
  updateFlow: 'flow:update',
  deleteFlow: 'flow:delete',
  publishFlow: 'flow:publish',

  // Flow versions
  listFlowVersions: 'flow-version:read',
  getFlowVersion: 'flow-version:read',
  createFlowVersion: 'flow-version:create',

  // Flow runs
  listFlowRuns: 'flow-run:read',
  getFlowRun: 'flow-run:read',
  startFlowRun: 'flow-run:create',
  cancelFlowRun: 'flow-run:cancel',

  // Credentials
  listCredentials: 'credential:read',
  getCredential: 'credential:read',
  createCredential: 'credential:create',
  updateCredential: 'credential:update',
  deleteCredential: 'credential:delete',

  // Agent tools
  listAgentTools: 'agent-tool:read',
  getAgentTool: 'agent-tool:read',

  // Node testing
  testSqlQuery: 'node:test',
  testModel: 'node:test',
};
