/**
 * Visual Audit — Screenshot Capture Script
 *
 * A Playwright "test" that navigates every major UI state and saves annotated
 * screenshots + metadata.json to `playwright/visual-audit/output/`.
 *
 * Uses the same isolated-server pattern as critical-paths tests:
 *   - Fresh SQLite DB per worker
 *   - Express server on a random port
 *   - Route interception so the Vite frontend talks to the isolated server
 *
 * Run: pnpm ux:capture
 */

import {
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { SCREENS, SEED_FLOWS, type ScreenDefinition } from "./screens";
import {
  createSqliteBrowserIsolationTest,
  expect,
} from "../test-support/sqlite-isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VITE_BASE = "http://localhost:5173";
const OUTPUT_DIR = path.resolve(__dirname, "output");
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, "screenshots");
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

// ─── Metadata tracking ────────────────────────────────────────────────────

interface ScreenshotMeta {
  id: string;
  filename: string;
  focusCrop: string | null;
  description: string;
  url: string;
  tags: string[];
  viewport: { width: number; height: number };
}

const capturedMetadata: ScreenshotMeta[] = [];

async function takeScreenshot(
  page: Page,
  screen: ScreenDefinition,
  currentUrl: string
) {
  const viewport = screen.viewport ?? DEFAULT_VIEWPORT;
  await page.setViewportSize(viewport);
  // Small settle time for layout reflows
  await page.waitForTimeout(500);

  const filename = `${screen.id}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename) });

  let focusCrop: string | null = null;
  if (screen.focusCropSelector) {
    const locator = page.locator(screen.focusCropSelector).first();
    if (await locator.isVisible().catch(() => false)) {
      focusCrop = `${screen.id}-focus.png`;
      await locator.screenshot({ path: path.join(SCREENSHOTS_DIR, focusCrop) });
    }
  }

  capturedMetadata.push({
    id: screen.id,
    filename,
    focusCrop,
    description: screen.description,
    url: currentUrl,
    tags: screen.tags,
    viewport,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getSidebarToggle(page: Page) {
  return page.locator(".imp-sidebar-shell button.absolute").first();
}

async function ensureSidebarExpanded(page: Page) {
  const label = page.locator(".imp-sidebar-shell nav span").filter({ hasText: "Executions" });
  if (!await label.isVisible().catch(() => false)) {
    await getSidebarToggle(page).click();
    await expect(label).toBeVisible({ timeout: 3_000 });
  }
}

async function enableDarkMode(page: Page) {
  await ensureSidebarExpanded(page);
  const btn = page.locator(".imp-sidebar-shell button").filter({ hasText: "Dark Mode" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await expect(page.locator(".invect").first()).toHaveClass(/\bdark\b/, { timeout: 3_000 });
  }
}

async function enableLightMode(page: Page) {
  await ensureSidebarExpanded(page);
  const btn = page.locator(".imp-sidebar-shell button").filter({ hasText: "Light Mode" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await expect(page.locator(".invect").first()).not.toHaveClass(/\bdark\b/, { timeout: 3_000 });
  }
}

async function waitForDashboard(page: Page) {
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });
  await page.getByText("Loading flows").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

async function getFlowIdByName(
  apiBase: string,
  request: APIRequestContext,
  name: string
): Promise<string | null> {
  const resp = await request.get(`${apiBase}/flows/list`);
  if (!resp.ok()) return null;
  const body = await resp.json();
  const flows: Array<{ id: string; name: string }> = body.data ?? body;
  return flows.find((f) => f.name === name)?.id ?? null;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

type WorkerFixtures = {
  apiBase: string;
};

type TestFixtures = {
  _routeInterception: void;
};

const rootDir = path.resolve(__dirname, "../..");
const test = createSqliteBrowserIsolationTest({
  apiPrefix: "/invect",
  apiRoutePrefix: "/api/invect",
  dbFilePrefix: "invect-va",
  readyPath: "/health",
  serverCwd: path.join(rootDir, "examples/express-drizzle"),
  serverScript: path.join(rootDir, "examples/express-drizzle/playwright-test-server.ts"),
  sharedOrigin: "http://localhost:5173",
});

// ─── Main capture test ────────────────────────────────────────────────────

test.describe("Visual Audit — Screenshot Capture", () => {
  let dataPipelineId: string | null = null;
  let aiAssistantId: string | null = null;
  let agentEmptyFlowId: string | null = null;
  let agentWithToolsFlowId: string | null = null;

  test.beforeAll(async ({ request, apiBase }) => {
    // Ensure output directories exist
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    // Seed flows
    for (const [key, flow] of Object.entries(SEED_FLOWS)) {
      const resp = await request.post(`${apiBase}/flows`, {
        data: { name: flow.name },
      });
      if (!resp.ok()) continue;
      const created = await resp.json();
      const flowId = created.id;

      if (key === "dataPipeline") dataPipelineId = flowId;
      if (key === "aiAssistant") aiAssistantId = flowId;
      if (key === "agentEmpty") agentEmptyFlowId = flowId;
      if (key === "agentWithTools") agentWithToolsFlowId = flowId;

      await request.post(`${apiBase}/flows/${flowId}/versions`, {
        data: { invectDefinition: flow.definition },
      });
    }
  });

  test("capture all screens", async ({ page, apiBase, request }) => {
    const screensById = Object.fromEntries(SCREENS.map((s) => [s.id, s]));

    // ── 01: Dashboard collapsed ───────────────────────────────────────────
    await page.goto(`${VITE_BASE}/invect`);
    await waitForDashboard(page);
    await takeScreenshot(page, screensById["01-dashboard-collapsed"]!, "/invect");

    // ── 02: Dashboard expanded ────────────────────────────────────────────
    await ensureSidebarExpanded(page);
    await takeScreenshot(page, screensById["02-dashboard-expanded"]!, "/invect");

    // ── 03: Executions page ───────────────────────────────────────────────
    await page.locator(".imp-sidebar-shell").getByRole("link", { name: "Executions" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Executions" })).toBeVisible({ timeout: 15_000 });
    await takeScreenshot(page, screensById["03-executions-page"]!, "/invect/executions");

    // ── 04: Credentials page ──────────────────────────────────────────────
    await page.locator(".imp-sidebar-shell").getByRole("link", { name: "Credentials" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Credentials" })).toBeVisible({ timeout: 15_000 });
    await takeScreenshot(page, screensById["04-credentials-page"]!, "/invect/credentials");

    // ── 05: Add Flow modal ────────────────────────────────────────────────
    await page.locator(".imp-sidebar-shell").getByRole("link", { name: "Home" }).click();
    await waitForDashboard(page);
    // Look for a "New Flow" button
    const newFlowBtn = page.getByRole("button", { name: /new flow/i }).first();
    if (await newFlowBtn.isVisible().catch(() => false)) {
      await newFlowBtn.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, screensById["05-add-flow-modal"]!, "/invect");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 06: Add Credential modal ──────────────────────────────────────────
    await page.locator(".imp-sidebar-shell").getByRole("link", { name: "Credentials" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Credentials" })).toBeVisible({ timeout: 15_000 });
    const addCredBtn = page.getByRole("button", { name: /add|create|new/i }).first();
    if (await addCredBtn.isVisible().catch(() => false)) {
      await addCredBtn.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, screensById["06-add-credential-modal"]!, "/invect/credentials");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 06b: Credential edit modal ───────────────────────────────────────
    const editCredName = "Visual Audit Edit Credential";
    await request.post(`${apiBase}/credentials`, {
      data: {
        name: editCredName,
        type: "http-api",
        authType: "bearer",
        config: { token: "va-edit-token" },
        description: "Credential seeded for edit modal visual capture",
      },
    });
    await page.goto(`${VITE_BASE}/invect/credentials`);
    await expect(page.getByRole("heading", { level: 1, name: "Credentials" })).toBeVisible({ timeout: 15_000 });
    const seededCredRow = page.getByRole("button", { name: new RegExp(editCredName, "i") }).first();
    if (await seededCredRow.isVisible().catch(() => false)) {
      await seededCredRow.click();
      await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      const editTab = page.getByRole("dialog").getByRole("button", { name: "Edit" });
      if (await editTab.isVisible().catch(() => false)) {
        await editTab.click();
      }
      await page.waitForTimeout(500);
      await takeScreenshot(page, screensById["06b-credential-edit-modal"]!, "/invect/credentials");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 07: Editor canvas (Data Pipeline) ─────────────────────────────────
    const flowId = dataPipelineId ?? await getFlowIdByName(apiBase, request, "Data Pipeline");
    expect(flowId, "Data Pipeline flow must exist").not.toBeNull();

    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000); // Let canvas settle
    await takeScreenshot(page, screensById["07-editor-canvas"]!, `/invect/flow/${flowId}`);

    // ── 08: Node selected ─────────────────────────────────────────────────
    const transformNode = page.locator(".react-flow__node").filter({ hasText: "Transform" });
    if (await transformNode.isVisible().catch(() => false)) {
      await transformNode.click();
      await page.waitForTimeout(300);
    }
    await takeScreenshot(page, screensById["08-node-selected"]!, `/invect/flow/${flowId}`);

    // ── 09: Input node config panel ───────────────────────────────────────
    const inputNode = page.locator(".react-flow__node").filter({ hasText: "User Data" });
    if (await inputNode.isVisible().catch(() => false)) {
      await inputNode.dblclick();
      await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await takeScreenshot(page, screensById["09-input-config-panel"]!, `/invect/flow/${flowId}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ── 10: JQ node config panel ──────────────────────────────────────────
    if (await transformNode.isVisible().catch(() => false)) {
      await transformNode.dblclick();
      await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await takeScreenshot(page, screensById["10-jq-config-panel"]!, `/invect/flow/${flowId}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ── 11: Agent node config panel (AI Assistant flow) ───────────────────
    const agentFlowId = aiAssistantId ?? await getFlowIdByName(apiBase, request, "AI Assistant");
    if (agentFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${agentFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);

      const agentNode = page.locator(".react-flow__node").filter({ hasText: "Research Agent" });
      if (await agentNode.isVisible().catch(() => false)) {
        await agentNode.dblclick();
        await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await takeScreenshot(page, screensById["11-agent-config-panel"]!, `/invect/flow/${agentFlowId}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 12: Editor toolbar ────────────────────────────────────────────────
    // Go back to data pipeline to capture toolbar
    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await takeScreenshot(page, screensById["12-editor-toolbar"]!, `/invect/flow/${flowId}`);

    // ── Chat Assistant Screenshots ────────────────────────────────────────

    // Create an LLM credential via API for the chat to use
    const credResp = await request.post(`${apiBase}/credentials`, {
      data: {
        name: "OpenAI GPT-4o",
        type: "llm",
        authType: "api_key",
        config: { apiKey: "sk-mock-key-for-visual-audit", provider: "openai" },
        description: "OpenAI API key for chat assistant",
      },
    });
    const credentialId = credResp.ok() ? (await credResp.json()).id : null;

    // Navigate to the data pipeline flow for chat screenshots
    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // ── 13: Chat panel — no credential state ──────────────────────────────
    // Open chat panel via the Assistant button
    const chatToggle = page.locator("button", { hasText: "Assistant" });
    if (await chatToggle.isVisible().catch(() => false)) {
      await chatToggle.click();
      await page.waitForTimeout(500);
    }
    await takeScreenshot(page, screensById["13-chat-no-credential"]!, `/invect/flow/${flowId}`);

    // ── 14: Chat settings panel ───────────────────────────────────────────
    // Click the settings gear icon in the chat header
    const settingsButton = page.locator("button[title='Chat settings']");
    if (await settingsButton.isVisible().catch(() => false)) {
      await settingsButton.click();
      await page.waitForTimeout(500);
    }
    await takeScreenshot(page, screensById["14-chat-settings-panel"]!, `/invect/flow/${flowId}`);

    // Close settings panel — click the "Back to chat" arrow button in the overlay header
    const backButton = page.locator("button[title='Back to chat']");
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(300);
    }

    // ── 15: Chat panel — ready state (with credential) ────────────────────
    // Set the credential in localStorage so the chat recognises it
    if (credentialId) {
      await page.evaluate((cId) => {
        localStorage.setItem("invect-chat-settings", JSON.stringify({ maxSteps: 8, credentialId: cId }));
      }, credentialId);
    }
    // Reload to pick up the stored credential
    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    // Re-open chat panel
    const chatToggle2 = page.locator("button", { hasText: "Assistant" });
    if (await chatToggle2.isVisible().catch(() => false)) {
      await chatToggle2.click();
      await page.waitForTimeout(500);
    }
    await takeScreenshot(page, screensById["15-chat-ready"]!, `/invect/flow/${flowId}`);

    // ── 16–19: Chat conversation states ───────────────────────────────────
    // We mock the /chat/messages/:flowId endpoint to return pre-built
    // conversations. The API returns a raw array (not wrapped in { messages }).
    // createdAt must be ISO strings to match the DB format.

    const now = new Date();
    const isoMinusMin = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();

    const mockMessages = {
      turn1: [
        {
          id: "msg-1",
          flowId: flowId,
          role: "user",
          content: "Add a JQ node after the input that filters only active users from the data",
          toolMeta: null,
          createdAt: isoMinusMin(1),
        },
      ],
      turn1Reply: [
        {
          id: "msg-1",
          flowId: flowId,
          role: "user",
          content: "Add a JQ node after the input that filters only active users from the data",
          toolMeta: null,
          createdAt: isoMinusMin(4),
        },
        {
          id: "msg-2",
          flowId: flowId,
          role: "assistant",
          content: "",
          toolMeta: {
            toolName: "get_flow",
            args: { flowId: flowId },
            result: { success: true, data: { nodes: 3, edges: 2, name: "Data Pipeline" } },
            status: "done",
          },
          createdAt: isoMinusMin(3.5),
        },
        {
          id: "msg-3",
          flowId: flowId,
          role: "assistant",
          content: "",
          toolMeta: {
            toolName: "update_flow",
            args: { nodeType: "core.jq", label: "Filter Active", query: ".user_data | .users[] | select(.active)" },
            result: { success: true, data: { message: "Added JQ node 'Filter Active' and connected it after 'User Data'" } },
            status: "done",
          },
          createdAt: isoMinusMin(3),
        },
        {
          id: "msg-4",
          flowId: flowId,
          role: "assistant",
          content: "I've added a **JQ node** called \"Filter Active\" after the User Data input. It uses the query:\n\n```jq\n.user_data | .users[] | select(.active)\n```\n\nThis will filter the users array to only include entries where `active` is `true`. The node is connected between User Data and Transform.",
          toolMeta: null,
          createdAt: isoMinusMin(2.5),
        },
      ],
      multiTurn: [
        {
          id: "msg-1",
          flowId: flowId,
          role: "user",
          content: "Add a JQ node after the input that filters only active users from the data",
          toolMeta: null,
          createdAt: isoMinusMin(10),
        },
        {
          id: "msg-2",
          flowId: flowId,
          role: "assistant",
          content: "",
          toolMeta: {
            toolName: "get_flow",
            args: { flowId: flowId },
            result: { success: true, data: { nodes: 3, edges: 2, name: "Data Pipeline" } },
            status: "done",
          },
          createdAt: isoMinusMin(9.5),
        },
        {
          id: "msg-3",
          flowId: flowId,
          role: "assistant",
          content: "",
          toolMeta: {
            toolName: "update_flow",
            args: { nodeType: "core.jq", label: "Filter Active", query: ".user_data | .users[] | select(.active)" },
            result: { success: true, data: { message: "Added JQ node 'Filter Active' and connected it after 'User Data'" } },
            status: "done",
          },
          createdAt: isoMinusMin(9),
        },
        {
          id: "msg-4",
          flowId: flowId,
          role: "assistant",
          content: "Done! I've added a **JQ node** called \"Filter Active\" that filters to only active users. It's connected between User Data and Transform.",
          toolMeta: null,
          createdAt: isoMinusMin(8.5),
        },
        {
          id: "msg-5",
          flowId: flowId,
          role: "user",
          content: "Now add an HTTP request node at the end that POSTs the results to https://api.example.com/users",
          toolMeta: null,
          createdAt: isoMinusMin(5),
        },
        {
          id: "msg-6",
          flowId: flowId,
          role: "assistant",
          content: "",
          toolMeta: {
            toolName: "get_flow",
            args: { flowId: flowId },
            result: { success: true, data: { nodes: 4, edges: 3, name: "Data Pipeline" } },
            status: "done",
          },
          createdAt: isoMinusMin(4.5),
        },
        {
          id: "msg-7",
          flowId: flowId,
          role: "assistant",
          content: "",
          toolMeta: {
            toolName: "update_flow",
            args: {
              nodeType: "http.request",
              label: "POST Results",
              method: "POST",
              url: "https://api.example.com/users",
              body: "{{ results }}",
            },
            result: { success: true, data: { message: "Added HTTP Request node 'POST Results' after 'Results'" } },
            status: "done",
          },
          createdAt: isoMinusMin(4),
        },
        {
          id: "msg-8",
          flowId: flowId,
          role: "assistant",
          content: "I've added an **HTTP Request** node called \"POST Results\" at the end of the flow. It will:\n\n- **Method**: POST\n- **URL**: `https://api.example.com/users`\n- **Body**: The output from the Results node\n\nThe flow now runs: User Data → Filter Active → Transform → Results → POST Results.",
          toolMeta: null,
          createdAt: isoMinusMin(3.5),
        },
      ],
    };

    // Mock the chat messages endpoint to return our pre-built conversations.
    // The route is registered AFTER the general API rewrite interceptor,
    // so Playwright checks it first (LIFO order).
    const chatMsgUrl = `http://localhost:5173/api/invect/chat/messages/${flowId}`;

    // ── 16: Single user message ───────────────────────────────────────────
    await page.route(chatMsgUrl, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockMessages.turn1),
        });
      } else {
        await route.fallback();
      }
    });
    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const chatToggle3 = page.locator("button", { hasText: "Assistant" });
    if (await chatToggle3.isVisible().catch(() => false)) {
      await chatToggle3.click();
      await page.waitForTimeout(800);
    }
    await takeScreenshot(page, screensById["16-chat-user-message"]!, `/invect/flow/${flowId}`);
    await page.unroute(chatMsgUrl);

    // ── 17: Assistant reply with tool calls ────────────────────────────────
    await page.route(chatMsgUrl, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockMessages.turn1Reply),
        });
      } else {
        await route.fallback();
      }
    });
    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const chatToggle4 = page.locator("button", { hasText: "Assistant" });
    if (await chatToggle4.isVisible().catch(() => false)) {
      await chatToggle4.click();
      await page.waitForTimeout(800);
    }
    await takeScreenshot(page, screensById["17-chat-assistant-reply"]!, `/invect/flow/${flowId}`);

    // ── 18: Tool call expanded ────────────────────────────────────────────
    // Click on the first tool call CollapsibleTrigger to expand it
    // Tool labels are "get flow", "update flow" (underscores → spaces, CSS capitalize for display)
    const toolCallTrigger = page.locator("button").filter({ hasText: /get flow|update flow/i }).first();
    if (await toolCallTrigger.isVisible().catch(() => false)) {
      await toolCallTrigger.click();
      await page.waitForTimeout(400);
    }
    await takeScreenshot(page, screensById["18-chat-tool-expanded"]!, `/invect/flow/${flowId}`);
    await page.unroute(chatMsgUrl);

    // ── 19: Multi-turn conversation ───────────────────────────────────────
    await page.route(chatMsgUrl, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockMessages.multiTurn),
        });
      } else {
        await route.fallback();
      }
    });
    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const chatToggle5 = page.locator("button", { hasText: "Assistant" });
    if (await chatToggle5.isVisible().catch(() => false)) {
      await chatToggle5.click();
      await page.waitForTimeout(800);
    }
    await takeScreenshot(page, screensById["19-chat-multi-turn"]!, `/invect/flow/${flowId}`);
    await page.unroute(chatMsgUrl);

    // ── 20: Dashboard dark mode ───────────────────────────────────────────
    await page.goto(`${VITE_BASE}/invect`);
    await waitForDashboard(page);
    await enableDarkMode(page);
    await takeScreenshot(page, screensById["20-dashboard-dark"]!, "/invect");

    // ── 21: Editor dark mode ──────────────────────────────────────────────
    await page.goto(`${VITE_BASE}/invect/flow/${flowId}`);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await takeScreenshot(page, screensById["21-editor-dark"]!, `/invect/flow/${flowId}`);

    // Restore light mode
    await enableLightMode(page);

    // ── Agent Node & Tools Configuration ────────────────────────────────

    // ── 22: Agent node canvas — empty (no tools) ─────────────────────────
    const assistantFlowId = aiAssistantId ?? await getFlowIdByName(apiBase, request, "AI Assistant");
    if (assistantFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${assistantFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      await takeScreenshot(page, screensById["22-agent-node-canvas-empty"]!, `/invect/flow/${assistantFlowId}`);
    }

    // ── 23: Agent node canvas — with tools ───────────────────────────────
    const withToolsFlowId = agentWithToolsFlowId ?? await getFlowIdByName(apiBase, request, "Agent With Tools");
    if (withToolsFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${withToolsFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      await takeScreenshot(page, screensById["23-agent-node-canvas-with-tools"]!, `/invect/flow/${withToolsFlowId}`);
    }

    // ── 24: Agent config panel — empty state (bare agent node) ───────────
    const emptyAgentFlowId = agentEmptyFlowId ?? await getFlowIdByName(apiBase, request, "Empty Agent Flow");
    if (emptyAgentFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${emptyAgentFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      const emptyAgentNode = page.locator(".react-flow__node").filter({ hasText: /AI Agent/i });
      if (await emptyAgentNode.isVisible().catch(() => false)) {
        await emptyAgentNode.dblclick();
        await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await takeScreenshot(page, screensById["24-agent-config-panel-empty"]!, `/invect/flow/${emptyAgentFlowId}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 25: Agent config panel — seeded (Research Agent) ─────────────────
    if (assistantFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${assistantFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      const researchAgentNode = page.locator(".react-flow__node").filter({ hasText: /Research Agent/i });
      if (await researchAgentNode.isVisible().catch(() => false)) {
        await researchAgentNode.dblclick();
        await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await takeScreenshot(page, screensById["25-agent-config-panel-seeded"]!, `/invect/flow/${assistantFlowId}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // ── 26: Agent actions sidebar — empty (no tools added yet) ───────────
    // Click "Add Tools" on the agent node with no tools to open the actions sidebar
    if (assistantFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${assistantFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      // Click the "Add Tools" dashed button inside the AgentToolsBox
      const addToolsBtn = page.locator(".react-flow__node").filter({ hasText: /Research Agent/i })
        .getByText("Add Tools");
      if (await addToolsBtn.isVisible().catch(() => false)) {
        await addToolsBtn.click();
        await page.waitForTimeout(800);
      }
      await takeScreenshot(page, screensById["26-agent-actions-sidebar-empty"]!, `/invect/flow/${assistantFlowId}`);
    }

    // ── 27: Agent actions sidebar — seeded (tools already added) ─────────
    // Click "Configure" on the agent node that already has tools
    if (withToolsFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${withToolsFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      // Click the "Configure" button in the non-empty AgentToolsBox
      const configureBtn = page.locator(".react-flow__node").filter({ hasText: /Data Agent/i })
        .getByText("Configure");
      if (await configureBtn.isVisible().catch(() => false)) {
        await configureBtn.click();
        await page.waitForTimeout(800);
      }
      await takeScreenshot(page, screensById["27-agent-actions-sidebar-seeded"]!, `/invect/flow/${withToolsFlowId}`);
    }

    // ── 28: Tool config panel ─────────────────────────────────────────────
    // Click on a tool tile in the AgentToolsBox to open the ToolConfigPanel
    if (withToolsFlowId) {
      await page.goto(`${VITE_BASE}/invect/flow/${withToolsFlowId}`);
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      // Click the first tool tile (HTTP Request) in the AgentToolsBox
      const toolTile = page.locator(".react-flow__node").filter({ hasText: /Data Agent/i })
        .locator("[title='HTTP Request']").first();
      const fallbackTile = page.locator(".react-flow__node").filter({ hasText: /Data Agent/i })
        .locator("[title='Math Evaluate']").first();
      const tileToClick = await toolTile.isVisible().catch(() => false) ? toolTile : fallbackTile;
      if (await tileToClick.isVisible().catch(() => false)) {
        await tileToClick.click();
        await page.waitForTimeout(600);
      }
      await takeScreenshot(page, screensById["28-tool-config-panel"]!, `/invect/flow/${withToolsFlowId}`);
    }

  });

  test.afterAll(async () => {
    // Write metadata JSON
    const metadataPath = path.join(OUTPUT_DIR, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(capturedMetadata, null, 2));
    console.log(`\n✅ Captured ${capturedMetadata.length} screenshots → ${SCREENSHOTS_DIR}`);
    console.log(`📄 Metadata → ${metadataPath}`);
  });
});
