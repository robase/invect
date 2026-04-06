import type { FlowRunsAPI } from './types';
import type { ServiceFactory } from '../services/service-factory';
import type { Logger } from '../schemas';
import * as Schemas from '../schemas';
import { FlowRunStatus } from '../types/base';
import type { ExecutionStreamEvent } from '../services/execution-event-bus';

export function createFlowRunsAPI(sf: ServiceFactory, logger: Logger): FlowRunsAPI {
  const orchestration = sf.getOrchestrationService();
  const flowRunsService = sf.getFlowRunsService();
  const nodeExecutionsService = sf.getNodeExecutionsService();

  return {
    start(flowId, inputs = {}, options) {
      logger.debug('startFlowRun called', { flowId });
      return orchestration.executeFlow(flowId, inputs, options);
    },

    startAsync(flowId, inputs = {}, options) {
      logger.debug('startFlowRunAsync called', { flowId });
      return orchestration.executeFlowAsync(flowId, inputs, options);
    },

    executeToNode(flowId, targetNodeId, inputs = {}, options) {
      logger.debug('executeFlowToNode called', { flowId, targetNodeId });
      return orchestration.executeFlowToNode(flowId, targetNodeId, inputs, options);
    },

    resume(executionId) {
      logger.debug('resumeExecution called', { executionId });
      return flowRunsService.resumeRun(executionId);
    },

    list(options) {
      logger.debug('listFlowRuns called');
      return flowRunsService.listRuns(options);
    },

    listByFlowId(flowId, options) {
      logger.debug('listFlowRunsByFlowId called', { flowId });
      const { flowId: id } = Schemas.flow.FlowIdParamsSchema.parse({ flowId });
      return flowRunsService.listRuns({
        ...options,
        filter: { ...options?.filter, flowId: [id] },
      });
    },

    get(flowRunId) {
      logger.debug('getFlowRunById called', { flowRunId });
      return flowRunsService.getRunById(flowRunId);
    },

    cancel(flowRunId) {
      logger.debug('cancelFlowRun called', { flowRunId });
      return flowRunsService.cancelRun(flowRunId);
    },

    pause(flowRunId, reason) {
      logger.debug('pauseFlowRun called', { flowRunId, reason });
      return flowRunsService.pauseRun(flowRunId, reason);
    },

    async *createEventStream(
      flowRunId: string,
    ): AsyncGenerator<ExecutionStreamEvent, void, undefined> {
      const bus = sf.getExecutionEventBus();

      // 1. Send initial snapshot
      const flowRun = await flowRunsService.getRunById(flowRunId);
      const nodeExecutions = await nodeExecutionsService.listNodeExecutionsByFlowRunId(flowRunId);

      yield { type: 'snapshot', flowRun, nodeExecutions };

      // If the run is already terminal, close immediately
      const terminalStatuses = new Set([
        FlowRunStatus.SUCCESS,
        FlowRunStatus.FAILED,
        FlowRunStatus.CANCELLED,
      ]);
      if (terminalStatuses.has(flowRun.status)) {
        yield { type: 'end', flowRun };
        return;
      }

      // 2. Forward live events via a queue
      const queue: ExecutionStreamEvent[] = [];
      let resolve: (() => void) | null = null;
      let done = false;

      const unsubscribe = bus.subscribe(flowRunId, (event) => {
        queue.push(event);
        if (event.type === 'flow_run.updated' && terminalStatuses.has(event.flowRun.status)) {
          queue.push({ type: 'end', flowRun: event.flowRun });
          done = true;
        }
        const wakeUp = resolve;
        if (wakeUp) {
          resolve = null;
          wakeUp();
        }
      });

      // 3. Heartbeat interval
      const heartbeatTimer = setInterval(() => {
        queue.push({ type: 'heartbeat' });
        if (resolve) {
          resolve();
          resolve = null;
        }
      }, 15_000);

      try {
        while (!done) {
          while (queue.length > 0) {
            const event = queue.shift();
            if (!event) {
              break;
            }
            yield event;
            if (event.type === 'end') {
              return;
            }
          }
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      } finally {
        clearInterval(heartbeatTimer);
        unsubscribe();
      }
    },

    getNodeExecutions(flowRunId, options) {
      logger.debug('getNodeExecutionsByRunId called', { flowRunId });
      return nodeExecutionsService.listNodeExecutions({
        ...options,
        filter: { ...options?.filter, flowRunId: [flowRunId] },
      });
    },

    listNodeExecutions(options) {
      logger.debug('listNodeExecutions called');
      return nodeExecutionsService.listNodeExecutions(options);
    },
  };
}
