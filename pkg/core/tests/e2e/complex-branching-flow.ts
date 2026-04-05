/**
 * E2E Test: Complex Branching Flow
 *
 * Tests a more complex flow with multiple node types:
 *
 * Flow structure:
 *   Input (user_data)
 *       ↓
 *   JQ (extract/transform data)
 *       ↓
 *   If-Else (age >= 18?)
 *      ↓ True          ↓ False
 *   Template         Template
 *   (adult msg)      (minor msg)
 *
 * This tests:
 * - Input node with JSON data
 * - JQ node operating on incomingData (no inputData param)
 * - If-Else conditional branching using incomingData for condition evaluation
 * - Template String nodes on different branches
 * - Proper branch execution (only one path should execute)
 *
 * The new execution model:
 * - incomingData = { upstream_ref: outputValue, ... }
 * - Nodes like JQ and If-Else use context.incomingData directly
 * - No more separate "inputData" params with Nunjucks templates
 */
import { strict as assert } from 'node:assert';
import { FlowRunStatus, type InvectDefinition, type NodeOutput } from '../../src';
import type { FlowExample } from './example-types';

/**
 * Build the complex branching flow definition
 */
function buildFlowDefinition(isAdult: boolean): InvectDefinition {
  const userData = {
    name: isAdult ? 'Alice' : 'Bobby',
    age: isAdult ? 25 : 15,
    email: isAdult ? 'alice@example.com' : 'bobby@example.com',
  };

  return {
    nodes: [
      // INPUT NODE: User data as JSON
      {
        id: 'input-user',
        type: 'core.input',
        label: 'User Data',
        referenceId: 'user_data',
        params: {
          variableName: 'user',
          defaultValue: JSON.stringify(userData),
        },
        position: { x: 100, y: 200 },
      },
      // JQ NODE: Extract and transform user data
      // Uses incomingData directly: { "user_data": { name, age, email } }
      // JQ query accesses .user_data to get the input node's output
      {
        id: 'jq-extract',
        type: 'core.jq',
        label: 'Extract User Info',
        referenceId: 'user_info',
        params: {
          // JQ query operates on incomingData object
          // .user_data accesses the "user_data" key (from Input node's referenceId)
          query: '.user_data | { name: .name, age: .age, isAdult: (.age >= 18) }',
        },
        position: { x: 300, y: 200 },
      },
      // IF-ELSE NODE: Check if user is adult
      // Uses incomingData directly for JSON Logic evaluation
      // incomingData = { "user_info": { name, age, isAdult } }
      {
        id: 'if-adult',
        type: 'core.if_else',
        label: 'Is Adult?',
        referenceId: 'age_check',
        params: {
          // JSON Logic condition evaluated against incomingData
          // { "var": "user_info.isAdult" } accesses incomingData.user_info.isAdult
          condition: { '==': [{ var: 'user_info.isAdult' }, true] },
        },
        position: { x: 500, y: 200 },
      },
      // TEMPLATE STRING NODE (True branch): Adult message
      // incomingData = { "age_check": <passthrough data> }
      // The Template String uses context.incomingData for template resolution
      {
        id: 'template-adult',
        type: 'core.template_string',
        label: 'Adult Message',
        referenceId: 'adult_message',
        params: {
          // Template accesses incomingData keys
          // age_check is the If-Else passthrough (contains original data)
          template: 'Welcome {{ age_check.user_info.name }}! You have full access to all features.',
        },
        position: { x: 700, y: 100 },
      },
      // TEMPLATE STRING NODE (False branch): Minor message
      {
        id: 'template-minor',
        type: 'core.template_string',
        label: 'Minor Message',
        referenceId: 'minor_message',
        params: {
          template:
            'Hi {{ age_check.user_info.name }}! Some features are restricted for users under 18.',
        },
        position: { x: 700, y: 300 },
      },
    ],
    edges: [
      // Input → JQ
      {
        id: 'edge-input-to-jq',
        source: 'input-user',
        target: 'jq-extract',
      },
      // JQ → If-Else
      {
        id: 'edge-jq-to-ifelse',
        source: 'jq-extract',
        target: 'if-adult',
      },
      // If-Else (True) → Adult Template
      {
        id: 'edge-ifelse-true',
        source: 'if-adult',
        target: 'template-adult',
        sourceHandle: 'true_output',
      },
      // If-Else (False) → Minor Template
      {
        id: 'edge-ifelse-false',
        source: 'if-adult',
        target: 'template-minor',
        sourceHandle: 'false_output',
      },
    ],
    metadata: {
      name: 'Complex Branching Flow',
      description: 'Tests JQ transformation and If-Else branching with new execution model',
      created: new Date().toISOString(),
    },
  };
}

export const complexBranchingFlowExample: FlowExample = {
  name: 'Complex Branching Flow (Adult Path)',
  description: 'Tests Input → JQ → If-Else → Template with conditional branching (adult user).',

  async execute(invect) {
    // Create flow for adult user (age 25)
    const flow = await invect.flows.create({
      name: `e2e-complex-branching-adult-${Date.now()}`,
    });
    console.log(`  📁 Created flow: ${flow.name} (${flow.id})`);

    const flowDefinition = buildFlowDefinition(true); // isAdult = true
    await invect.versions.create(flow.id, {
      invectDefinition: flowDefinition,
    });
    console.log(`  💾 Saved flow version with ${flowDefinition.nodes.length} nodes`);

    console.log(`  🚀 Executing flow with adult user (age 25)...`);
    const result = await invect.runs.start(flow.id, {}, { useBatchProcessing: false });
    console.log(`  ✅ Flow completed with status: ${result.status}`);

    return result;
  },

  expected(result) {
    // Verify flow succeeded
    assert.equal(
      result.status,
      FlowRunStatus.SUCCESS,
      `Flow should succeed, got: ${result.status}${result.error ? ` - ${result.error}` : ''}`,
    );

    // Verify Input node executed
    const inputNode = result.outputs?.['input-user'] as NodeOutput | undefined;
    assert(inputNode, 'Input node outputs should be present');
    const inputVars = inputNode.data.variables as Record<string, { value?: unknown }>;
    const inputValue = inputVars.output?.value;
    assert(inputValue, 'Input node should have output value');

    // Parse and verify input data
    const userData = typeof inputValue === 'string' ? JSON.parse(inputValue) : inputValue;
    assert.equal(userData.name, 'Alice', 'User name should be Alice');
    assert.equal(userData.age, 25, 'User age should be 25');
    console.log(`  📄 Input: ${JSON.stringify(userData)}`);

    // Verify JQ node executed
    const jqNode = result.outputs?.['jq-extract'] as NodeOutput | undefined;
    assert(jqNode, 'JQ node outputs should be present');
    const jqVars = jqNode.data.variables as Record<string, { value?: unknown }>;
    const jqOutputRaw = jqVars.output?.value;
    assert(jqOutputRaw, 'JQ node should have output');
    // JQ returns stringified JSON, parse it
    const jqOutput = typeof jqOutputRaw === 'string' ? JSON.parse(jqOutputRaw) : jqOutputRaw;
    assert.equal(jqOutput.isAdult, true, 'JQ should identify user as adult');
    console.log(`  📄 JQ output: ${JSON.stringify(jqOutput)}`);

    // Verify If-Else node executed
    const ifElseNode = result.outputs?.['if-adult'] as NodeOutput | undefined;
    assert(ifElseNode, 'If-Else node outputs should be present');
    const ifElseVars = ifElseNode.data.variables as Record<string, { value?: unknown }>;
    // The If-Else outputs via true_output or false_output
    const trueBranchTaken = ifElseVars.true_output?.value !== undefined;
    assert(trueBranchTaken, 'If-Else should have executed True branch (true_output)');
    console.log(`  📄 If-Else result: True branch taken`);

    // Verify Adult Template executed (True branch)
    const adultTemplate = result.outputs?.['template-adult'] as NodeOutput | undefined;
    assert(adultTemplate, 'Adult template node should have executed');
    const adultVars = adultTemplate.data.variables as Record<string, { value?: unknown }>;
    const adultMessage = adultVars.output?.value as string;
    assert(adultMessage, 'Adult template should have output');
    assert(
      adultMessage.includes('Welcome') && adultMessage.includes('Alice'),
      `Adult message should welcome Alice, got: ${adultMessage}`,
    );
    console.log(`  📄 Adult message: "${adultMessage}"`);

    // Verify Minor Template did NOT execute (False branch should be skipped)
    const minorTemplate = result.outputs?.['template-minor'] as NodeOutput | undefined;
    if (minorTemplate) {
      const minorVars = minorTemplate.data.variables as Record<string, { value?: unknown }>;
      const minorExecuted = minorVars.output?.value !== undefined;
      assert(!minorExecuted, 'Minor template should NOT have executed for adult user');
    }
    console.log(`  ✓ Minor branch correctly skipped`);
  },
};

export const complexBranchingFlowMinorExample: FlowExample = {
  name: 'Complex Branching Flow (Minor Path)',
  description: 'Tests Input → JQ → If-Else → Template with conditional branching (minor user).',

  async execute(invect) {
    // Create flow for minor user (age 15)
    const flow = await invect.flows.create({
      name: `e2e-complex-branching-minor-${Date.now()}`,
    });
    console.log(`  📁 Created flow: ${flow.name} (${flow.id})`);

    const flowDefinition = buildFlowDefinition(false); // isAdult = false
    await invect.versions.create(flow.id, {
      invectDefinition: flowDefinition,
    });
    console.log(`  💾 Saved flow version with ${flowDefinition.nodes.length} nodes`);

    console.log(`  🚀 Executing flow with minor user (age 15)...`);
    const result = await invect.runs.start(flow.id, {}, { useBatchProcessing: false });
    console.log(`  ✅ Flow completed with status: ${result.status}`);

    return result;
  },

  expected(result) {
    // Verify flow succeeded
    assert.equal(
      result.status,
      FlowRunStatus.SUCCESS,
      `Flow should succeed, got: ${result.status}${result.error ? ` - ${result.error}` : ''}`,
    );

    // Verify Input node executed
    const inputNode = result.outputs?.['input-user'] as NodeOutput | undefined;
    assert(inputNode, 'Input node outputs should be present');
    const inputVars = inputNode.data.variables as Record<string, { value?: unknown }>;
    const inputValue = inputVars.output?.value;
    const userData = typeof inputValue === 'string' ? JSON.parse(inputValue) : inputValue;
    assert.equal(userData.name, 'Bobby', 'User name should be Bobby');
    assert.equal(userData.age, 15, 'User age should be 15');
    console.log(`  📄 Input: ${JSON.stringify(userData)}`);

    // Verify JQ node executed
    const jqNode = result.outputs?.['jq-extract'] as NodeOutput | undefined;
    assert(jqNode, 'JQ node outputs should be present');
    const jqVars = jqNode.data.variables as Record<string, { value?: unknown }>;
    const jqOutputRaw = jqVars.output?.value;
    assert(jqOutputRaw, 'JQ node should have output');
    const jqOutput = typeof jqOutputRaw === 'string' ? JSON.parse(jqOutputRaw) : jqOutputRaw;
    assert.equal(jqOutput.isAdult, false, 'JQ should identify user as minor');
    console.log(`  📄 JQ output: ${JSON.stringify(jqOutput)}`);

    // Verify If-Else node took false branch
    const ifElseNode = result.outputs?.['if-adult'] as NodeOutput | undefined;
    assert(ifElseNode, 'If-Else node outputs should be present');
    const ifElseVars = ifElseNode.data.variables as Record<string, { value?: unknown }>;
    const falseBranchTaken = ifElseVars.false_output?.value !== undefined;
    assert(falseBranchTaken, 'If-Else should have executed False branch (false_output)');
    console.log(`  📄 If-Else result: False branch taken`);

    // Verify Minor Template executed (False branch)
    const minorTemplate = result.outputs?.['template-minor'] as NodeOutput | undefined;
    assert(minorTemplate, 'Minor template node should have executed');
    const minorVars = minorTemplate.data.variables as Record<string, { value?: unknown }>;
    const minorMessage = minorVars.output?.value as string;
    assert(minorMessage, 'Minor template should have output');
    assert(
      minorMessage.includes('Hi') && minorMessage.includes('Bobby'),
      `Minor message should greet Bobby, got: ${minorMessage}`,
    );
    console.log(`  📄 Minor message: "${minorMessage}"`);

    // Verify Adult Template did NOT execute (True branch should be skipped)
    const adultTemplate = result.outputs?.['template-adult'] as NodeOutput | undefined;
    if (adultTemplate) {
      const adultVars = adultTemplate.data.variables as Record<string, { value?: unknown }>;
      const adultExecuted = adultVars.output?.value !== undefined;
      assert(!adultExecuted, 'Adult template should NOT have executed for minor user');
    }
    console.log(`  ✓ Adult branch correctly skipped`);
  },
};
