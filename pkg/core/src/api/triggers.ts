import type { TriggersAPI } from './types';
import type { ServiceFactory } from '../services/service-factory';
import type { Logger } from '../types/schemas';

export function createTriggersAPI(sf: ServiceFactory, logger: Logger): TriggersAPI {
  const svc = sf.getTriggersService();

  return {
    list(flowId) {
      return svc.listTriggersForFlow(flowId);
    },

    get(triggerId) {
      return svc.getTrigger(triggerId);
    },

    create(input) {
      return svc.createTrigger(input);
    },

    update(triggerId, input) {
      return svc.updateTrigger(triggerId, input);
    },

    delete(triggerId) {
      return svc.deleteTrigger(triggerId);
    },

    async sync(flowId, definition) {
      const result = await svc.syncTriggersForFlow(flowId, definition);
      // Also refresh cron scheduler
      try {
        const scheduler = sf.getCronScheduler();
        await scheduler.refresh();
      } catch {
        logger.warn('Failed to refresh cron scheduler after trigger sync');
      }
      return result;
    },

    getEnabledCron() {
      return svc.getEnabledCronTriggers();
    },

    executeCron(triggerId) {
      return svc.executeCronTrigger(triggerId);
    },
  };
}
