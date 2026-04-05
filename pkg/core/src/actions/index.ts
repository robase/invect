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
  MICROSOFT_TEAMS_PROVIDER,
  SENTRY_PROVIDER,
  GRAFANA_PROVIDER,
  SALESFORCE_PROVIDER,
  HUBSPOT_PROVIDER,
  JIRA_PROVIDER,
  ASANA_PROVIDER,
  TRELLO_PROVIDER,
  DROPBOX_PROVIDER,
  ONEDRIVE_PROVIDER,
  STRIPE_PROVIDER,
  TWITTER_PROVIDER,
  LINKEDIN_PROVIDER,
  FACEBOOK_PROVIDER,
  SHOPIFY_PROVIDER,
  WOOCOMMERCE_PROVIDER,
  ZENDESK_PROVIDER,
  INTERCOM_PROVIDER,
  FRESHDESK_PROVIDER,
  SEGMENT_PROVIDER,
  MIXPANEL_PROVIDER,
  GOOGLE_ANALYTICS_PROVIDER,
  GITLAB_PROVIDER,
  RESEND_PROVIDER,
  SENDGRID_PROVIDER,
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
export { sentryActions } from './sentry';
export { microsoftTeamsActions } from './microsoft-teams';
export { grafanaActions } from './grafana';
export { salesforceActions } from './salesforce';
export { hubspotActions } from './hubspot';
export { jiraActions } from './jira';
export { asanaActions } from './asana';
export { trelloActions } from './trello';
export { dropboxActions } from './dropbox';
export { onedriveActions } from './onedrive';
export { stripeActions } from './stripe';
export { twitterActions } from './twitter';
export { linkedinActions } from './linkedin';
export { facebookActions } from './facebook';
export { shopifyActions } from './shopify';
export { woocommerceActions } from './woocommerce';
export { zendeskActions } from './zendesk';
export { intercomActions } from './intercom';
export { freshdeskActions } from './freshdesk';
export { segmentActions } from './segment';
export { mixpanelActions } from './mixpanel';
export { googleAnalyticsActions } from './google-analytics';
export { gitlabActions } from './gitlab';
export { resendActions } from './resend';
export { sendgridActions } from './sendgrid';

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
import { microsoftTeamsActions } from './microsoft-teams';
import { sentryActions } from './sentry';
import { grafanaActions } from './grafana';
import { salesforceActions } from './salesforce';
import { hubspotActions } from './hubspot';
import { jiraActions } from './jira';
import { asanaActions } from './asana';
import { trelloActions } from './trello';
import { dropboxActions } from './dropbox';
import { onedriveActions } from './onedrive';
import { stripeActions } from './stripe';
import { twitterActions } from './twitter';
import { linkedinActions } from './linkedin';
import { facebookActions } from './facebook';
import { shopifyActions } from './shopify';
import { woocommerceActions } from './woocommerce';
import { zendeskActions } from './zendesk';
import { intercomActions } from './intercom';
import { freshdeskActions } from './freshdesk';
import { segmentActions } from './segment';
import { mixpanelActions } from './mixpanel';
import { googleAnalyticsActions } from './google-analytics';
import { gitlabActions } from './gitlab';
import { resendActions } from './resend';
import { sendgridActions } from './sendgrid';

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
  ...microsoftTeamsActions,
  ...sentryActions,
  ...grafanaActions,
  ...salesforceActions,
  ...hubspotActions,
  ...jiraActions,
  ...asanaActions,
  ...trelloActions,
  ...dropboxActions,
  ...onedriveActions,
  ...stripeActions,
  ...twitterActions,
  ...linkedinActions,
  ...facebookActions,
  ...shopifyActions,
  ...woocommerceActions,
  ...zendeskActions,
  ...intercomActions,
  ...freshdeskActions,
  ...segmentActions,
  ...mixpanelActions,
  ...googleAnalyticsActions,
  ...gitlabActions,
  ...resendActions,
  ...sendgridActions,
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
