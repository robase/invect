/**
 * E2E Test: Input → Template String → Model Flow
 * 
 * Simulates a user building a simple flow:
 * 1. Input node that takes a "topic" variable
 * 2. Template String node that creates a prompt using the topic
 * 3. Model node that generates a response using the prompt
 */
import { strict as assert } from "node:assert";
import {
  FlowRunStatus,
  type InvectDefinition,
  type NodeOutput,
} from "../../src";
import type { InvectInstance } from "../../src/api/types";
import type { FlowExample } from "./example-types";

/**
 * Ensure we have an OpenAI or Anthropic credential for the Model node.
 * Creates a credential with proper provider metadata for detection.
 */
async function ensureAICredential(invect: InvectInstance): Promise<{ id: string; name: string; isOpenAI: boolean }> {
  

  // Check for API keys in environment
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  if (!openaiKey && !anthropicKey) {
    throw new Error(
      "No AI API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable."
    );
  }

  // Determine provider and key
  const isOpenAI = !!openaiKey;
  const apiKey = openaiKey || anthropicKey!;
  const providerName = isOpenAI ? "openai" : "anthropic";

  // Create credential with provider metadata for detection
  const created = await invect.credentials.create({
    name: `E2E ${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Credential`,
    type: "http-api",
    authType: "bearer",
    config: {
      token: apiKey,
      provider: providerName, // This enables provider detection
    },
    description: `AI credential for E2E testing (${providerName})`,
  });

  return { id: created.id, name: created.name, isOpenAI };
}

/**
 * Build the flow definition for: Input → Template String → Model
 */
function buildFlowDefinition(credentialId: string, isOpenAI: boolean): InvectDefinition {
  return {
    nodes: [
      // INPUT NODE: Takes a "topic" variable from flow inputs
      {
        id: "input-topic",
        type: "core.input",
        label: "Topic Input",
        referenceId: "topic_input",
        params: {
          variableName: "topic",
          defaultValue: "the history of computers",
        },
        position: { x: 100, y: 200 },
      },
      // TEMPLATE STRING NODE: Creates a prompt using the topic
      {
        id: "template-prompt",
        type: "core.template_string",
        label: "Prompt Builder",
        referenceId: "prompt_builder",
        params: {
          template: "Write a short, 2-sentence summary about: {{ topic_input }}",
        },
        position: { x: 400, y: 200 },
      },
      // MODEL NODE: Generates response using the prompt
      {
        id: "model-generate",
        type: "core.model",
        label: "AI Generator",
        referenceId: "ai_generator",
        params: {
          credentialId: credentialId,
          model: isOpenAI ? "gpt-4o-mini" : "claude-3-haiku-20240307",
          prompt: "{{ prompt_builder }}",
          systemPrompt: "You are a helpful assistant that provides concise summaries.",
          temperature: 0.7,
          maxTokens: 150,
        },
        position: { x: 700, y: 200 },
      },
    ],
    edges: [
      // Input → Template String
      {
        id: "edge-input-to-template",
        source: "input-topic",
        target: "template-prompt",
        sourceHandle: "output",
        targetHandle: "input",
      },
      // Template String → Model
      {
        id: "edge-template-to-model",
        source: "template-prompt",
        target: "model-generate",
        sourceHandle: "output",
        targetHandle: "input",
      },
    ],
    metadata: {
      name: "Input Template Model Flow",
      description: "Simple flow: Input topic → Build prompt → Generate AI response",
      created: new Date().toISOString(),
    },
  };
}

export const inputTemplateModelExample: FlowExample = {
  name: "Input → Template String → Model Flow",
  description: "User builds a flow that takes a topic, creates a prompt, and generates an AI response.",
  
  async execute(invect) {
    // Step 1: Ensure we have an AI credential
    const credential = await ensureAICredential(invect);
    console.log(`  📝 Using credential: ${credential.name} (${credential.id})`);
    console.log(`  🤖 Provider: ${credential.isOpenAI ? "OpenAI" : "Anthropic"}`);

    // Step 2: Create a new flow
    const flow = await invect.flows.create({
      name: `e2e-input-template-model-${Date.now()}`,
    });
    console.log(`  📁 Created flow: ${flow.name} (${flow.id})`);

    // Step 3: Build and save the flow definition
    const flowDefinition = buildFlowDefinition(credential.id, credential.isOpenAI);
    await invect.versions.create(flow.id, {
      invectDefinition: flowDefinition,
    });
    console.log(`  💾 Saved flow version with ${flowDefinition.nodes.length} nodes`);

    // Step 4: Execute the flow with a custom topic
    // Disable batch processing for direct API execution in e2e tests
    console.log(`  🚀 Executing flow...`);
    const result = await invect.runs.start(
      flow.id,
      { topic: "the invention of the telephone" },
      { useBatchProcessing: false }
    );
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

    // Verify Input node executed
    const inputNode = result.outputs?.["input-topic"] as NodeOutput | undefined;
    assert(inputNode, "Input node outputs should be present");
    const inputVars = inputNode.data.variables as Record<string, { value?: unknown }>;
    assert.equal(
      inputVars.output?.value,
      "the invention of the telephone",
      "Input node should output the provided topic"
    );

    // Verify Template String node executed
    const templateNode = result.outputs?.["template-prompt"] as NodeOutput | undefined;
    assert(templateNode, "Template String node outputs should be present");
    const templateVars = templateNode.data.variables as Record<string, { value?: unknown }>;
    const templateOutput = templateVars.output?.value as string;
    assert(templateOutput, "Template node should have output");
    assert(
      templateOutput.includes("the invention of the telephone"),
      `Template output should contain the topic, got: ${templateOutput}`
    );

    // Verify Model node executed
    const modelNode = result.outputs?.["model-generate"] as NodeOutput | undefined;
    assert(modelNode, "Model node outputs should be present");
    const modelVars = modelNode.data.variables as Record<string, { value?: unknown }>;
    const modelOutput = modelVars.output?.value as string;
    assert(modelOutput, "Model node should have generated output");
    assert(
      modelOutput.length > 20,
      `Model should generate a meaningful response, got: ${modelOutput}`
    );

    console.log(`  📄 Model output preview: "${modelOutput.substring(0, 100)}..."`);
  },
};
