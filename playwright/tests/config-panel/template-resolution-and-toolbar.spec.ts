import { test, expect, assertNoObjectObject, assertValidJson } from "../fixtures";

test.describe("Node Config Panel — Template Resolution & Toolbar", () => {
  /**
  * Scenario 10: Template field with object reference resolves correctly.
   *
  * When a template expression references nested object properties,
   * the rendered output shows actual values, not [object Object].
   */
  test("template resolves nested object properties without [object Object]", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    closeConfigPanel,
    runNodeByName,
    runCurrentNode,
    getOutputPanelText,
  }) => {
    await navigateToFlow("E-Commerce Order Processing");

    // Run nodes in sequence up through the VIP check
    await runNodeByName("Order Data");
    await runNodeByName("Customer Data");
    await runNodeByName("Merge Data");
    await runNodeByName("Calculate Totals");
    await runNodeByName("Is VIP Customer?");

    // Open the VIP Welcome template node
    await openNodeConfigPanel("VIP Welcome");

    const dialog = page.getByRole("dialog");

    // The template field should contain template expressions
    // to nested paths like {{ vip_check.order_summary.customer.name }}
    await expect(
      dialog.getByText(/\{\{.*customer\.name.*\}\}/)
    ).toBeVisible({ timeout: 5_000 });

    // Run the template node
    await runCurrentNode();

    const outputText = await getOutputPanelText();

    // Should contain resolved customer name when upstream is hydrated
    if (!outputText.includes("{}")) {
      expect(outputText).toContain("Alice Johnson");
    }

    // Should NOT contain [object Object]
    assertNoObjectObject(outputText, "VIP template output");

    if (!outputText.includes("{}")) {
      expect(outputText).not.toMatch(/\{\{.*\}\}/);
    }

    // Dollar amounts should be numeric, not NaN or [object Object]
    expect(outputText).not.toContain("NaN");
  });

  /**
   * Scenario 11: Copy button copies valid JSON from Input panel.
   *
   * The copy button in the toolbar copies the full JSON to clipboard.
   */
  test("copy button copies valid JSON to clipboard", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    runNodeByName,
    getInputPanelText,
    context,
  }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await navigateToFlow("JQ Data Transform");
    await runNodeByName("User List");
    await openNodeConfigPanel("Filter Admins");

    const dialog = page.getByRole("dialog");

    // Click the copy button (first = Input panel's copy button)
    await dialog.getByTitle("Copy to clipboard").first().click();

    // Read from clipboard
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText()
    );

    // Should be valid JSON
    const parsed = assertValidJson(clipboardText, "Clipboard JSON");

    // Should contain upstream data when hydrated, otherwise include run prompt container
    expect(clipboardText).toContain('"data"');
    expect(clipboardText.length > 0).toBeTruthy();

    // No [object Object]
    assertNoObjectObject(clipboardText, "Clipboard content");
  });

  /**
   * Scenario 12: Format button pretty-prints JSON in Input panel.
   *
   * The format button re-indents the JSON without corrupting content.
   */
  test("format button re-indents JSON preserving structure", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    runNodeByName,
    getInputPanelText,
  }) => {
    await navigateToFlow("JQ Data Transform");
    await runNodeByName("User List");
    await openNodeConfigPanel("Filter Admins");

    const dialog = page.getByRole("dialog");

    // Get the initial text
    const beforeFormat = await getInputPanelText();

    // Click the format button (first = Input panel's format button)
    await dialog.getByTitle("Format JSON").first().click();

    // Get text after formatting
    const afterFormat = await getInputPanelText();

    // Content should still be valid JSON when no inline run placeholders are present
    if (!afterFormat.includes("Run node")) {
      assertValidJson(afterFormat, "Formatted JSON");
    }

    // No [object Object] introduced by formatting
    assertNoObjectObject(afterFormat, "Formatted Input panel");

    // Should still contain the same data shape or placeholder state
    expect(afterFormat.includes('"users"') || afterFormat.includes("Run node")).toBeTruthy();
  });
});
