/**
 * Agent tool-instance helper.
 *
 * Agents hold their attached tools on `params.addedTools[]`. Each entry has
 * an `instanceId` (assigned by the save pipeline, not here), the `toolId`
 * (matching an action's `id`), and optional overrides for the name,
 * description, and static params presented to the agent's LLM.
 *
 * Usage in a flow:
 *   ```ts
 *   agent('researcher', {
 *     credentialId: '{{ env.OPENAI }}',
 *     model: 'gpt-4o',
 *     taskPrompt: '...',
 *     addedTools: [
 *       tool('github.search_issues', { description: 'Look for existing issues' }),
 *       tool('gmail.send_message'),
 *     ],
 *   });
 *   ```
 *
 * `instanceId` is intentionally omitted — the save/merge pipeline assigns one
 * when new, preserves existing ones when matching against a prior version.
 */

export interface ToolInstance {
  toolId: string;
  name: string;
  description: string;
  params: Record<string, unknown>;
}

export function tool(
  toolId: string,
  options?: {
    /** Display name shown to the LLM. Defaults to the toolId. */
    name?: string;
    /** Description shown to the LLM. Defaults to empty string. */
    description?: string;
    /** Static params bound to every invocation of this tool instance. */
    params?: Record<string, unknown>;
  },
): ToolInstance {
  return {
    toolId,
    name: options?.name ?? toolId,
    description: options?.description ?? '',
    params: options?.params ?? {},
  };
}
