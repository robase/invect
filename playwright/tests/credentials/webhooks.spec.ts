// spec: specs/credential-management.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

/** Helper: navigate to /invect/credentials and wait for the page to load */
async function goToCredentials(page: import("@playwright/test").Page) {
  await page.goto("/invect/credentials");
  await expect(
    page.getByRole("heading", { level: 1, name: "Credentials" })
  ).toBeVisible({ timeout: 15_000 });
}

/** Helper: delete a credential by name via API */
async function cleanupCredentialByName(
  request: import("@playwright/test").APIRequestContext,
  apiBase: string,
  name: string
) {
  const list = await request.get(`${apiBase}/credentials`);
  if (!list.ok()) return;
  const creds: Array<{ id: string; name: string }> = await list.json();
  for (const c of creds) {
    if (c.name === name) {
      await request.delete(`${apiBase}/credentials/${c.id}`);
    }
  }
}

test.describe("Credential Webhooks — Enable & Display", () => {
  test("enable webhook on a credential and view URL and secret", async ({
    page,
    request,
    apiBase,
  }) => {
    const credName = "Webhook Test Cred";
    // Cleanup from prior runs
    await cleanupCredentialByName(request, apiBase, credName);

    // Create a fresh credential via API
    const createResp = await request.post(`${apiBase}/credentials`, {
      data: {
        name: credName,
        type: "http-api",
        authType: "bearer",
        config: { token: "webhook-test-token" },
      },
    });
    expect(createResp.ok()).toBeTruthy();

    // 1. Navigate to credentials page — 'Webhook Test Cred' appears in the list
    await goToCredentials(page);
    await expect(page.getByText(credName)).toBeVisible({ timeout: 5_000 });

    // 2. Click credential to open detail, then click the 'Webhook' tab
    const row = page.getByRole("button").filter({ hasText: credName });
    await row.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole("button", { name: "Webhook" }).click();

    // Shows the webhook enable prompt and 'Enable Webhook' button
    const enableBtn = dialog.getByRole("button", { name: "Enable Webhook" });
    await expect(enableBtn).toBeVisible({ timeout: 5_000 });
    await expect(
      dialog.getByText(/Enable a webhook/)
    ).toBeVisible();

    // 3. Click 'Enable Webhook' button
    await enableBtn.click();

    // Button briefly shows 'Enabling…' then webhook URL and secret are displayed
    await expect(
      dialog.getByText(/Enabling/i)
    ).toBeVisible({ timeout: 3_000 }).catch(() => {
      // May transition too fast
    });

    // Webhook URL is displayed — contains '/webhooks/credentials/'
    await expect(
      dialog.getByText(/\/webhooks\/credentials\//)
    ).toBeVisible({ timeout: 10_000 });

    // Secret field is displayed
    await expect(dialog.getByText("Secret").first()).toBeVisible();

    // 4. Descriptive text
    await expect(
      dialog.getByText(
        /External services send events to this URL/
      )
    ).toBeVisible();
  });

  test("existing webhook-enabled credential shows URL on webhook tab", async ({
    page,
    request,
    apiBase,
  }) => {
    // Ensure webhook is enabled on the credential via API
    // (seeded data may have been recreated without webhook_path)
    const listResp = await request.get(`${apiBase}/credentials`);
    const creds: Array<{ id: string; name: string }> = await listResp.json();
    const linearCred = creds.find((c) => c.name === "Linear OAuth2");
    expect(linearCred, "Linear OAuth2 credential must exist").toBeTruthy();
    // Enable webhook if not already enabled
    await request.post(
      `${apiBase}/credentials/${linearCred!.id}/webhook/enable`
    );

    // 1. Navigate and click on 'Linear OAuth2'
    await goToCredentials(page);
    const row = page
      .getByRole("button")
      .filter({ hasText: "Linear OAuth2" });
    await row.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // 2. Click the 'Webhook' tab
    await dialog.getByRole("button", { name: "Webhook" }).click();

    // Webhook URL is displayed immediately (no 'Enable' button)
    await expect(
      dialog.getByText(/\/webhooks\/credentials\//)
    ).toBeVisible({ timeout: 10_000 });

    // 'Enable Webhook' button should NOT be visible
    await expect(
      dialog.getByRole("button", { name: "Enable Webhook" })
    ).not.toBeVisible();

    // Secret is displayed
    await expect(dialog.getByText("Secret").first()).toBeVisible();
  });
});
