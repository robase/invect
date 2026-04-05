import { ValidationError } from 'src/types/common/errors.types';

/**
 * Cron Scheduler Service
 *
 * Manages in-process cron jobs using the `croner` library. Reads enabled cron
 * trigger registrations from the database and schedules them. On refresh, all
 * existing jobs are stopped and re-created from the current registrations.
 *
 * Lifecycle:
 *   initialize() → start() → ... refresh() ... → stop()
 *
 * Multi-instance caveat (v1):
 *   Each process runs its own scheduler. If multiple instances are running,
 *   cron jobs fire once per instance. Mitigation: set `cronEnabled: false` on
 *   non-primary instances, or make handlers idempotent.
 */

import { Cron } from 'croner';
import type { Logger } from 'src/schemas';
import type { FlowTriggersService } from './flow-triggers.service';

export class CronSchedulerService {
  /** Map of triggerId → active Cron job */
  private jobs: Map<string, Cron> = new Map();
  private running = false;

  constructor(
    private readonly logger: Logger,
    private readonly triggersService: FlowTriggersService,
  ) {}

  /**
   * Start the cron scheduler. Reads all enabled cron triggers and creates jobs.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Cron scheduler already running, call refresh() instead');
      return;
    }

    this.logger.info('Starting cron scheduler');
    this.running = true;

    try {
      const cronTriggers = await this.triggersService.getEnabledCronTriggers();

      for (const trigger of cronTriggers) {
        if (trigger.cronExpression) {
          this.scheduleJob(trigger.id, trigger.cronExpression, trigger.cronTimezone ?? 'UTC');
        }
      }

      this.logger.info('Cron scheduler started', {
        jobCount: this.jobs.size,
        triggerIds: Array.from(this.jobs.keys()),
      });
    } catch (error) {
      this.logger.error('Failed to start cron scheduler', { error });
    }
  }

  /**
   * Stop all cron jobs and shut down the scheduler.
   */
  stop(): void {
    this.logger.info('Stopping cron scheduler', { jobCount: this.jobs.size });

    for (const [triggerId, job] of this.jobs.entries()) {
      try {
        job.stop();
      } catch (error) {
        this.logger.error('Failed to stop cron job', { triggerId, error });
      }
    }

    this.jobs.clear();
    this.running = false;
    this.logger.info('Cron scheduler stopped');
  }

  /**
   * Refresh all cron jobs from the database. Stops all existing jobs first.
   */
  async refresh(): Promise<void> {
    this.logger.debug('Refreshing cron scheduler');

    // Stop existing jobs
    for (const [, job] of this.jobs.entries()) {
      try {
        job.stop();
      } catch {
        // ignore — job may already be stopped
      }
    }
    this.jobs.clear();

    if (!this.running) {
      return;
    }

    try {
      const cronTriggers = await this.triggersService.getEnabledCronTriggers();

      for (const trigger of cronTriggers) {
        if (trigger.cronExpression) {
          this.scheduleJob(trigger.id, trigger.cronExpression, trigger.cronTimezone ?? 'UTC');
        }
      }

      this.logger.info('Cron scheduler refreshed', {
        jobCount: this.jobs.size,
      });
    } catch (error) {
      this.logger.error('Failed to refresh cron scheduler', { error });
    }
  }

  /**
   * Get the number of active cron jobs.
   */
  getJobCount(): number {
    return this.jobs.size;
  }

  /**
   * Check if the scheduler is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // ─── Private ────────────────────────────────────────────────────

  private scheduleJob(triggerId: string, expression: string, timezone: string): void {
    try {
      const job = new Cron(expression, { timezone, name: `trigger:${triggerId}` }, async () => {
        this.logger.info('Cron trigger firing', { triggerId, expression, timezone });

        try {
          const result = await this.triggersService.executeCronTrigger(triggerId);
          this.logger.info('Cron trigger executed successfully', {
            triggerId,
            flowRunId: result.flowRunId,
            flowId: result.flowId,
          });
        } catch (error) {
          if (
            error instanceof ValidationError &&
            (error.message === 'Flow is inactive' || error.message === 'Cron trigger is disabled')
          ) {
            // Expected skip — already logged at info level by the triggers service
          } else {
            this.logger.error('Cron trigger execution failed', {
              triggerId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });

      this.jobs.set(triggerId, job);

      this.logger.debug('Cron job scheduled', {
        triggerId,
        expression,
        timezone,
        nextRun: job.nextRun()?.toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to schedule cron job — invalid expression?', {
        triggerId,
        expression,
        timezone,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
