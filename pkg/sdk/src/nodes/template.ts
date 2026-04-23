/**
 * Template-string node helper.
 *
 * `core.template_string` — renders a string with `{{ expr }}` interpolations
 * evaluated against upstream node outputs.
 */

import { templateStringAction } from '@invect/actions/core';
import type { NodeOptions, SdkFlowNode } from '@invect/action-kit';

export function template(
  referenceId: string,
  params: { template: string },
  options?: NodeOptions,
): SdkFlowNode {
  return templateStringAction(referenceId, { template: params.template }, options);
}
