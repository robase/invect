/**
 * Chat Tools — Plan Tracking
 *
 * Tools that let the AI assistant create and track a step-by-step plan.
 * Plans are visible to the user through tool call events in the chat stream.
 *
 * The LLM uses set_plan to present a plan before building, and update_plan
 * to mark steps as completed (or adjust the plan) as it works.
 *
 * Plans are ephemeral (per-conversation) — they live in the LLM's context
 * window via tool call/result history. No persistence needed.
 */

import { z } from 'zod/v4';
import type { ChatToolDefinition, ChatToolContext, ChatToolResult } from '../chat-types';

// =====================================
// set_plan
// =====================================

export const setPlanTool: ChatToolDefinition = {
  id: 'set_plan',
  name: 'Set Plan',
  description:
    'Create a step-by-step plan for building or modifying a flow. ' +
    'Use this BEFORE starting any complex work (3+ steps). ' +
    'Present the plan to the user and wait for their confirmation before executing. ' +
    'Each step should be a concise, actionable description.',
  parameters: z.object({
    steps: z
      .array(
        z.object({
          title: z
            .string()
            .describe('Short description of the step (e.g. "Add HTTP request to AiPrise API")'),
          status: z
            .enum(['pending', 'in_progress', 'done', 'skipped'])
            .default('pending')
            .describe('Step status — should be "pending" when first creating the plan'),
        }),
      )
      .min(1)
      .max(20)
      .describe('Ordered list of steps to complete'),
    summary: z
      .string()
      .optional()
      .describe(
        'Brief one-line summary of the overall goal (e.g. "Build a KYC verification flow")',
      ),
  }),
  async execute(params: unknown, _ctx: ChatToolContext): Promise<ChatToolResult> {
    const { steps, summary } = params as {
      steps: Array<{ title: string; status: string }>;
      summary?: string;
    };

    return {
      success: true,
      data: {
        summary: summary ?? 'Plan created',
        totalSteps: steps.length,
        steps: steps.map((s, i) => ({
          index: i + 1,
          title: s.title,
          status: s.status ?? 'pending',
        })),
      },
      uiAction: {
        action: 'show_plan',
        data: {
          summary: summary ?? 'Plan created',
          steps: steps.map((s, i) => ({
            index: i + 1,
            title: s.title,
            status: s.status ?? 'pending',
          })),
        },
      },
    };
  },
};

// =====================================
// update_plan
// =====================================

export const updatePlanTool: ChatToolDefinition = {
  id: 'update_plan',
  name: 'Update Plan',
  description:
    'Update the status of steps in the current plan. Use this after completing each step ' +
    'to keep the user informed of progress. You can also add new steps or mark steps as skipped ' +
    'if the plan needs to change.',
  parameters: z.object({
    steps: z
      .array(
        z.object({
          title: z.string().describe('Step description (can be updated)'),
          status: z
            .enum(['pending', 'in_progress', 'done', 'skipped'])
            .describe('Updated step status'),
        }),
      )
      .min(1)
      .max(20)
      .describe('Complete updated step list (include ALL steps, not just changed ones)'),
    note: z
      .string()
      .optional()
      .describe(
        'Optional note about what changed or why (e.g. "AiPrise not available, using HTTP instead")',
      ),
  }),
  async execute(params: unknown, _ctx: ChatToolContext): Promise<ChatToolResult> {
    const { steps, note } = params as {
      steps: Array<{ title: string; status: string }>;
      note?: string;
    };

    const doneCount = steps.filter((s) => s.status === 'done').length;
    const totalSteps = steps.filter((s) => s.status !== 'skipped').length;

    return {
      success: true,
      data: {
        progress: `${doneCount}/${totalSteps} steps completed`,
        steps: steps.map((s, i) => ({
          index: i + 1,
          title: s.title,
          status: s.status,
        })),
        ...(note && { note }),
      },
      uiAction: {
        action: 'update_plan',
        data: {
          steps: steps.map((s, i) => ({
            index: i + 1,
            title: s.title,
            status: s.status,
          })),
          progress: `${doneCount}/${totalSteps}`,
          ...(note && { note }),
        },
      },
    };
  },
};

// =====================================
// Export all plan tools
// =====================================

export const planTools: ChatToolDefinition[] = [setPlanTool, updatePlanTool];
