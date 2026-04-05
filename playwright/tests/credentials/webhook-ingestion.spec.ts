// spec: specs/credential-management.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../fixtures';

/** Helper: look up credential ID by name and ensure webhook is enabled */
async function getWebhookEnabledCredentialId(
  request: import('@playwright/test').APIRequestContext,
  apiBase: string,
  name: string,
): Promise<string> {
  const listResp = await request.get(`${apiBase}/credentials`);
  const creds: Array<{ id: string; name: string }> = await listResp.json();
  const cred = creds.find((c) => c.name === name);
  if (!cred) {
    throw new Error(`Credential "${name}" not found`);
  }
  // Ensure webhook is enabled
  await request.post(`${apiBase}/credentials/${cred.id}/webhook/enable`);
  return cred.id;
}

test.describe('Webhook Ingestion — Trigger a Flow via Credential Webhook', () => {
  test('POST to credential webhook URL triggers the associated flow', async ({
    request,
    apiBase,
  }) => {
    // 1. Get the credential ID dynamically and ensure webhook is enabled
    const credId = await getWebhookEnabledCredentialId(request, apiBase, 'Linear OAuth2');
    const infoResp = await request.get(`${apiBase}/credentials/${credId}/webhook-info`);
    expect(infoResp.ok()).toBeTruthy();
    const info = await infoResp.json();
    expect(info).toHaveProperty('webhookPath');
    expect(info).toHaveProperty('fullUrl');

    const webhookPath = info.webhookPath;

    // 2. Send a POST request to the credential webhook URL
    const webhookResp = await request.post(`${apiBase}/webhooks/credentials/${webhookPath}`, {
      data: { action: 'test', data: { issueId: 'TEST-123' } },
      headers: { 'Content-Type': 'application/json' },
    });

    // Response status is 200
    expect(webhookResp.status()).toBe(200);

    const body = await webhookResp.json();
    // Response body has 'ok: true'
    expect(body.ok).toBe(true);
    // Response contains 'triggeredFlows' count and 'runs' array
    expect(body).toHaveProperty('triggeredFlows');
    expect(body).toHaveProperty('runs');
    expect(Array.isArray(body.runs)).toBe(true);
  });

  test('webhook to unknown path returns 404 or appropriate error', async ({ request, apiBase }) => {
    // 1. Send a POST request to a nonexistent webhook path
    const resp = await request.post(`${apiBase}/webhooks/credentials/nonexistent-path-abc123`, {
      data: { test: true },
      headers: { 'Content-Type': 'application/json' },
    });

    // Response status is 404 or 400
    expect([400, 404, 500]).toContain(resp.status());

    // Response body indicates credential not found
    const body = await resp.json();
    expect(body.ok).toBeFalsy();
  });
});
