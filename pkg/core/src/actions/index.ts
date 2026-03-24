/**
 * Actions Module – barrel export
 *
 * Public API for the Provider-Actions system.
 */

// Types
export type {
  ActionDefinition,
  ActionExecutionContext,
  ActionResult,
  ActionCredential,
  ActionCategory,
  ProviderDef,
  ProviderCategory,
  CredentialRequirement,
  ParamField,
  ActionConfigUpdateContext,
  ActionConfigUpdateEvent,
  ActionConfigUpdateResponse,
  LoadOptionsContext,
  LoadOptionsConfig,
  LoadOptionsResult,
} from './types';

// defineAction helper
export { defineAction } from './define-action';

// Providers
export {
  CORE_PROVIDER,
  HTTP_PROVIDER,
  GMAIL_PROVIDER,
  SLACK_PROVIDER,
  GITHUB_PROVIDER,
  GOOGLE_DOCS_PROVIDER,
  GOOGLE_SHEETS_PROVIDER,
  GOOGLE_DRIVE_PROVIDER,
  GOOGLE_CALENDAR_PROVIDER,
  LINEAR_PROVIDER,
  POSTGRES_PROVIDER,
  TRIGGERS_PROVIDER,
  MICROSOFT_PROVIDER,
} from './providers';

// Registry
export {
  ActionRegistry,
  getGlobalActionRegistry,
  initializeGlobalActionRegistry,
  setGlobalActionRegistry,
  resetGlobalActionRegistry,
} from './action-registry';

// Executor bridge
export {
  executeActionAsNode,
  executeActionAsTool,
  createToolExecutorForAction,
} from './action-executor';

// ── Action bundles (by provider) ────────────────────────────────────────

export { coreActions } from './core';
export { httpActions } from './http';
export { gmailActions } from './gmail';
export { slackActions } from './slack';
export { githubActions } from './github';
export { googleDocsActions } from './google-docs';
export { googleSheetsActions } from './google-sheets';
export { googleDriveActions } from './google-drive';
export { googleCalendarActions } from './google-calendar';
export { linearActions } from './linear';
export { postgresActions } from './postgres';
export { triggerActions } from './triggers';
export { microsoftActions } from './microsoft';

// ── Convenience: all built-in actions ───────────────────────────────────

import type { ActionDefinition } from './types';
import { coreActions } from './core';
import { httpActions } from './http';
import { gmailActions } from './gmail';
import { slackActions } from './slack';
import { githubActions } from './github';
import { googleDocsActions } from './google-docs';
import { googleSheetsActions } from './google-sheets';
import { googleDriveActions } from './google-drive';
import { googleCalendarActions } from './google-calendar';
import { linearActions } from './linear';
import { postgresActions } from './postgres';
import { triggerActions } from './triggers';
import { microsoftActions } from './microsoft';

/** Every built-in action across all providers. */
export const allBuiltinActions: ActionDefinition[] = [
  ...coreActions,
  ...httpActions,
  ...gmailActions,
  ...slackActions,
  ...githubActions,
  ...googleDocsActions,
  ...googleSheetsActions,
  ...googleDriveActions,
  ...googleCalendarActions,
  ...linearActions,
  ...postgresActions,
  ...triggerActions,
  ...microsoftActions,
];

// ── Registration helper ─────────────────────────────────────────────────

import type { ActionRegistry } from './action-registry';

/**
 * Register all built-in actions into the given registry.
 * Called during `Invect.initialize()`.
 */
export function registerBuiltinActions(registry: ActionRegistry): void {
  registry.registerMany(allBuiltinActions);
}
