/**
 * Provider Namespaces
 *
 * Typed helper namespaces for provider-specific actions.
 * Each namespace groups all actions from a provider under a single object.
 *
 * Usage:
 *   import { gmail, slack, github } from '@invect/core/sdk';
 *   gmail.sendMessage('ref', { to: '...', subject: '...', body: '...' })
 */

import type { FlowNodeDefinitions } from 'src/services/flow-versions/schemas-fresh';
import type {
  GmailSendMessageParams,
  GmailListMessagesParams,
  GmailGetMessageParams,
  GmailCreateDraftParams,
  GmailModifyLabelsParams,
  SlackSendMessageParams,
  SlackListChannelsParams,
  GithubCreateIssueParams,
  GithubListReposParams,
  GithubCreatePullRequestParams,
  GithubListIssuesParams,
  GenericParams,
} from './types';
import { node } from './nodes';
import type { NodeOptions } from './nodes';

// ── Gmail ───────────────────────────────────────────────────────────────

export const gmail = {
  sendMessage(
    referenceId: string,
    params: GmailSendMessageParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('gmail.send_message', referenceId, params, options);
  },
  listMessages(
    referenceId: string,
    params: GmailListMessagesParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('gmail.list_messages', referenceId, params, options);
  },
  getMessage(
    referenceId: string,
    params: GmailGetMessageParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('gmail.get_message', referenceId, params, options);
  },
  createDraft(
    referenceId: string,
    params: GmailCreateDraftParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('gmail.create_draft', referenceId, params, options);
  },
  modifyLabels(
    referenceId: string,
    params: GmailModifyLabelsParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('gmail.modify_labels', referenceId, params, options);
  },
} as const;

// ── Slack ────────────────────────────────────────────────────────────────

export const slack = {
  sendMessage(
    referenceId: string,
    params: SlackSendMessageParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('slack.send_message', referenceId, params, options);
  },
  listChannels(
    referenceId: string,
    params: SlackListChannelsParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('slack.list_channels', referenceId, params, options);
  },
} as const;

// ── GitHub ───────────────────────────────────────────────────────────────

export const github = {
  createIssue(
    referenceId: string,
    params: GithubCreateIssueParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('github.create_issue', referenceId, params, options);
  },
  listRepos(
    referenceId: string,
    params: GithubListReposParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('github.list_repos', referenceId, params, options);
  },
  createPullRequest(
    referenceId: string,
    params: GithubCreatePullRequestParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('github.create_pull_request', referenceId, params, options);
  },
  listIssues(
    referenceId: string,
    params: GithubListIssuesParams,
    options?: NodeOptions,
  ): FlowNodeDefinitions {
    return node('github.list_issues', referenceId, params, options);
  },
} as const;

// ── Generic provider helper ─────────────────────────────────────────────

/**
 * Create a helper for any provider action not covered by dedicated namespaces.
 *
 * @example
 * const linear = provider('linear');
 * linear('create_issue', 'create_task', { title: 'Fix bug' })
 */
export function provider(providerId: string) {
  return (
    actionName: string,
    referenceId: string,
    params: GenericParams = {},
    options?: NodeOptions,
  ) => node(`${providerId}.${actionName}`, referenceId, params, options);
}
