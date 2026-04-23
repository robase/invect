/**
 * HTTP request node helper.
 *
 * `http.request` — make an outbound HTTP call with configurable method,
 * headers, body, and optional credential-bound auth.
 */

import { httpRequestAction } from '@invect/actions/http';
import type { NodeOptions, SdkFlowNode } from '@invect/action-kit';

export interface HttpRequestParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  credentialId?: string;
  timeout?: number;
}

export function httpRequest(
  referenceId: string,
  params: HttpRequestParams,
  options?: NodeOptions,
): SdkFlowNode {
  return httpRequestAction(
    referenceId,
    {
      url: params.url,
      method: params.method ?? 'GET',
      headers: params.headers ?? {},
      body: params.body ?? '',
      credentialId: params.credentialId,
      timeout: params.timeout ?? 30000,
    },
    options,
  );
}
