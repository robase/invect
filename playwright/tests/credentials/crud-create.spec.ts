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

/** Helper: open the "New Credential" modal */
async function openCreateModal(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "New Credential" }).click();
  await expect(
    page.getByRole("heading", { name: "Create Credential" })
  ).toBeVisible({ timeout: 5_000 });
}

/** Helper: delete a credential by name via API so tests don't leak state */
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

test.describe("Credential CRUD — Create", () => {
  test("create a bearer token credential via the modal", async ({
    page,
    request,
    apiBase,
  }) => {
    const credName = "Test Bearer Cred";
    // Cleanup from any prior runs
    await cleanupCredentialByName(request, apiBase, credName);

    // 1. Navigate to /invect/credentials
    await goToCredentials(page);

    // 2. Click the 'New Credential' button
    await openCreateModal(page);

    // 3. Fill in Name, leave type as 'HTTP API' and auth type as 'Bearer Token'
    await page.getByLabel("Name*").fill(credName);
    // Token field should be visible (Bearer is default auth type)
    await expect(page.getByLabel("Token*")).toBeVisible();

    // 4. Type token into the Token field
    const tokenField = page.getByLabel("Token*");
    await tokenField.fill("sk-test-12345");
    // Verify it's a password field (masked)
    await expect(tokenField).toHaveAttribute("type", "password");

    // 5. Click 'Create Credential' button
    await page.getByRole("button", { name: "Create Credential" }).click();

    // Dialog should close
    await expect(
      page.getByRole("heading", { name: "Create Credential" })
    ).not.toBeVisible({ timeout: 5_000 });

    // The credential appears in the list with a 'Bearer' badge
    await expect(page.getByText(credName)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Bearer").first()).toBeVisible();
  });

  test("create an API Key credential with custom parameter name", async ({
    page,
    request,
    apiBase,
  }) => {
    const credName = "My API Key Cred";
    await cleanupCredentialByName(request, apiBase, credName);

    // 1. Navigate and open modal
    await goToCredentials(page);
    await openCreateModal(page);

    // 2. Fill Name and select auth type 'API Key'
    await page.getByLabel("Name*").fill(credName);
    await page.locator("#authType").selectOption("apiKey");

    // API Key field, Location dropdown, and Parameter Name field should appear
    await expect(page.getByLabel("API Key*")).toBeVisible();
    await expect(page.locator("#location")).toBeVisible();
    await expect(page.getByLabel("Parameter Name")).toBeVisible();

    // 3. Fill in the API Key fields
    await page.getByLabel("API Key*").fill("abc-key-999");
    await page.locator("#location").selectOption("header");
    await page.getByLabel("Parameter Name").fill("X-Custom-Key");

    // 4. Click 'Create Credential'
    await page.getByRole("button", { name: "Create Credential" }).click();

    // Dialog should close
    await expect(
      page.getByRole("heading", { name: "Create Credential" })
    ).not.toBeVisible({ timeout: 5_000 });

    // The credential appears in the list with an 'API Key' badge
    await expect(page.getByText(credName)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("API Key").first()).toBeVisible();
  });

  test("create a Basic Auth credential", async ({ page, request, apiBase }) => {
    const credName = "Basic Auth Cred";
    await cleanupCredentialByName(request, apiBase, credName);

    // 1. Navigate and open modal
    await goToCredentials(page);
    await openCreateModal(page);

    // 2. Fill Name and select auth type 'Basic Auth'
    await page.getByLabel("Name*").fill(credName);
    await page.locator("#authType").selectOption("basic");

    // Username and Password fields should appear
    await expect(page.getByLabel("Username*")).toBeVisible();
    await expect(page.getByLabel("Password*")).toBeVisible();

    // 3. Enter username and password, click create
    await page.getByLabel("Username*").fill("admin");
    await page.getByLabel("Password*").fill("secret123");
    await page.getByRole("button", { name: "Create Credential" }).click();

    // Dialog should close
    await expect(
      page.getByRole("heading", { name: "Create Credential" })
    ).not.toBeVisible({ timeout: 5_000 });

    // The credential appears with a 'Basic' badge
    await expect(page.getByText(credName)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Basic").first()).toBeVisible();
  });

  test("create a Database connection string credential", async ({
    page,
    request,
    apiBase,
  }) => {
    const credName = "Postgres Dev DB";
    await cleanupCredentialByName(request, apiBase, credName);

    // 1. Navigate and open modal
    await goToCredentials(page);
    await openCreateModal(page);

    // 2. Select 'Database' for Credential Type
    await page.locator("#type").selectOption("database");

    // Auth Type should now show only basic and connectionString options
    const authSelect = page.locator("#authType");
    const options = authSelect.locator("option");
    const optionValues = await options.evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value)
    );
    expect(optionValues).toContain("basic");
    expect(optionValues).toContain("connectionString");
    expect(optionValues).not.toContain("bearer");

    // 3. Select 'Connection String', fill name
    await authSelect.selectOption("connectionString");
    await page.getByLabel("Name*").fill(credName);

    // Connection String field should appear
    const connField = page.getByLabel("Connection String*");
    await expect(connField).toBeVisible();

    // 4. Enter connection string and create
    await connField.fill("postgres://user:pass@localhost:5432/testdb");
    await page.getByRole("button", { name: "Create Credential" }).click();

    // Dialog should close
    await expect(
      page.getByRole("heading", { name: "Create Credential" })
    ).not.toBeVisible({ timeout: 5_000 });

    // Credential appears in list with a 'Connection' badge
    await expect(page.getByText(credName)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Connection").first()).toBeVisible();
  });

  test("cannot create a credential without a name", async ({ page }) => {
    // 1. Navigate and open modal
    await goToCredentials(page);
    await openCreateModal(page);

    // 2. Leave Name empty, fill a token, attempt to submit
    await page.getByLabel("Token*").fill("some-token");
    await page.getByRole("button", { name: "Create Credential" }).click();

    // The form should not submit — HTML required validation fires
    // Dialog remains open
    await expect(
      page.getByRole("heading", { name: "Create Credential" })
    ).toBeVisible();

    // The Name field should be invalid (required but empty)
    const nameField = page.getByLabel("Name*");
    const isInvalid = await nameField.evaluate(
      (el) => !(el as HTMLInputElement).validity.valid
    );
    expect(isInvalid).toBe(true);
  });
});
