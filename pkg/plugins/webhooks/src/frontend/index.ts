/**
 * @invect/webhooks — Frontend entry point.
 *
 * Import as: import { webhooksFrontendPlugin, ... } from '@invect/webhooks/ui';
 */

export { webhooksFrontendPlugin } from './plugins/webhooksFrontendPlugin';
export { WebhooksPage } from './components/WebhooksPage';
export { CreateWebhookModal } from './components/CreateWebhookModal';
export { WebhookDetailPanel } from './components/WebhookDetailPanel';
export { WebhookTriggerSelector } from './components/WebhookTriggerSelector';
export { CopyableField } from './components/CopyableField';
export {
  useWebhookTriggers,
  useWebhookTrigger,
  useWebhookTriggerInfo,
  useCreateWebhookTrigger,
  useUpdateWebhookTrigger,
  useDeleteWebhookTrigger,
  useTestWebhookTrigger,
} from './hooks/useWebhookQueries';
