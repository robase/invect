import { describe, it, expect } from 'vitest';
import { serializeFlowToTs } from '../src/backend/flow-serializer';

describe('serializeFlowToTs', () => {
  it('serializes a simple input → model → output flow', () => {
    const definition = {
      nodes: [
        {
          id: 'node-query',
          type: 'core.input',
          label: 'Query Input',
          referenceId: 'query',
          position: { x: 0, y: 0 },
          params: { variableName: 'query' },
        },
        {
          id: 'node-answer',
          type: 'core.model',
          label: 'Answer',
          referenceId: 'answer',
          position: { x: 200, y: 0 },
          params: {
            credentialId: 'cred_openai_123',
            model: 'gpt-4o',
            prompt: '{{ query }}',
          },
        },
        {
          id: 'node-result',
          type: 'core.output',
          label: 'Result',
          referenceId: 'result',
          position: { x: 400, y: 0 },
          params: { outputName: 'answer', outputValue: '{{ answer }}' },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-query', target: 'node-answer' },
        { id: 'e2', source: 'node-answer', target: 'node-result' },
      ],
    };

    const result = serializeFlowToTs(definition, {
      name: 'Question Answering',
      description: 'A simple Q&A flow',
    });

    // Verify it contains the expected structure
    expect(result).toContain('import {');
    expect(result).toContain("from '@invect/core/sdk'");
    expect(result).toContain('defineFlow');
    expect(result).toContain('name: "Question Answering"');
    expect(result).toContain('description: "A simple Q&A flow"');
    expect(result).toContain('input(');
    expect(result).toContain('model(');
    expect(result).toContain('output(');
    expect(result).toContain('edges:');
    expect(result).toContain('["query", "answer"]');
    expect(result).toContain('["answer", "result"]');
  });

  it('serializes provider actions with namespaced helpers', () => {
    const definition = {
      nodes: [
        {
          id: 'node-send',
          type: 'gmail.send_message',
          label: 'Send Email',
          referenceId: 'send',
          position: { x: 0, y: 0 },
          params: { to: 'test@example.com', subject: 'Hello', body: 'World' },
        },
      ],
      edges: [],
    };

    const result = serializeFlowToTs(definition, { name: 'Email Flow' });

    expect(result).toContain('gmail');
    expect(result).toContain('gmail.sendMessage(');
  });

  it('handles edges with sourceHandle', () => {
    const definition = {
      nodes: [
        {
          id: 'node-check',
          type: 'core.if_else',
          referenceId: 'check',
          position: { x: 0, y: 0 },
          params: { condition: '{{ value > 10 }}' },
        },
        {
          id: 'node-yes',
          type: 'core.output',
          referenceId: 'yes',
          position: { x: 200, y: 0 },
          params: {},
        },
      ],
      edges: [{ id: 'e1', source: 'node-check', target: 'node-yes', sourceHandle: 'true_output' }],
    };

    const result = serializeFlowToTs(definition, { name: 'Branch' });

    expect(result).toContain('["check", "yes", "true_output"]');
  });

  it('replaces credential IDs with env references', () => {
    const definition = {
      nodes: [
        {
          id: 'node-ai',
          type: 'core.model',
          referenceId: 'ai',
          position: { x: 0, y: 0 },
          params: { credentialId: 'cred_openai_abc', model: 'gpt-4o', prompt: 'test' },
        },
      ],
      edges: [],
    };

    const result = serializeFlowToTs(definition, { name: 'Cred Test' });

    expect(result).toContain('OPENAI_ABC_CREDENTIAL');
    expect(result).not.toContain('cred_openai_abc');
  });

  it('includes tags when present', () => {
    const definition = {
      nodes: [
        {
          id: 'node-x',
          type: 'core.input',
          referenceId: 'x',
          position: { x: 0, y: 0 },
          params: {},
        },
      ],
      edges: [],
    };

    const result = serializeFlowToTs(definition, {
      name: 'Tagged',
      tags: ['production', 'v2'],
    });

    expect(result).toContain('tags: ["production","v2"]');
  });

  it('resolves node IDs back to referenceIds in edges', () => {
    const definition = {
      nodes: [
        {
          id: 'node-a',
          type: 'core.input',
          referenceId: 'a',
          position: { x: 0, y: 0 },
          params: {},
        },
        {
          id: 'node-b',
          type: 'core.output',
          referenceId: 'b',
          position: { x: 200, y: 0 },
          params: {},
        },
      ],
      edges: [{ id: 'e1', source: 'node-a', target: 'node-b' }],
    };

    const result = serializeFlowToTs(definition, { name: 'Test' });

    expect(result).toContain('["a", "b"]');
    expect(result).not.toContain('node-a');
  });
});
