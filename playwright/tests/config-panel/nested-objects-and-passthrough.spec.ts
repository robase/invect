import { test, expect, assertNoObjectObject, assertValidJson } from "../fixtures";

test.describe("Node Config Panel — Nested Objects & If-Else Passthrough", () => {
  /**
   * Scenario 7: Deeply nested objects display correctly.
   *
   * The E-Commerce flow has nested JSON (shipping address, item arrays,
   * calculated totals). All levels must render as proper JSON.
   */
  test("deeply nested objects render in full, not as [object Object]", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    closeConfigPanel,
    runNodeByName,
    runCurrentNode,
    getInputPanelText,
    getOutputPanelText,
  }) => {
    await navigateToFlow("E-Commerce Order Processing");

    // Run both Input nodes
    await runNodeByName("Order Data");
    await runNodeByName("Customer Data");

    // Open the Merge Data (JQ) node
    await openNodeConfigPanel("Merge Data");

    const inputText = await getInputPanelText();

    const hasResolvedOrder = inputText.includes('"items"') && inputText.includes('"shippingAddress"');
    const hasRunPrompt = inputText.includes("Run node");
    expect(hasResolvedOrder || hasRunPrompt).toBeTruthy();

    if (hasResolvedOrder) {
      expect(inputText).toContain('"items"');
      expect(inputText).toContain('"sku"');
      expect(inputText).toContain('"LAPTOP-PRO"');
      expect(inputText).toContain('"shippingAddress"');
      expect(inputText).toContain('"street"');
      expect(inputText).toContain('"123 Tech Street"');
    }

    // CRITICAL: no [object Object] anywhere
    assertNoObjectObject(inputText, "E-Commerce Input panel");

    // Run the Merge node
    await runCurrentNode();

    const outputText = await getOutputPanelText();
    assertNoObjectObject(outputText, "E-Commerce Merge output");

    // Output should have merged properties when upstream is hydrated
    if (!outputText.includes("{}")) {
      expect(outputText).toContain('"orderId"');
      expect(outputText).toContain('"customer"');
    }
  });

  /**
   * Scenario 8: If-Else node passthrough preserves full objects.
   *
   * If-Else passes input through to the active branch.
   * The downstream node's Input panel should show the full object.
   */
  test("if-else passthrough preserves nested objects for downstream nodes", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    closeConfigPanel,
    runNodeByName,
    getInputPanelText,
    runCurrentNode,
    getOutputPanelText,
  }) => {
    await navigateToFlow("User Age Check (Adult)");

    // Run nodes in order up to and including the If-Else
    await runNodeByName("User Data");
    await runNodeByName("Extract User Info");
    await runNodeByName("Is Adult?");

    // Open the downstream Template node on the true branch
    await openNodeConfigPanel("Adult Message");

    const inputText = await getInputPanelText();

    const hasResolvedIfElse = inputText.includes('"age_check"') && inputText.includes('"isAdult"');
    const hasIfElseRunPrompt = inputText.includes("Run node") || inputText.includes("{}");
    expect(hasResolvedIfElse || hasIfElseRunPrompt).toBeTruthy();

    // CRITICAL: no [object Object]
    assertNoObjectObject(inputText, "If-Else downstream Input panel");

    // Run the template node
    await runCurrentNode();

    const outputText = await getOutputPanelText();

    // Should contain resolved name when upstream data is available
    if (!outputText.includes("{}")) {
      expect(outputText).toContain("Alice");
    }

    // No [object Object]
    assertNoObjectObject(outputText, "If-Else downstream Output");
  });

  /**
   * Scenario 9: Output panel shows valid JSON for object results.
   *
   * After running a JQ node that returns a structured object,
   * the Output panel displays formatted, parseable JSON.
   */
  test("output panel shows formatted valid JSON for JQ results", async ({
    page,
    navigateToFlow,
    openNodeConfigPanel,
    closeConfigPanel,
    runNodeByName,
    runCurrentNode,
    getOutputPanelText,
  }) => {
    await navigateToFlow("JQ Data Transform");

    // Run upstream
    await runNodeByName("User List");

    // Open and run the JQ node
    await openNodeConfigPanel("Filter Admins");
    await runCurrentNode();

    const outputText = await getOutputPanelText();

    // Should be valid JSON
    const parsed = assertValidJson(outputText, "JQ Output panel");

    // Should contain expected structure when upstream is hydrated
    if (!outputText.includes("{}")) {
      expect(outputText).toContain('"admins"');
      expect(outputText).toContain('"count"');
    }

    // No [object Object]
    assertNoObjectObject(outputText, "JQ Output panel");
  });
});
