import { describe, it, expect } from 'vitest';
import { serializeToSDK } from '../src/components/flow-editor/serialize-to-sdk';
import type {
  ClipboardNode,
  ClipboardEdge,
} from '../src/components/flow-editor/use-copy-paste.types';
import { parseSDKText } from '@invect/core/sdk';

// ─── Fixture helpers ────────────────────────────────────────────────────────

function node(
  id: string,
  type: string,
  params: Record<string, unknown> = {},
  position = { x: 0, y: 0 },
): ClipboardNode {
  return {
    originalId: id,
    type,
    relativePosition: position,
    data: {
      display_name: id,
      reference_id: id,
      params,
    },
  };
}

function edge(source: string, target: string, sourceHandle?: string): ClipboardEdge {
  return {
    originalId: `e-${source}-${target}`,
    source,
    target,
    ...(sourceHandle !== undefined && { sourceHandle }),
  };
}

// ─── Fragment mode ─────────────────────────────────────────────────────────

describe('serializeToSDK — fragment mode', () => {
  it('emits nodes and edges sections without imports or defineFlow wrapper', () => {
    const out = serializeToSDK([node('q', 'core.input', { variableName: 'q' })], []);

    expect(out).not.toContain('import');
    expect(out).not.toContain('defineFlow');
    expect(out).toContain('nodes: [');
    expect(out).toContain("input('q'");
  });

  it('omits edges section when there are none', () => {
    const out = serializeToSDK([node('q', 'core.input')], []);
    expect(out).not.toContain('edges: [');
  });

  it('drops edges whose endpoints are missing from the node set', () => {
    const nodes = [node('a', 'core.input'), node('b', 'core.output')];
    const edges = [edge('a', 'b'), edge('a', 'missing')];
    const out = serializeToSDK(nodes, edges);

    expect(out).toContain('{ from: "a", to: "b" }');
    expect(out).not.toContain('"missing"');
  });
});

// ─── Core helper mapping ───────────────────────────────────────────────────

describe('serializeToSDK — core helper mapping', () => {
  it.each([
    ['core.input', 'input'],
    ['core.output', 'output'],
    ['core.model', 'model'],
    ['core.javascript', 'javascript'],
    ['core.if_else', 'ifElse'],
    ['core.template_string', 'template'],
    ['http.request', 'httpRequest'],
    ['AGENT', 'agent'],
  ])('maps node type %s to %s() helper', (type, helper) => {
    const out = serializeToSDK([node('n', type, {})], []);
    expect(out).toContain(`${helper}('n'`);
  });

  it('maps provider action types to namespace.method calls', () => {
    const out = serializeToSDK(
      [
        node('a', 'gmail.send_message', {}),
        node('b', 'slack.send_message', {}),
        node('c', 'github.create_issue', {}),
      ],
      [],
    );
    expect(out).toContain("gmail.sendMessage('a'");
    expect(out).toContain("slack.sendMessage('b'");
    expect(out).toContain("github.createIssue('c'");
  });

  it('falls back to node() with verbatim type for unknown action types', () => {
    const out = serializeToSDK([node('n', 'some.unknown_action', { foo: 1 })], []);
    expect(out).toContain("node('some.unknown_action', 'n'");
  });
});

// ─── Edge formatting ───────────────────────────────────────────────────────

describe('serializeToSDK — edge formatting', () => {
  it('emits edges as { from, to } objects (not tuples)', () => {
    const out = serializeToSDK(
      [node('a', 'core.input'), node('b', 'core.output')],
      [edge('a', 'b')],
    );
    expect(out).toContain('{ from: "a", to: "b" }');
    expect(out).not.toMatch(/\['a',\s*'b'\]/);
  });

  it('includes handle field when sourceHandle is set', () => {
    const out = serializeToSDK(
      [node('a', 'core.if_else'), node('b', 'core.output')],
      [edge('a', 'b', 'true_output')],
    );
    expect(out).toContain('{ from: "a", to: "b", handle: "true_output" }');
  });
});

// ─── Full-file mode ────────────────────────────────────────────────────────

describe('serializeToSDK — full file mode', () => {
  it('emits imports and an export default defineFlow wrapper', () => {
    const out = serializeToSDK([node('q', 'core.input', { variableName: 'q' })], [], {
      asFullFile: true,
    });

    expect(out).toMatch(/^import \{[^}]+\} from '@invect\/core\/sdk';/);
    expect(out).toContain('export default defineFlow({');
    expect(out.trimEnd().endsWith('});')).toBe(true);
  });

  it('includes only the helpers that are actually used, plus defineFlow', () => {
    const out = serializeToSDK([node('q', 'core.input'), node('r', 'core.output')], [], {
      asFullFile: true,
    });

    const importLine = out.split('\n')[0];
    expect(importLine).toContain('defineFlow');
    expect(importLine).toContain('input');
    expect(importLine).toContain('output');
    expect(importLine).not.toContain('agent');
    expect(importLine).not.toContain('javascript');
  });

  it('includes provider namespaces when provider nodes are present', () => {
    const out = serializeToSDK(
      [node('a', 'gmail.send_message'), node('b', 'slack.send_message')],
      [],
      { asFullFile: true },
    );

    const importLine = out.split('\n')[0];
    expect(importLine).toContain('gmail');
    expect(importLine).toContain('slack');
  });

  it('falls back to node helper when unknown types are present', () => {
    const out = serializeToSDK([node('x', 'some.unknown')], [], { asFullFile: true });
    expect(out.split('\n')[0]).toContain('node');
  });

  it('adds a flow name property when flowName option is provided', () => {
    const out = serializeToSDK([node('q', 'core.input')], [], {
      asFullFile: true,
      flowName: 'My Flow',
    });
    expect(out).toContain('name: "My Flow"');
  });
});

// ─── Agent tools → tool() helper ───────────────────────────────────────────

describe('serializeToSDK — agent addedTools', () => {
  const agentWithTools = node('agt', 'AGENT', {
    model: 'claude-sonnet-4-6',
    credentialId: 'cred',
    taskPrompt: 'do stuff',
    addedTools: [
      {
        instanceId: 'tool_abc',
        toolId: 'github.search_issues',
        name: 'Search',
        description: 'Find issues',
        params: { perPage: 10 },
      },
    ],
  });

  it('emits each addedTools entry as a tool() call', () => {
    const out = serializeToSDK([agentWithTools], []);
    expect(out).toContain('tool("github.search_issues"');
    expect(out).toContain('name: "Search"');
    expect(out).toContain('description: "Find issues"');
  });

  it('drops the serialized instanceId (agent() regenerates on parse)', () => {
    const out = serializeToSDK([agentWithTools], []);
    expect(out).not.toContain('tool_abc');
    expect(out).not.toContain('instanceId');
  });

  it('imports the tool helper in full-file mode when agents have tools', () => {
    const out = serializeToSDK([agentWithTools], [], { asFullFile: true });
    expect(out.split('\n')[0]).toContain('tool');
  });

  it('does not import the tool helper when no agent has tools', () => {
    const out = serializeToSDK(
      [node('agt', 'AGENT', { model: 'x', credentialId: 'y', taskPrompt: 'z' })],
      [],
      { asFullFile: true },
    );
    expect(out.split('\n')[0]).not.toMatch(/\btool\b/);
  });
});

// ─── Round-trip through parseSDKText ───────────────────────────────────────

describe('serializeToSDK ↔ parseSDKText round-trip', () => {
  it('preserves node count, types, and referenceIds', () => {
    const nodes = [
      node('q', 'core.input', { variableName: 'q' }),
      node('m', 'core.model', { credentialId: 'c', model: 'gpt-4o', prompt: '{{q}}' }),
      node('o', 'core.output', { outputName: 'r', outputValue: '{{m}}' }),
    ];
    const edges = [edge('q', 'm'), edge('m', 'o')];

    const text = serializeToSDK(nodes, edges, { asFullFile: true });
    const parsed = parseSDKText(text);

    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.nodes.map((n) => n.referenceId)).toEqual(['q', 'm', 'o']);
    expect(parsed.edges).toHaveLength(2);
  });

  it('preserves sourceHandle via the handle field', () => {
    const nodes = [node('gate', 'core.if_else'), node('out', 'core.output')];
    const text = serializeToSDK(nodes, [edge('gate', 'out', 'true_output')], {
      asFullFile: true,
    });
    const parsed = parseSDKText(text);

    expect(parsed.edges).toHaveLength(1);
    const e = parsed.edges[0] as unknown;
    if (Array.isArray(e)) {
      expect(e[2]).toBe('true_output');
    } else {
      expect((e as { handle: string }).handle).toBe('true_output');
    }
  });

  it('rehydrates addedTools with fresh instanceIds and canonical fields', () => {
    const agt = node('agt', 'AGENT', {
      model: 'x',
      credentialId: 'y',
      taskPrompt: 'z',
      addedTools: [
        {
          instanceId: 'tool_old',
          toolId: 'slack.send_message',
          name: 'Notify',
          description: 'Post to slack',
          params: { channel: '#x' },
        },
      ],
    });

    const text = serializeToSDK([agt], [], { asFullFile: true });
    const parsed = parseSDKText(text);

    const tools = (parsed.nodes[0].params as Record<string, unknown>).addedTools as Array<
      Record<string, unknown>
    >;
    expect(tools).toHaveLength(1);
    expect(tools[0].toolId).toBe('slack.send_message');
    expect(tools[0].name).toBe('Notify');
    expect(tools[0].description).toBe('Post to slack');
    expect(tools[0].params).toEqual({ channel: '#x' });
    // agent() regenerates instanceId — should exist but not match the old one.
    expect(typeof tools[0].instanceId).toBe('string');
    expect(tools[0].instanceId).not.toBe('tool_old');
  });

  it('round-trips a fragment (non-full-file) emission', () => {
    const nodes = [node('a', 'core.input'), node('b', 'core.output')];
    const text = serializeToSDK(nodes, [edge('a', 'b')]);
    const parsed = parseSDKText(text);

    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
  });
});
