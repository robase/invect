/**
 * Unit tests for the defineFlow SDK
 */

import { describe, it, expect } from 'vitest';
import { defineFlow } from '../../../src/sdk/define-flow';
import {
  input,
  output,
  model,
  javascript,
  ifElse,
  template,
  httpRequest,
  agent,
  node,
} from '../../../src/sdk/nodes';
import { gmail, slack, github, provider } from '../../../src/sdk/providers';

// ── defineFlow ──────────────────────────────────────────────────────────

describe('defineFlow', () => {
  it('should produce a valid InvectDefinition from tuple edges', () => {
    const result = defineFlow({
      name: 'Test Flow',
      nodes: [
        input('query', { variableName: 'query' }),
        model('answer', { credentialId: 'cred', model: 'gpt-4o', prompt: '{{ query }}' }),
        output('result', { outputName: 'answer', outputValue: '{{ answer }}' }),
      ],
      edges: [
        ['query', 'answer'],
        ['answer', 'result'],
      ],
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.metadata).toEqual({ name: 'Test Flow' });
  });

  it('should produce a valid InvectDefinition from object edges', () => {
    const result = defineFlow({
      name: 'Test Flow',
      nodes: [
        input('query', { variableName: 'query' }),
        model('answer', { credentialId: 'cred', model: 'gpt-4o', prompt: '{{ query }}' }),
        output('result', { outputName: 'answer', outputValue: '{{ answer }}' }),
      ],
      edges: [
        { from: 'query', to: 'answer' },
        { from: 'answer', to: 'result' },
      ],
    });

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]).toEqual({
      id: 'edge-query-answer',
      source: 'node-query',
      target: 'node-answer',
    });
  });

  it('should accept mixed tuple and object edges', () => {
    const result = defineFlow({
      name: 'Mixed Edges',
      nodes: [input('a', {}), template('b', {}), output('c', {})],
      edges: [['a', 'b'], { from: 'b', to: 'c' }],
    });

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].source).toBe('node-a');
    expect(result.edges[1].source).toBe('node-b');
  });

  it('should handle sourceHandle in tuple edges', () => {
    const result = defineFlow({
      name: 'Branching Flow',
      nodes: [
        input('data', {}),
        ifElse('check', { condition: { '==': [true, true] } }),
        template('yes_path', {}),
        template('no_path', {}),
      ],
      edges: [
        ['data', 'check'],
        ['check', 'yes_path', 'true_output'],
        ['check', 'no_path', 'false_output'],
      ],
    });

    expect(result.edges[1]).toEqual({
      id: 'edge-check-yes_path-true_output',
      source: 'node-check',
      target: 'node-yes_path',
      sourceHandle: 'true_output',
    });
    expect(result.edges[2]).toEqual({
      id: 'edge-check-no_path-false_output',
      source: 'node-check',
      target: 'node-no_path',
      sourceHandle: 'false_output',
    });
  });

  it('should handle handle in object edges', () => {
    const result = defineFlow({
      name: 'Branching Flow',
      nodes: [input('data', {}), ifElse('check', {}), template('yes_path', {})],
      edges: [
        { from: 'data', to: 'check' },
        { from: 'check', to: 'yes_path', handle: 'true_output' },
      ],
    });

    expect(result.edges[1]).toEqual({
      id: 'edge-check-yes_path-true_output',
      source: 'node-check',
      target: 'node-yes_path',
      sourceHandle: 'true_output',
    });
  });

  it('should include description and tags in metadata', () => {
    const result = defineFlow({
      name: 'Tagged Flow',
      description: 'A test flow',
      tags: ['test', 'unit'],
      nodes: [input('x', {})],
      edges: [],
    });

    expect(result.metadata).toEqual({
      name: 'Tagged Flow',
      description: 'A test flow',
      tags: ['test', 'unit'],
    });
  });

  it('should omit undefined metadata fields', () => {
    const result = defineFlow({
      name: 'Minimal',
      nodes: [input('x', {})],
      edges: [],
    });

    expect(result.metadata).toEqual({ name: 'Minimal' });
    expect(result.metadata).not.toHaveProperty('description');
    expect(result.metadata).not.toHaveProperty('tags');
  });

  it('should not prefix node IDs that already have the node- prefix', () => {
    const result = defineFlow({
      name: 'Prefixed',
      nodes: [input('a', {}), output('b', {})],
      edges: [['a', 'b']],
    });

    // Node helpers generate `node-a`, edges should reference these
    expect(result.edges[0].source).toBe('node-a');
    expect(result.edges[0].target).toBe('node-b');
  });
});

// ── Validation ──────────────────────────────────────────────────────────

describe('defineFlow validation', () => {
  it('should throw on missing name', () => {
    expect(() => defineFlow({ name: '', nodes: [input('x', {})], edges: [] })).toThrow(
      '"name" is required',
    );
  });

  it('should throw on empty nodes', () => {
    expect(() => defineFlow({ name: 'Fail', nodes: [], edges: [] })).toThrow(
      '"nodes" must be a non-empty array',
    );
  });

  it('should throw on duplicate referenceId', () => {
    expect(() =>
      defineFlow({
        name: 'Dup',
        nodes: [input('x', {}), output('x', {})],
        edges: [],
      }),
    ).toThrow('duplicate referenceId "x"');
  });

  it('should throw on edge referencing non-existent source', () => {
    expect(() =>
      defineFlow({
        name: 'Bad Edge',
        nodes: [input('a', {}), output('b', {})],
        edges: [['nonexistent', 'b']],
      }),
    ).toThrow('unknown source "node-nonexistent"');
  });

  it('should throw on edge referencing non-existent target', () => {
    expect(() =>
      defineFlow({
        name: 'Bad Edge',
        nodes: [input('a', {}), output('b', {})],
        edges: [{ from: 'a', to: 'nonexistent' }],
      }),
    ).toThrow('unknown target "node-nonexistent"');
  });
});

// ── Node helpers ────────────────────────────────────────────────────────

describe('node helpers', () => {
  it('input() should create a core.input node', () => {
    const n = input('user_query', { variableName: 'query', defaultValue: 'hello' });
    expect(n.id).toBe('node-user_query');
    expect(n.type).toBe('core.input');
    expect(n.referenceId).toBe('user_query');
    expect(n.label).toBe('User Query');
    expect(n.params).toEqual({ variableName: 'query', defaultValue: 'hello' });
  });

  it('output() should create a core.output node', () => {
    const n = output('final_result', { outputName: 'result', outputValue: '{{ data }}' });
    expect(n.type).toBe('core.output');
    expect(n.params).toEqual({ outputName: 'result', outputValue: '{{ data }}' });
  });

  it('model() should create a core.model node', () => {
    const n = model('classify', {
      credentialId: 'cred-1',
      model: 'gpt-4o-mini',
      prompt: 'Classify: {{ input }}',
      temperature: 0.1,
    });
    expect(n.type).toBe('core.model');
    expect(n.params).toHaveProperty('credentialId', 'cred-1');
    expect(n.params).toHaveProperty('temperature', 0.1);
  });

  it('javascript() should create a core.javascript node', () => {
    const n = javascript('transform', { code: 'return data.x + 1' });
    expect(n.type).toBe('core.javascript');
    expect(n.params).toEqual({ code: 'return data.x + 1' });
  });

  it('ifElse() should create a core.if_else node', () => {
    const n = ifElse('is_premium', { condition: { '==': [{ var: 'tier' }, 'premium'] } });
    expect(n.type).toBe('core.if_else');
    expect(n.label).toBe('Is Premium');
  });

  it('template() should create a core.template_string node', () => {
    const n = template('greeting', { template: 'Hello, {{ name }}!' });
    expect(n.type).toBe('core.template_string');
  });

  it('httpRequest() should create an http.request node', () => {
    const n = httpRequest('fetch_data', { url: 'https://api.example.com/data', method: 'GET' });
    expect(n.type).toBe('http.request');
    expect(n.params).toHaveProperty('url', 'https://api.example.com/data');
  });

  it('node() should create a generic node with any type', () => {
    const n = node('linear.create_issue', 'create_task', { title: 'Fix bug', teamId: 'team-1' });
    expect(n.type).toBe('linear.create_issue');
    expect(n.referenceId).toBe('create_task');
    expect(n.params).toEqual({ title: 'Fix bug', teamId: 'team-1' });
  });

  it('should accept custom label via options', () => {
    const n = input('x', {}, { label: 'Custom Label' });
    expect(n.label).toBe('Custom Label');
  });

  it('should accept mapper via options', () => {
    const n = javascript(
      'process',
      { code: 'return item * 2' },
      {
        mapper: { expression: 'return data.items', mode: 'iterate', concurrency: 5 },
      },
    );
    expect(n.mapper).toBeDefined();
    expect(n.mapper!.enabled).toBe(true);
    expect(n.mapper!.mode).toBe('iterate');
    expect(n.mapper!.concurrency).toBe(5);
  });

  it('humanize should convert snake_case to Title Case', () => {
    const n = input('fetch_user_data', {});
    expect(n.label).toBe('Fetch User Data');
  });
});

// ── Provider namespaces ─────────────────────────────────────────────────

describe('provider namespaces', () => {
  it('gmail.sendMessage() should create a gmail.send_message node', () => {
    const n = gmail.sendMessage('send_email', {
      credentialId: 'gmail-cred',
      to: 'user@example.com',
      subject: 'Test',
      body: 'Hello',
    });
    expect(n.type).toBe('gmail.send_message');
    expect(n.referenceId).toBe('send_email');
    expect(n.params).toHaveProperty('to', 'user@example.com');
  });

  it('slack.sendMessage() should create a slack.send_message node', () => {
    const n = slack.sendMessage('alert', {
      credentialId: 'slack-cred',
      channel: '#alerts',
      text: 'Server is down!',
    });
    expect(n.type).toBe('slack.send_message');
    expect(n.params).toHaveProperty('channel', '#alerts');
  });

  it('github.createIssue() should create a github.create_issue node', () => {
    const n = github.createIssue('file_bug', {
      credentialId: 'gh-cred',
      owner: 'acme',
      repo: 'web',
      title: 'Bug report',
    });
    expect(n.type).toBe('github.create_issue');
    expect(n.params).toHaveProperty('owner', 'acme');
  });

  it('provider() should create a generic provider namespace', () => {
    const linear = provider('linear');
    const n = linear('create_issue', 'create_task', { title: 'Fix' });
    expect(n.type).toBe('linear.create_issue');
    expect(n.referenceId).toBe('create_task');
  });
});

// ── Agent node ──────────────────────────────────────────────────────────

describe('agent node', () => {
  it('agent() should create an AGENT node with correct type', () => {
    const n = agent('researcher', {
      credentialId: 'openai-cred',
      model: 'gpt-4o',
      taskPrompt: 'Research {{ topic }}',
    });
    expect(n.id).toBe('node-researcher');
    expect(n.type).toBe('AGENT');
    expect(n.referenceId).toBe('researcher');
    expect(n.label).toBe('Researcher');
    expect(n.params).toHaveProperty('credentialId', 'openai-cred');
    expect(n.params).toHaveProperty('model', 'gpt-4o');
    expect(n.params).toHaveProperty('taskPrompt', 'Research {{ topic }}');
  });

  it('agent() should accept tool configuration', () => {
    const n = agent('support_bot', {
      credentialId: 'anthropic-cred',
      model: 'claude-sonnet-4-0',
      taskPrompt: 'Handle ticket: {{ ticket }}',
      enabledTools: ['http.request', 'core.javascript'],
      maxIterations: 15,
      stopCondition: 'explicit_stop',
      temperature: 0.3,
    });
    expect(n.params).toHaveProperty('enabledTools', ['http.request', 'core.javascript']);
    expect(n.params).toHaveProperty('maxIterations', 15);
    expect(n.params).toHaveProperty('stopCondition', 'explicit_stop');
  });

  it('agent() should accept addedTools with per-instance config', () => {
    const n = agent('assistant', {
      credentialId: 'cred',
      model: 'gpt-4o',
      taskPrompt: 'Help the user',
      addedTools: [
        {
          toolId: 'gmail.send_message',
          customName: 'send_reply',
          customDescription: 'Send a reply email',
          customParams: { credentialId: 'gmail-cred' },
        },
        { toolId: 'core.javascript' },
      ],
    });
    const tools = n.params.addedTools as unknown[];
    expect(tools).toHaveLength(2);
  });

  it('should build a flow with an agent node', () => {
    const result = defineFlow({
      name: 'Agent Flow',
      nodes: [
        input('topic', { variableName: 'topic' }),
        agent('researcher', {
          credentialId: 'openai-cred',
          model: 'gpt-4o',
          taskPrompt: 'Research {{ topic }}',
          enabledTools: ['http.request'],
          maxIterations: 10,
        }),
        output('summary', { outputName: 'summary', outputValue: '{{ researcher }}' }),
      ],
      edges: [['topic', 'researcher'], { from: 'researcher', to: 'summary' }],
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[1].type).toBe('AGENT');
    expect(result.edges).toHaveLength(2);
  });
});

// ── End-to-end: complex flow ────────────────────────────────────────────

describe('complex flow', () => {
  it('should build a multi-branch flow with mixed edge formats', () => {
    const result = defineFlow({
      name: 'Support Router',
      description: 'Routes support tickets',
      tags: ['support', 'production'],
      nodes: [
        input('ticket', { variableName: 'ticket' }),
        model('classify', {
          credentialId: 'openai-cred',
          model: 'gpt-4o-mini',
          prompt: 'Classify: {{ ticket }}',
          temperature: 0.1,
        }),
        javascript('extract', { code: 'return JSON.parse(classify).priority' }),
        ifElse('is_urgent', { condition: { '==': [{ var: 'extract' }, 'high'] } }),
        slack.sendMessage('alert_team', {
          credentialId: 'slack-cred',
          channel: '#escalations',
          text: 'Urgent: {{ ticket.subject }}',
        }),
        template('auto_reply', { template: 'Thanks for contacting us.' }),
        output('result', { outputName: 'response', outputValue: '{{ auto_reply }}' }),
      ],
      edges: [
        ['ticket', 'classify'],
        { from: 'classify', to: 'extract' },
        ['extract', 'is_urgent'],
        ['is_urgent', 'alert_team', 'true_output'],
        { from: 'is_urgent', to: 'auto_reply', handle: 'false_output' },
        ['alert_team', 'result'],
        { from: 'auto_reply', to: 'result' },
      ],
    });

    // Nodes
    expect(result.nodes).toHaveLength(7);
    expect(result.nodes.map((n) => n.type)).toEqual([
      'core.input',
      'core.model',
      'core.javascript',
      'core.if_else',
      'slack.send_message',
      'core.template_string',
      'core.output',
    ]);

    // Edges
    expect(result.edges).toHaveLength(7);

    // Branch edges have sourceHandle
    const trueEdge = result.edges.find((e) => e.target === 'node-alert_team');
    expect(trueEdge?.sourceHandle).toBe('true_output');

    const falseEdge = result.edges.find((e) => e.target === 'node-auto_reply');
    expect(falseEdge?.sourceHandle).toBe('false_output');

    // Merge edges (both branches → result) have no sourceHandle
    const mergeEdges = result.edges.filter((e) => e.target === 'node-result');
    expect(mergeEdges).toHaveLength(2);

    // Metadata
    expect(result.metadata).toEqual({
      name: 'Support Router',
      description: 'Routes support tickets',
      tags: ['support', 'production'],
    });
  });
});
