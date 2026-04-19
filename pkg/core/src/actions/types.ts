/**
 * Action Types — re-exported from `@invect/action-kit`.
 *
 * This file exists so existing `src/actions/types` import paths inside
 * `@invect/core` keep resolving. All canonical definitions now live in the
 * standalone action-kit package so `@invect/actions` can consume them
 * without depending on `@invect/core`.
 */

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
  ActionCredentialsService,
  ActionAIClient,
} from '@invect/action-kit';
