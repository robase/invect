/**
 * @invect/core/sdk — Declarative Flow SDK
 *
 * Build Invect flows in TypeScript with full type safety.
 * Produces InvectDefinition objects compatible with the UI editor.
 *
 * @example
 * ```typescript
 * import { defineFlow, input, model, output, slack } from '@invect/core/sdk';
 *
 * export default defineFlow({
 *   name: 'My Flow',
 *   nodes: [
 *     input('query', { variableName: 'query' }),
 *     model('answer', { credentialId: 'cred', model: 'gpt-4o', prompt: '{{ query }}' }),
 *     slack.sendMessage('notify', { credentialId: 'slack', channel: '#general', text: '{{ answer }}' }),
 *     output('result', { outputName: 'answer', outputValue: '{{ answer }}' }),
 *   ],
 *   edges: [
 *     ['query', 'answer'],
 *     ['answer', 'notify'],
 *     { from: 'answer', to: 'result' },
 *   ],
 * });
 * ```
 */

// defineFlow
export { defineFlow } from './define-flow';

// parseSDKText
export { parseSDKText } from './parse-sdk-text';
export type { ParsedSDK } from './parse-sdk-text';

// Core node helpers
export {
  input,
  output,
  model,
  javascript,
  code,
  ifElse,
  template,
  httpRequest,
  agent,
  node,
  tool,
} from './nodes';

// Provider namespaces
export { gmail, slack, github, provider } from './providers';

// Types
export type {
  FlowFileDefinition,
  EdgeInput,
  EdgeTuple,
  EdgeObject,
  InputParams,
  OutputParams,
  ModelParams,
  JavaScriptParams,
  IfElseParams,
  TemplateParams,
  HttpRequestParams,
  AgentParams,
  AddedToolInstance,
  MapperOptions,
  GenericParams,
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
  InvectDefinition,
  FlowNodeDefinitions,
  FlowEdge,
  MapperConfig,
} from './types';

export type { NodeOptions } from './nodes';
