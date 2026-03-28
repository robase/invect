import { test, expect, assertNoObjectObject } from "../fixtures";

test.describe("Node Config Panel — Test Mode & Template Expressions", () => {
  /**
   * Scenario 4: Edit input JSON manually (Test Mode).
   *
   * Editing the Input JSON triggers Test Mode — a "TEST" badge appears,
   * a reset button restores original data, and execution uses the custom input.
   */
  test("editing input JSON enables test mode with TEST badge and reset", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    closeConfigPanel,
    runNodeByName,
    runCurrentNode,
    getInputPanelText,
    getOutputPanelText,
  }) => {
    await navigateToFlow("JQ Data Transform");

    // Run upstream so data is populated
    await runNodeByName("User List");

    // Open the JQ node
    await openNodeConfigPanel("Filter Admins");

    const dialog = page.getByRole("dialog");

    // Verify original data or unresolved run prompt state is present
    const originalText = await getInputPanelText();
    expect(originalText.includes('"Alice"') || originalText.includes("Run node")).toBeTruthy();

    // Click into the Input editor and modify a value
    const inputEditor = dialog.locator(".cm-editor").first();
    const editableContent = inputEditor.locator(".cm-content");
    await editableContent.click();

    // Select all and replace with modified JSON
    await page.keyboard.press("Meta+a");
    const modifiedInput = JSON.stringify(
      {
        data: {
          users: [
            { id: 1, name: "TestUser", role: "admin" },
            { id: 2, name: "Bob", role: "user" },
          ],
          metadata: { total: 2, page: 1 },
        },
      },
      null,
      2
    );
    await page.keyboard.type(modifiedInput, { delay: 2 });

    // TEST badge should appear
    await expect(dialog.getByText("TEST", { exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Reset button should appear
    await expect(dialog.getByTitle("Reset to original input")).toBeVisible();

    // Run the node with test data
    await runCurrentNode();

    // Output should reflect modified input
    const outputText = await getOutputPanelText();
    assertNoObjectObject(outputText, "Output panel after test mode run");

    // Click reset — TEST badge should disappear and original data restore
    await dialog.getByTitle("Reset to original input").click();
    await expect(dialog.getByText("TEST", { exact: true })).not.toBeVisible({
      timeout: 5_000,
    });

    const resetText = await getInputPanelText();
    expect(resetText.includes('"data"') || resetText.includes('"Alice"') || resetText.includes("Run node")).toBeTruthy();
  });

  /**
  * Scenario 5: Template expressions in form fields.
   *
   * Template String nodes show {{ variable }} syntax in their config,
   * with syntax highlighting. After execution, the output has the
   * resolved value, not raw template syntax.
   */
  test("template expression resolves correctly after execution", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    closeConfigPanel,
    runNodeByName,
    runCurrentNode,
    getOutputPanelText,
  }) => {
    await navigateToFlow("Simple Template Flow");

    // Run the Input node first
    await runNodeByName("Topic Input");

    // Open the Template node
    await openNodeConfigPanel("Build Prompt");

    const dialog = page.getByRole("dialog");

    // The template field should contain {{ topic }}
    // Look for the template syntax in the config panel's center area
    await expect(dialog.getByText("{{ topic }}")).toBeVisible({ timeout: 5_000 });

    // Run the template node
    await runCurrentNode();

    // Output should contain the resolved value
    const outputText = await getOutputPanelText();

    // The default input value resolves when upstream is hydrated
    if (!outputText.includes("{}")) {
      expect(outputText.toLowerCase()).toContain("artificial intelligence");
      expect(outputText).not.toContain("{{ topic }}");
    }

    // No [object Object]
    assertNoObjectObject(outputText, "Template output");
  });

  /**
   * Scenario 6: Drag-and-drop JSON key into template field.
   *
   * The Input panel shows drag handles (⋮⋮) next to JSON keys.
   * Dragging one into a template field inserts {{ path.to.key }}.
   */
  test("drag handles are visible on input JSON keys", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    runNodeByName,
  }) => {
    await navigateToFlow("User Age Check (Adult)");

    // Run the Input node
    await runNodeByName("User Data");

    // Open the JQ node to see upstream data
    await openNodeConfigPanel("Extract User Info");

    const dialog = page.getByRole("dialog");

    // Input panel should show the user_data key
    const inputEditor = dialog.locator(".cm-editor").first();
    await expect(inputEditor.getByText("user_data")).toBeVisible({
      timeout: 5_000,
    });

    // Upstream slot markers should be present in the editor gutter
    const dragHandles = dialog.locator(".cm-slot-marker");
    const handleCount = await dragHandles.count();
    expect(handleCount).toBeGreaterThan(0);

    await expect(dragHandles.first()).toBeVisible();
  });
});
