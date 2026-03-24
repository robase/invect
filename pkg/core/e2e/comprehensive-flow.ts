/**
 * E2E Test: Comprehensive Multi-Stage Flow
 * 
 * This flow tests ALL node types with complex, realistic logic:
 * 
 * Flow structure:
 * 
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │                                                                     │
 *   │  Input (user_request)                                               │
 *   │       ↓                                                             │
 *   │  HTTP Request (fetch user profile from API)                         │
 *   │       ↓                                                             │
 *   │  JQ (extract user data + determine tier)                            │
 *   │       ↓                                                             │
 *   │  If-Else (premium user?)                                            │
 *   │     ↓ True                    ↓ False                               │
 *   │  Template (premium prompt)    Template (basic prompt)               │
 *   │     ↓                              ↓                                │
 *   │  Model (detailed analysis)   Model (brief summary)                  │
 *   │     ↓                              ↓                                │
 *   │  JQ (format premium)         JQ (format basic)                      │
 *   │     └──────────┬───────────────────┘                                │
 *   │                ↓                                                    │
 *   │  Template (combine results)                                         │
 *   │       ↓                                                             │
 *   │  Model (final polish/review)                                        │
 *   │       ↓                                                             │
 *   │  Output (final result)                                              │
 *   │                                                                     │
 *   └─────────────────────────────────────────────────────────────────────┘
 * 
 * Tests:
 * - INPUT: User request with topic and user_id
 * - HTTP_REQUEST: Fetch user data (mocked via httpbin.org)
 * - JQ: Transform API response, extract fields, compute derived values
 * - IF_ELSE: Branch based on user tier (premium vs basic)
 * - TEMPLATE_STRING: Build prompts dynamically with data from multiple sources
 * - MODEL: Multiple LLM calls with different prompts/parameters
 * - OUTPUT: Collect final structured result
 * 
 * This demonstrates:
 * - Multiple LLM calls in sequence
 * - Conditional branching with different LLM behaviors per branch
 * - Data transformation between nodes
 * - Merging data from parallel branches
 * - Complex template interpolation
 */
import { strict as assert } from "node:assert";
import {
  FlowRunStatus,
  type InvectDefinition,
  type NodeOutput,
  type Invect,
} from "../src";
import type { FlowExample } from "./example-types";

/**
 * Ensure we have an AI credential for Model nodes.
 */
async function ensureAICredential(invect: Invect): Promise<{ id: string; name: string; isOpenAI: boolean }> {
  const credentialsService = invect.getCredentialsService();

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  if (!openaiKey && !anthropicKey) {
    throw new Error(
      "No AI API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable."
    );
  }

  const isOpenAI = !!openaiKey;
  const apiKey = openaiKey || anthropicKey!;
  const providerName = isOpenAI ? "openai" : "anthropic";

  const created = await credentialsService.create({
    name: `E2E Comprehensive ${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Credential`,
    type: "http-api",
    authType: "bearer",
    config: {
      token: apiKey,
      provider: providerName,
    },
    description: `AI credential for comprehensive E2E testing (${providerName})`,
  });

  return { id: created.id, name: created.name, isOpenAI };
}

/**
 * Build the comprehensive flow definition
 * 
 * @param credentialId - AI credential for Model nodes
 * @param isOpenAI - Whether using OpenAI (vs Anthropic)
 * @param isPremiumUser - Whether to simulate a premium user (affects branching)
 */
function buildComprehensiveFlowDefinition(
  credentialId: string,
  isOpenAI: boolean,
  isPremiumUser: boolean
): InvectDefinition {
  const modelName = isOpenAI ? "gpt-4o-mini" : "claude-3-haiku-20240307";
  
  // Simulate user data that would come from an API
  // We use httpbin.org to echo back JSON we send it
  const mockUserData = {
    userId: isPremiumUser ? "user_premium_123" : "user_basic_456",
    name: isPremiumUser ? "Alice Premium" : "Bob Basic",
    tier: isPremiumUser ? "premium" : "basic",
    credits: isPremiumUser ? 1000 : 10,
    preferences: {
      language: "en",
      detailLevel: isPremiumUser ? "comprehensive" : "brief",
    },
  };

  return {
    nodes: [
      // =========================================
      // STAGE 1: Input Collection
      // =========================================
      {
        id: "input-request",
        type: "core.input",
        label: "User Request",
        referenceId: "user_request",
        params: {
          variableName: "request",
          defaultValue: JSON.stringify({
            topic: "artificial intelligence in healthcare",
            analysisType: "trends",
          }),
        },
        position: { x: 100, y: 300 },
      },

      // =========================================
      // STAGE 2: Fetch User Profile via HTTP
      // =========================================
      // Using httpbin.org/post to simulate an API that returns user data
      // In a real scenario, this would hit your user service
      {
        id: "http-fetch-user",
        type: "http.request",
        label: "Fetch User Profile",
        referenceId: "user_profile_response",
        params: {
          method: "POST",
          // httpbin.org/post echoes back JSON we send
          url: "https://httpbin.org/post",
          body: JSON.stringify(mockUserData),
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": "e2e-test-comprehensive",
          },
        },
        position: { x: 300, y: 300 },
      },

      // =========================================
      // STAGE 3: Extract & Transform User Data
      // =========================================
      // JQ parses the httpbin response and extracts user info
      // httpbin.org/post returns: { json: <our data>, headers: {...}, ... }
      // The HTTP node wraps this in: { data: <httpbin response>, status: 200, headers: {...}, ok: true }
      {
        id: "jq-extract-user",
        type: "core.jq",
        label: "Extract User Data",
        referenceId: "user_data",
        params: {
          // .user_profile_response is the HTTP node's output (incoming data key from referenceId)
          // .data is the response body (httpbin's JSON response)
          // .json is where httpbin echoes back the posted JSON body
          query: `.user_profile_response.data.json | {
            userId: .userId,
            name: .name,
            tier: .tier,
            credits: .credits,
            isPremium: (.tier == "premium"),
            detailLevel: .preferences.detailLevel
          }`,
        },
        position: { x: 500, y: 300 },
      },

      // =========================================
      // STAGE 4: Branch on User Tier
      // =========================================
      {
        id: "if-premium",
        type: "core.if_else",
        label: "Is Premium User?",
        referenceId: "tier_check",
        params: {
          // JSON Logic: check if user is premium
          condition: { "==": [{ "var": "user_data.isPremium" }, true] },
        },
        position: { x: 700, y: 300 },
      },

      // =========================================
      // STAGE 5A: Premium Branch - Detailed Analysis
      // =========================================
      {
        id: "template-premium-prompt",
        type: "core.template_string",
        label: "Premium Prompt",
        referenceId: "premium_prompt",
        params: {
          template: `You are providing a PREMIUM analysis for {{ tier_check.user_data.name }}.

Topic: {{ user_request.topic }}
Analysis Type: {{ user_request.analysisType }}
Detail Level: {{ tier_check.user_data.detailLevel }}

Please provide a comprehensive analysis including:
1. Executive Summary
2. Current State Analysis
3. Key Trends and Developments
4. Future Predictions
5. Recommendations

Be thorough and detailed - this is for a premium subscriber with {{ tier_check.user_data.credits }} credits.`,
        },
        position: { x: 900, y: 150 },
      },
      
      {
        id: "model-premium-analysis",
        type: "core.model",
        label: "Premium AI Analysis",
        referenceId: "premium_analysis",
        params: {
          credentialId: credentialId,
          model: modelName,
          prompt: "{{ premium_prompt }}",
          systemPrompt: "You are an expert analyst providing premium-tier, comprehensive research reports. Be detailed and thorough.",
          temperature: 0.7,
          maxTokens: 800,
        },
        position: { x: 1100, y: 150 },
      },

      {
        id: "jq-format-premium",
        type: "core.jq",
        label: "Format Premium Result",
        referenceId: "formatted_premium",
        params: {
          query: `{
            tier: "premium",
            userName: .tier_check.user_data.name,
            analysis: .premium_analysis,
            wordCount: (.premium_analysis | tostring | split(" ") | length),
            quality: "comprehensive"
          }`,
        },
        position: { x: 1300, y: 150 },
      },

      // =========================================
      // STAGE 5B: Basic Branch - Brief Summary
      // =========================================
      {
        id: "template-basic-prompt",
        type: "core.template_string",
        label: "Basic Prompt",
        referenceId: "basic_prompt",
        params: {
          template: `Provide a brief summary for {{ tier_check.user_data.name }}.

Topic: {{ user_request.topic }}

Give a concise 2-3 sentence overview. Keep it simple - this user has limited credits ({{ tier_check.user_data.credits }}).`,
        },
        position: { x: 900, y: 450 },
      },

      {
        id: "model-basic-summary",
        type: "core.model",
        label: "Basic AI Summary",
        referenceId: "basic_summary",
        params: {
          credentialId: credentialId,
          model: modelName,
          prompt: "{{ basic_prompt }}",
          systemPrompt: "You are a helpful assistant providing brief, easy-to-understand summaries. Be concise.",
          temperature: 0.5,
          maxTokens: 200,
        },
        position: { x: 1100, y: 450 },
      },

      {
        id: "jq-format-basic",
        type: "core.jq",
        label: "Format Basic Result",
        referenceId: "formatted_basic",
        params: {
          query: `{
            tier: "basic",
            userName: .tier_check.user_data.name,
            analysis: .basic_summary,
            wordCount: (.basic_summary | tostring | split(" ") | length),
            quality: "brief"
          }`,
        },
        position: { x: 1300, y: 450 },
      },

      // =========================================
      // STAGE 6: Merge & Final Processing
      // =========================================
      // This template receives data from whichever branch executed
      {
        id: "template-final-combine",
        type: "core.template_string",
        label: "Combine Results",
        referenceId: "combined_result",
        params: {
          // Use conditional to get data from whichever branch ran
          template: `{% if formatted_premium %}
PREMIUM REPORT
==============
User: {{ formatted_premium.userName }}
Quality: {{ formatted_premium.quality }}
Word Count: {{ formatted_premium.wordCount }}

{{ formatted_premium.analysis }}
{% elif formatted_basic %}
BASIC SUMMARY
=============
User: {{ formatted_basic.userName }}
Quality: {{ formatted_basic.quality }}
Word Count: {{ formatted_basic.wordCount }}

{{ formatted_basic.analysis }}
{% endif %}

---
Generated by Invect E2E Test`,
        },
        position: { x: 1500, y: 300 },
      },

      // =========================================
      // STAGE 7: Final Polish with Second LLM Call
      // =========================================
      {
        id: "model-final-polish",
        type: "core.model",
        label: "Final Polish",
        referenceId: "polished_result",
        params: {
          credentialId: credentialId,
          model: modelName,
          prompt: `Review and add a brief closing thought to this report. Keep the original content but add a 1-2 sentence professional closing:

{{ combined_result }}`,
          systemPrompt: "You are an editor adding a professional touch to reports. Add a brief, insightful closing thought.",
          temperature: 0.6,
          maxTokens: 400,
        },
        position: { x: 1700, y: 300 },
      },

      // =========================================
      // STAGE 8: Final Output
      // =========================================
      {
        id: "output-final",
        type: "core.output",
        label: "Final Report",
        referenceId: "final_report",
        params: {
          outputValue: "{{ polished_result }}",
          outputName: "report",
        },
        position: { x: 1900, y: 300 },
      },
    ],
    edges: [
      // Input → HTTP
      {
        id: "edge-input-to-http",
        source: "input-request",
        target: "http-fetch-user",
      },
      // HTTP → JQ Extract
      {
        id: "edge-http-to-jq",
        source: "http-fetch-user",
        target: "jq-extract-user",
      },
      // JQ Extract → If-Else
      {
        id: "edge-jq-to-ifelse",
        source: "jq-extract-user",
        target: "if-premium",
      },
      
      // === Premium Branch ===
      // If-Else (True) → Premium Template
      {
        id: "edge-ifelse-to-premium-template",
        source: "if-premium",
        target: "template-premium-prompt",
        sourceHandle: "true_output",
      },
      // Premium Template → Premium Model
      {
        id: "edge-premium-template-to-model",
        source: "template-premium-prompt",
        target: "model-premium-analysis",
      },
      // Premium Model → Premium JQ Format
      {
        id: "edge-premium-model-to-jq",
        source: "model-premium-analysis",
        target: "jq-format-premium",
      },
      // Premium JQ → Final Combine
      {
        id: "edge-premium-jq-to-combine",
        source: "jq-format-premium",
        target: "template-final-combine",
      },

      // === Basic Branch ===
      // If-Else (False) → Basic Template
      {
        id: "edge-ifelse-to-basic-template",
        source: "if-premium",
        target: "template-basic-prompt",
        sourceHandle: "false_output",
      },
      // Basic Template → Basic Model
      {
        id: "edge-basic-template-to-model",
        source: "template-basic-prompt",
        target: "model-basic-summary",
      },
      // Basic Model → Basic JQ Format
      {
        id: "edge-basic-model-to-jq",
        source: "model-basic-summary",
        target: "jq-format-basic",
      },
      // Basic JQ → Final Combine
      {
        id: "edge-basic-jq-to-combine",
        source: "jq-format-basic",
        target: "template-final-combine",
      },

      // === Final Stage ===
      // Final Combine → Final Polish
      {
        id: "edge-combine-to-polish",
        source: "template-final-combine",
        target: "model-final-polish",
      },
      // Final Polish → Output
      {
        id: "edge-polish-to-output",
        source: "model-final-polish",
        target: "output-final",
      },
    ],
    metadata: {
      name: "Comprehensive Multi-Stage Flow",
      description: "Tests all node types with complex branching, multiple LLM calls, and data transformation",
      created: new Date().toISOString(),
    },
  };
}

// =========================================
// Test Case 1: Premium User Path
// =========================================
export const comprehensiveFlowPremiumExample: FlowExample = {
  name: "Comprehensive Flow (Premium User)",
  description: "Full flow with HTTP→JQ→If-Else→Model(x2)→Output, testing premium user branch.",
  
  async execute(invect) {
    const credential = await ensureAICredential(invect);
    console.log(`  📝 Using credential: ${credential.name}`);
    console.log(`  🤖 Provider: ${credential.isOpenAI ? "OpenAI" : "Anthropic"}`);

    const flow = await invect.createFlow({
      name: `e2e-comprehensive-premium-${Date.now()}`,
    });
    console.log(`  📁 Created flow: ${flow.name} (${flow.id})`);

    const flowDefinition = buildComprehensiveFlowDefinition(
      credential.id,
      credential.isOpenAI,
      true // Premium user
    );
    await invect.createFlowVersion(flow.id, {
      invectDefinition: flowDefinition,
    });
    console.log(`  💾 Saved flow version with ${flowDefinition.nodes.length} nodes, ${flowDefinition.edges.length} edges`);

    console.log(`  🚀 Executing comprehensive flow (premium path)...`);
    console.log(`  ⏳ This involves HTTP request + 2 LLM calls, may take 30-60 seconds...`);
    
    const result = await invect.startFlowRun(flow.id, {}, { useBatchProcessing: false });
    console.log(`  ✅ Flow completed with status: ${result.status}`);

    return result;
  },

  expected(result) {
    // Verify flow succeeded
    assert.equal(
      result.status,
      FlowRunStatus.SUCCESS,
      `Flow should succeed, got: ${result.status}${result.error ? ` - ${result.error}` : ""}`
    );

    // Verify INPUT node
    const inputNode = result.outputs?.["input-request"] as NodeOutput | undefined;
    assert(inputNode, "Input node should have executed");
    console.log(`  ✓ Input node executed`);

    // Verify HTTP_REQUEST node
    const httpNode = result.outputs?.["http-fetch-user"] as NodeOutput | undefined;
    assert(httpNode, "HTTP node should have executed");
    const httpVars = httpNode.data.variables as Record<string, { value?: { status?: number; ok?: boolean } }>;
    const httpOutput = httpVars.output?.value;
    assert(httpOutput?.ok === true, `HTTP request should succeed, got ok: ${httpOutput?.ok}`);
    console.log(`  ✓ HTTP request executed (status: ${httpOutput?.status})`);

    // Verify JQ Extract node
    const jqExtractNode = result.outputs?.["jq-extract-user"] as NodeOutput | undefined;
    assert(jqExtractNode, "JQ extract node should have executed");
    console.log(`  ✓ JQ extract node executed`);

    // Verify If-Else took the premium (true) branch
    const ifElseNode = result.outputs?.["if-premium"] as NodeOutput | undefined;
    assert(ifElseNode, "If-Else node should have executed");
    const ifElseVars = ifElseNode.data.variables as Record<string, { value?: unknown }>;
    const trueBranchTaken = ifElseVars.true_output?.value !== undefined;
    assert(trueBranchTaken, "If-Else should take TRUE (premium) branch");
    console.log(`  ✓ If-Else branched to premium path`);

    // Verify Premium branch nodes executed
    const premiumTemplateNode = result.outputs?.["template-premium-prompt"] as NodeOutput | undefined;
    assert(premiumTemplateNode, "Premium template should have executed");
    console.log(`  ✓ Premium template executed`);

    const premiumModelNode = result.outputs?.["model-premium-analysis"] as NodeOutput | undefined;
    assert(premiumModelNode, "Premium model should have executed");
    const premiumModelVars = premiumModelNode.data.variables as Record<string, { value?: unknown }>;
    const premiumAnalysis = premiumModelVars.output?.value as string;
    assert(premiumAnalysis && premiumAnalysis.length > 50, "Premium analysis should be substantial");
    console.log(`  ✓ Premium model executed (${premiumAnalysis.length} chars)`);

    const premiumJqNode = result.outputs?.["jq-format-premium"] as NodeOutput | undefined;
    assert(premiumJqNode, "Premium JQ format should have executed");
    console.log(`  ✓ Premium JQ format executed`);

    // Verify Basic branch did NOT execute
    const basicModelNode = result.outputs?.["model-basic-summary"] as NodeOutput | undefined;
    if (basicModelNode) {
      const basicVars = basicModelNode.data.variables as Record<string, { value?: unknown }>;
      assert(!basicVars.output?.value, "Basic model should NOT have executed for premium user");
    }
    console.log(`  ✓ Basic branch correctly skipped`);

    // Verify Final stages
    const combineNode = result.outputs?.["template-final-combine"] as NodeOutput | undefined;
    assert(combineNode, "Combine template should have executed");
    console.log(`  ✓ Final combine template executed`);

    const polishNode = result.outputs?.["model-final-polish"] as NodeOutput | undefined;
    assert(polishNode, "Final polish model should have executed");
    const polishVars = polishNode.data.variables as Record<string, { value?: unknown }>;
    const polishedResult = polishVars.output?.value as string;
    assert(polishedResult && polishedResult.length > 50, "Polished result should have content");
    console.log(`  ✓ Final polish model executed (${polishedResult.length} chars)`);

    // Verify OUTPUT node
    const outputNode = result.outputs?.["output-final"] as NodeOutput | undefined;
    assert(outputNode, "Output node should have executed");
    const outputVars = outputNode.data.variables as Record<string, { value?: unknown }>;
    const finalReport = outputVars.report?.value || outputVars.output?.value;
    assert(finalReport, "Final report should have content");
    console.log(`  ✓ Output node executed`);

    // Preview the final result
    const preview = String(finalReport).substring(0, 200);
    console.log(`\n  📄 Final Report Preview:\n  "${preview}..."`);
  },
};

// =========================================
// Test Case 2: Basic User Path
// =========================================
export const comprehensiveFlowBasicExample: FlowExample = {
  name: "Comprehensive Flow (Basic User)",
  description: "Full flow with HTTP→JQ→If-Else→Model(x2)→Output, testing basic user branch.",
  
  async execute(invect) {
    const credential = await ensureAICredential(invect);
    console.log(`  📝 Using credential: ${credential.name}`);
    console.log(`  🤖 Provider: ${credential.isOpenAI ? "OpenAI" : "Anthropic"}`);

    const flow = await invect.createFlow({
      name: `e2e-comprehensive-basic-${Date.now()}`,
    });
    console.log(`  📁 Created flow: ${flow.name} (${flow.id})`);

    const flowDefinition = buildComprehensiveFlowDefinition(
      credential.id,
      credential.isOpenAI,
      false // Basic user
    );
    await invect.createFlowVersion(flow.id, {
      invectDefinition: flowDefinition,
    });
    console.log(`  💾 Saved flow version with ${flowDefinition.nodes.length} nodes, ${flowDefinition.edges.length} edges`);

    console.log(`  🚀 Executing comprehensive flow (basic path)...`);
    console.log(`  ⏳ This involves HTTP request + 2 LLM calls, may take 20-40 seconds...`);
    
    const result = await invect.startFlowRun(flow.id, {}, { useBatchProcessing: false });
    console.log(`  ✅ Flow completed with status: ${result.status}`);

    return result;
  },

  expected(result) {
    // Verify flow succeeded
    assert.equal(
      result.status,
      FlowRunStatus.SUCCESS,
      `Flow should succeed, got: ${result.status}${result.error ? ` - ${result.error}` : ""}`
    );

    // Verify INPUT node
    const inputNode = result.outputs?.["input-request"] as NodeOutput | undefined;
    assert(inputNode, "Input node should have executed");
    console.log(`  ✓ Input node executed`);

    // Verify HTTP_REQUEST node
    const httpNode = result.outputs?.["http-fetch-user"] as NodeOutput | undefined;
    assert(httpNode, "HTTP node should have executed");
    console.log(`  ✓ HTTP request executed`);

    // Verify JQ Extract node
    const jqExtractNode = result.outputs?.["jq-extract-user"] as NodeOutput | undefined;
    assert(jqExtractNode, "JQ extract node should have executed");
    console.log(`  ✓ JQ extract node executed`);

    // Verify If-Else took the basic (false) branch
    const ifElseNode = result.outputs?.["if-premium"] as NodeOutput | undefined;
    assert(ifElseNode, "If-Else node should have executed");
    const ifElseVars = ifElseNode.data.variables as Record<string, { value?: unknown }>;
    const falseBranchTaken = ifElseVars.false_output?.value !== undefined;
    assert(falseBranchTaken, "If-Else should take FALSE (basic) branch");
    console.log(`  ✓ If-Else branched to basic path`);

    // Verify Basic branch nodes executed
    const basicTemplateNode = result.outputs?.["template-basic-prompt"] as NodeOutput | undefined;
    assert(basicTemplateNode, "Basic template should have executed");
    console.log(`  ✓ Basic template executed`);

    const basicModelNode = result.outputs?.["model-basic-summary"] as NodeOutput | undefined;
    assert(basicModelNode, "Basic model should have executed");
    const basicModelVars = basicModelNode.data.variables as Record<string, { value?: unknown }>;
    const basicSummary = basicModelVars.output?.value as string;
    assert(basicSummary && basicSummary.length > 20, "Basic summary should have content");
    console.log(`  ✓ Basic model executed (${basicSummary.length} chars)`);

    const basicJqNode = result.outputs?.["jq-format-basic"] as NodeOutput | undefined;
    assert(basicJqNode, "Basic JQ format should have executed");
    console.log(`  ✓ Basic JQ format executed`);

    // Verify Premium branch did NOT execute
    const premiumModelNode = result.outputs?.["model-premium-analysis"] as NodeOutput | undefined;
    if (premiumModelNode) {
      const premiumVars = premiumModelNode.data.variables as Record<string, { value?: unknown }>;
      assert(!premiumVars.output?.value, "Premium model should NOT have executed for basic user");
    }
    console.log(`  ✓ Premium branch correctly skipped`);

    // Verify Final stages
    const combineNode = result.outputs?.["template-final-combine"] as NodeOutput | undefined;
    assert(combineNode, "Combine template should have executed");
    console.log(`  ✓ Final combine template executed`);

    const polishNode = result.outputs?.["model-final-polish"] as NodeOutput | undefined;
    assert(polishNode, "Final polish model should have executed");
    console.log(`  ✓ Final polish model executed`);

    // Verify OUTPUT node
    const outputNode = result.outputs?.["output-final"] as NodeOutput | undefined;
    assert(outputNode, "Output node should have executed");
    const outputVars = outputNode.data.variables as Record<string, { value?: unknown }>;
    const finalReport = outputVars.report?.value || outputVars.output?.value;
    assert(finalReport, "Final report should have content");
    console.log(`  ✓ Output node executed`);

    // Verify basic report characteristics
    const reportStr = String(finalReport);
    assert(
      reportStr.includes("BASIC") || reportStr.includes("basic") || reportStr.length < 2000,
      "Basic report should be brief or clearly marked as basic"
    );

    const preview = reportStr.substring(0, 200);
    console.log(`\n  📄 Final Report Preview:\n  "${preview}..."`);
  },
};
