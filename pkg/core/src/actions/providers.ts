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

export const JIRA_PROVIDER: ProviderDef = {
  id: 'jira',
  name: 'Jira',
  icon: 'Bug',
  category: 'development',
  nodeCategory: 'Integrations',
  description: 'Jira issue tracking and project management',
  docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
};

export const ASANA_PROVIDER: ProviderDef = {
  id: 'asana',
  name: 'Asana',
  icon: 'CheckSquare',
  category: 'development',
  nodeCategory: 'Integrations',
  description: 'Asana task and project management',
  docsUrl: 'https://developers.asana.com/reference/rest-api-reference',
};

export const TRELLO_PROVIDER: ProviderDef = {
  id: 'trello',
  name: 'Trello',
  icon: 'Layout',
  category: 'development',
  nodeCategory: 'Integrations',
  description: 'Trello boards, lists, and cards',
  docsUrl: 'https://developer.atlassian.com/cloud/trello/rest/',
};

export const DROPBOX_PROVIDER: ProviderDef = {
  id: 'dropbox',
  name: 'Dropbox',
  icon: 'Cloud',
  category: 'storage',
  nodeCategory: 'Integrations',
  description: 'Dropbox file storage and sharing',
  docsUrl: 'https://www.dropbox.com/developers/documentation/http/documentation',
};

export const ONEDRIVE_PROVIDER: ProviderDef = {
  id: 'onedrive',
  name: 'OneDrive',
  icon: 'HardDrive',
  category: 'storage',
  nodeCategory: 'Integrations',
  description: 'Microsoft OneDrive file storage and management via Graph API',
  docsUrl: 'https://learn.microsoft.com/en-us/onedrive/developer/rest-api/',
};

export const STRIPE_PROVIDER: ProviderDef = {
  id: 'stripe',
  name: 'Stripe',
  icon: 'CreditCard',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Stripe payment processing — customers, charges, and subscriptions',
  docsUrl: 'https://stripe.com/docs/api',
};

export const TWITTER_PROVIDER: ProviderDef = {
  id: 'twitter',
  name: 'Twitter / X',
  icon: 'Twitter',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Twitter/X — tweets, users, and timelines',
  docsUrl: 'https://developer.twitter.com/en/docs/twitter-api',
};

export const GRAFANA_PROVIDER: ProviderDef = {
  id: 'grafana',
  name: 'Grafana',
  icon: 'BarChart3',
  category: 'development',
  nodeCategory: 'Integrations',
  description: 'Grafana observability — dashboards, datasources, alerts, and annotations',
  docsUrl: 'https://grafana.com/docs/grafana/latest/developers/http_api/',
};

export const LINKEDIN_PROVIDER: ProviderDef = {
  id: 'linkedin',
  name: 'LinkedIn',
  icon: 'Linkedin',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'LinkedIn — profiles, posts, and company pages',
  docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/',
};

export const FACEBOOK_PROVIDER: ProviderDef = {
  id: 'facebook',
  name: 'Facebook',
  icon: 'Facebook',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Facebook pages, posts, and insights via Graph API',
  docsUrl: 'https://developers.facebook.com/docs/graph-api/',
};

export const SHOPIFY_PROVIDER: ProviderDef = {
  id: 'shopify',
  name: 'Shopify',
  icon: 'ShoppingBag',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Shopify e-commerce — products, orders, and customers',
  docsUrl: 'https://shopify.dev/docs/api/admin-rest',
};

export const WOOCOMMERCE_PROVIDER: ProviderDef = {
  id: 'woocommerce',
  name: 'WooCommerce',
  icon: 'ShoppingCart',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'WooCommerce e-commerce — products, orders, and customers',
  docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
};

export const ZENDESK_PROVIDER: ProviderDef = {
  id: 'zendesk',
  name: 'Zendesk',
  icon: 'Headphones',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Zendesk customer support — tickets, users, and organizations',
  docsUrl: 'https://developer.zendesk.com/api-reference/',
};

export const INTERCOM_PROVIDER: ProviderDef = {
  id: 'intercom',
  name: 'Intercom',
  icon: 'MessageCircle',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Intercom customer messaging — contacts, conversations, and articles',
  docsUrl: 'https://developers.intercom.com/docs/references/rest-api/api.intercom.io/',
};

export const FRESHDESK_PROVIDER: ProviderDef = {
  id: 'freshdesk',
  name: 'Freshdesk',
  icon: 'Headphones',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Freshdesk customer support — tickets, contacts, and agents',
  docsUrl: 'https://developers.freshdesk.com/api/',
};

export const SEGMENT_PROVIDER: ProviderDef = {
  id: 'segment',
  name: 'Segment',
  icon: 'BarChart',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Segment analytics — track events, identify users, and manage data',
  docsUrl: 'https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/',
};

export const MIXPANEL_PROVIDER: ProviderDef = {
  id: 'mixpanel',
  name: 'Mixpanel',
  icon: 'BarChart2',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Mixpanel product analytics — track events and query data',
  docsUrl: 'https://developer.mixpanel.com/reference/overview',
};

export const GOOGLE_ANALYTICS_PROVIDER: ProviderDef = {
  id: 'google_analytics',
  name: 'Google Analytics',
  icon: 'BarChart',
  category: 'custom',
  nodeCategory: 'Integrations',
  description: 'Google Analytics 4 — run reports, query metrics, and manage properties',
  docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
};
