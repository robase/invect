/**
 * Shared API contract test helpers for cross-platform parity.
 *
 * All three framework adapters (Express, NestJS, Next.js) wrap the same
 * Invect core, so their REST API surface must be identical. These helpers
 * define the contract that each adapter is validated against.
 */
import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Run the full Invect API contract against the given base URL.
 * The caller is responsible for providing a `request` fixture and the
 * correct `apiBase` (e.g. "http://localhost:3000/invect").
 */
export async function runApiContract(
  request: APIRequestContext,
  apiBase: string,
) {
  // -------------------------------------------------------------------
  // 1. Flow CRUD
  // -------------------------------------------------------------------

  // 1a. List flows — GET /flows/list returns a paginated response with data array
  const listFlowsRes = await request.get(`${apiBase}/flows/list`);
  expect(listFlowsRes.ok()).toBeTruthy();
  const flowsResponse = await listFlowsRes.json();
  // listFlows returns PaginatedResponse<Flow> = { data: Flow[], total, page, limit }
  expect(flowsResponse).toHaveProperty("data");
  expect(Array.isArray(flowsResponse.data)).toBeTruthy();

  // 1b. Create a flow — POST /flows
  const createFlowRes = await request.post(`${apiBase}/flows`, {
    data: {
      name: "Platform Parity Test Flow",
      description: "Auto-created by cross-platform E2E test",
    },
  });
  expect(createFlowRes.ok()).toBeTruthy();
  const createdFlow = await createFlowRes.json();
  expect(createdFlow).toHaveProperty("id");
  expect(createdFlow.name).toContain("Platform Parity Test Flow");
  const flowId: string = createdFlow.id;

  // 1c. Get flow by ID — GET /flows/:id
  const getFlowRes = await request.get(`${apiBase}/flows/${flowId}`);
  expect(getFlowRes.ok()).toBeTruthy();
  const fetchedFlow = await getFlowRes.json();
  expect(fetchedFlow.id).toBe(flowId);

  // 1d. Get flow versions — POST /flows/:id/versions/list
  const listVersionsRes = await request.post(
    `${apiBase}/flows/${flowId}/versions/list`,
    { data: {} },
  );
  expect(listVersionsRes.ok()).toBeTruthy();

  // 1e. Get React Flow representation — GET /flows/:id/react-flow
  const reactFlowRes = await request.get(
    `${apiBase}/flows/${flowId}/react-flow`,
  );
  expect(reactFlowRes.ok()).toBeTruthy();
  const reactFlowData = await reactFlowRes.json();
  // Should contain nodes and edges arrays
  expect(reactFlowData).toHaveProperty("nodes");
  expect(reactFlowData).toHaveProperty("edges");

  // -------------------------------------------------------------------
  // 2. Credential CRUD
  // -------------------------------------------------------------------

  // 2a. List credentials — GET /credentials
  const listCredsRes = await request.get(`${apiBase}/credentials`);
  expect(listCredsRes.ok()).toBeTruthy();
  const credsBody = await listCredsRes.json();
  // May be paginated or flat array depending on adapter
  const credsList = Array.isArray(credsBody) ? credsBody : (credsBody.data ?? credsBody);
  expect(credsList).toBeDefined();

  // 2b. Create a credential — POST /credentials
  const createCredRes = await request.post(`${apiBase}/credentials`, {
    data: {
      name: "Platform Test Credential",
      type: "http-api",
      authType: "bearer",
      config: { token: "test-token-for-platform-parity" },
      description: "Auto-created by cross-platform test",
    },
  });
  expect(createCredRes.ok()).toBeTruthy();
  const createdCred = await createCredRes.json();
  expect(createdCred).toHaveProperty("id");
  expect(createdCred.name).toBe("Platform Test Credential");
  const credId: string = createdCred.id;

  // 2c. Get credential by ID — GET /credentials/:id
  const getCredRes = await request.get(`${apiBase}/credentials/${credId}`);
  expect(getCredRes.ok()).toBeTruthy();
  const fetchedCred = await getCredRes.json();
  expect(fetchedCred.id).toBe(credId);
  expect(fetchedCred.name).toBe("Platform Test Credential");

  // 2d. Test credential — POST /credentials/:id/test
  const testCredRes = await request.post(
    `${apiBase}/credentials/${credId}/test`,
  );
  expect(testCredRes.ok()).toBeTruthy();
  const testResult = await testCredRes.json();
  // testCredential returns { success: boolean, error?: string }
  expect(testResult).toHaveProperty("success");

  // 2e. Delete credential — DELETE /credentials/:id
  const deleteCredRes = await request.delete(
    `${apiBase}/credentials/${credId}`,
  );
  expect(deleteCredRes.status()).toBeLessThan(300);

  // Verify credential is gone
  const verifyDeletedRes = await request.get(
    `${apiBase}/credentials/${credId}`,
  );
  expect(verifyDeletedRes.ok()).toBeFalsy();

  // -------------------------------------------------------------------
  // 3. Agent tools — GET /agent/tools
  // -------------------------------------------------------------------
  const agentToolsRes = await request.get(`${apiBase}/agent/tools`);
  expect(agentToolsRes.ok()).toBeTruthy();
  const agentTools: unknown[] = await agentToolsRes.json();
  expect(Array.isArray(agentTools)).toBeTruthy();
  expect(agentTools.length).toBeGreaterThan(0);

  // Each tool should have the standard shape
  const firstTool = agentTools[0] as Record<string, unknown>;
  expect(firstTool).toHaveProperty("id");
  expect(firstTool).toHaveProperty("name");

  // -------------------------------------------------------------------
  // 4. Node data — GET /node-data/models
  // -------------------------------------------------------------------
  const modelsRes = await request.get(`${apiBase}/node-data/models`);
  expect(modelsRes.ok()).toBeTruthy();
  const models = await modelsRes.json();
  // Should return models list (may be empty if no AI keys configured)
  expect(models).toBeDefined();

  // -------------------------------------------------------------------
  // 5. Flow run management
  // -------------------------------------------------------------------

  // 5a. List flow runs — POST /flow-runs/list
  const listRunsRes = await request.post(`${apiBase}/flow-runs/list`, {
    data: {},
  });
  expect(listRunsRes.ok()).toBeTruthy();
  const flowRuns = await listRunsRes.json();
  // May be paginated or flat
  expect(flowRuns).toBeDefined();

  // -------------------------------------------------------------------
  // 6. Cleanup: delete the test flow
  // -------------------------------------------------------------------
  const deleteFlowRes = await request.delete(`${apiBase}/flows/${flowId}`);
  expect(deleteFlowRes.status()).toBeLessThan(300);

  // Verify flow is gone
  const verifyFlowDeletedRes = await request.get(
    `${apiBase}/flows/${flowId}`,
  );
  expect(verifyFlowDeletedRes.ok()).toBeFalsy();
}

/**
 * Cleanup helper — remove any leftover test data by name.
 * Safe to call even if no matching data exists.
 */
export async function cleanupTestData(
  request: APIRequestContext,
  apiBase: string,
) {
  // Clean up test flows
  try {
    const flowsRes = await request.get(`${apiBase}/flows/list`);
    if (flowsRes.ok()) {
      const body = await flowsRes.json();
      // Handle paginated response: { data: [...] }
      const flows: Array<{ id: string; name: string }> = Array.isArray(body)
        ? body
        : (body.data ?? []);
      for (const f of flows) {
        if (f.name && f.name.includes("Platform Parity Test")) {
          await request.delete(`${apiBase}/flows/${f.id}`);
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  // Clean up test credentials
  try {
    const credsRes = await request.get(`${apiBase}/credentials`);
    if (credsRes.ok()) {
      const body = await credsRes.json();
      const creds: Array<{ id: string; name: string }> = Array.isArray(body)
        ? body
        : (body.data ?? []);
      for (const c of creds) {
        if (c.name === "Platform Test Credential") {
          await request.delete(`${apiBase}/credentials/${c.id}`);
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}
