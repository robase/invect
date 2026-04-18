/**
 * @invect/core public API — namespaced sub-APIs
 */

export { createInvect } from './create-invect';

// Sub-API types
export type {
  InvectInstance,
  InvectMaintenanceOptions,
  InvectMaintenanceResult,
  FlowsAPI,
  FlowVersionsAPI,
  FlowRunsAPI,
  CredentialsAPI,
  TriggersAPI,
  AgentAPI,
  ChatAPI,
  ActionsAPI,
  TestingAPI,
  AuthAPI,
  PluginsAPI,
} from './types';
