/**
 * Shared provider definitions.
 *
 * Multiple action files reference the same provider — these constants
 * ensure consistency and prevent duplicating the ProviderDef objects.
 */

import type { ProviderDef } from './types';

export const CORE_PROVIDER: ProviderDef = {
  id: 'core',
  name: 'Invect Core',
  icon: 'Blocks',
  category: 'core',
  nodeCategory: 'Common',
  description: 'Built-in flow-control and utility nodes',
};

/**
 * HTTP actions use the core provider since HTTP Request is a built-in utility.
 * Kept as a separate export for backwards compatibility in action definitions.
 */
export const HTTP_PROVIDER: ProviderDef = {
  ...CORE_PROVIDER,
};

export const GMAIL_PROVIDER: ProviderDef = {
  id: 'gmail',
  name: 'Gmail',
  icon: 'Mail',
  category: 'email',
  nodeCategory: 'Integrations',
  description: 'Google Gmail integration',
  docsUrl: 'https://developers.google.com/gmail/api',
};

export const SLACK_PROVIDER: ProviderDef = {
  id: 'slack',
  name: 'Slack',
  icon: 'MessageSquare',
  category: 'messaging',
  nodeCategory: 'Integrations',
  description: 'Slack workspace messaging and channel management',
  docsUrl: 'https://api.slack.com/methods',
};

export const GITHUB_PROVIDER: ProviderDef = {
  id: 'github',
  name: 'GitHub',
  icon: 'Github',
  category: 'development',
  nodeCategory: 'Integrations',
  description: 'GitHub repository and issue management',
  docsUrl: 'https://docs.github.com/en/rest',
};

export const GOOGLE_DOCS_PROVIDER: ProviderDef = {
  id: 'google_docs',
  name: 'Google Docs',
  icon: 'FileText',
  category: 'storage',
  nodeCategory: 'Integrations',
  description: 'Create, read, and edit Google Docs documents',
  docsUrl: 'https://developers.google.com/docs/api',
};

export const GOOGLE_SHEETS_PROVIDER: ProviderDef = {
  id: 'google_sheets',
  name: 'Google Sheets',
  icon: 'Table',
  category: 'storage',
  nodeCategory: 'Integrations',
  description: 'Read, write, and manage Google Sheets spreadsheets',
  docsUrl: 'https://developers.google.com/sheets/api',
};

export const GOOGLE_DRIVE_PROVIDER: ProviderDef = {
  id: 'google_drive',
  name: 'Google Drive',
  icon: 'HardDrive',
  category: 'storage',
  nodeCategory: 'Integrations',
  description: 'Manage files and folders in Google Drive',
  docsUrl: 'https://developers.google.com/drive/api',
};

export const GOOGLE_CALENDAR_PROVIDER: ProviderDef = {
  id: 'google_calendar',
  name: 'Google Calendar',
  icon: 'Calendar',
  category: 'utility',
  nodeCategory: 'Integrations',
  description: 'Manage events and calendars in Google Calendar',
  docsUrl: 'https://developers.google.com/calendar/api',
};

export const LINEAR_PROVIDER: ProviderDef = {
  id: 'linear',
  name: 'Linear',
  icon: 'CheckSquare',
  category: 'development',
  nodeCategory: 'Integrations',
  description: 'Linear issue tracking and project management',
  docsUrl: 'https://developers.linear.app/docs',
};

export const POSTGRES_PROVIDER: ProviderDef = {
  id: 'postgres',
  name: 'PostgreSQL',
  icon: 'Database',
  nodeCategory: 'Data',
  category: 'database',
  description: 'Connect to PostgreSQL databases to query, insert, and inspect data',
  docsUrl: 'https://www.postgresql.org/docs/',
};

export const TRIGGERS_PROVIDER: ProviderDef = {
  id: 'triggers',
  name: 'Triggers',
  icon: 'Zap',
  category: 'core',
  nodeCategory: 'Triggers',
  description: 'Flow trigger nodes — define how a flow is started',
};

export const MICROSOFT_PROVIDER: ProviderDef = {
  id: 'microsoft',
  name: 'Microsoft 365',
  icon: 'Cloud',
  category: 'email',
  nodeCategory: 'Integrations',
  description: 'Microsoft Graph API — calendars, email, meetings, transcripts and more',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/api/overview',
};

export const MICROSOFT_TEAMS_PROVIDER: ProviderDef = {
  id: 'microsoft_teams',
  name: 'Microsoft Teams',
  icon: 'Users',
  category: 'messaging',
  nodeCategory: 'Integrations',
  description: 'Microsoft Teams messaging and collaboration via Graph API',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview',
};

export const SENTRY_PROVIDER: ProviderDef = {
  id: 'sentry',
  name: 'Sentry',
  icon: 'Bug',
  category: 'development',
  nodeCategory: 'Integrations',
  description: 'Sentry error monitoring — issues, projects, and event tracking',
  docsUrl: 'https://docs.sentry.io/api/',
};

export const SALESFORCE_PROVIDER: ProviderDef = {
  id: 'salesforce',
  name: 'Salesforce',
  icon: 'Cloud',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Salesforce CRM — accounts, contacts, leads, and opportunities',
  docsUrl: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/',
};

export const HUBSPOT_PROVIDER: ProviderDef = {
  id: 'hubspot',
  name: 'HubSpot',
  icon: 'Users',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'HubSpot CRM — contacts, companies, deals, and tickets',
  docsUrl: 'https://developers.hubspot.com/docs/api/overview',
};
