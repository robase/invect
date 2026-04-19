/**
 * Slack provider barrel export.
 */

export { slackSendMessageAction } from './send-message';
export { slackListChannelsAction } from './list-channels';

import type { ActionDefinition } from '@invect/action-kit';
import { slackSendMessageAction } from './send-message';
import { slackListChannelsAction } from './list-channels';

/** All Slack actions as an array (for bulk registration). */
export const slackActions: ActionDefinition[] = [slackSendMessageAction, slackListChannelsAction];
