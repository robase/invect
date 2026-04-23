import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import type { InvectDefinition } from '@invect/core';
import { emitSdkSource } from '../src/emitter/sdk-source';

function assertParsesWithoutErrors(source: string): void {
  const sourceFile = ts.createSourceFile(
    '__emit__.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  type WithDiag = ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
  const diags = (sourceFile as WithDiag).parseDiagnostics ?? [];
  if (diags.length > 0) {
    const messages = diags
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n');
    throw new Error(`Emitted source failed to parse:\n${messages}\n\n${source}`);
  }
}

describe('emitSdkSource — DB InvectDefinition → primitives SDK source', () => {
  it('emits a linear flow with input, code, output', () => {
    const def: InvectDefinition = {
      nodes: [
        { id: 'n1', type: 'core.input', referenceId: 'name', params: { variableName: 'name' } },
        {
          id: 'n2',
          type: 'core.javascript',
          referenceId: 'greet',
          params: { code: '`Hi ${name}`' },
        },
        {
          id: 'n3',
          type: 'core.output',
          referenceId: 'result',
          params: { outputValue: 'greet', outputName: 'result' },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };

    const { code, importedBuilders } = emitSdkSource(def, { flowName: 'greetFlow' });

    assertParsesWithoutErrors(code);
    expect(code).toContain(`import { defineFlow, input, output, code } from "@invect/primitives"`);
    expect(code).toContain(`export const greetFlow = defineFlow({`);
    expect(code).toContain(`input("name")`);
    expect(code).toContain(`code("greet", { code:`);
    expect(code).toContain(`const { name } = ctx;`);
    expect(code).toContain(`output("result", { value:`);
    expect(code).toContain(`{ from: "name", to: "greet" }`);
    expect(code).toContain(`{ from: "greet", to: "result" }`);
    expect(importedBuilders).toEqual(['input', 'output', 'code']);
  });

  it('emits ifElse with condition arrow function from DB expression', () => {
    const def: InvectDefinition = {
      nodes: [
        { id: 'n1', type: 'core.input', referenceId: 'value', params: {} },
        {
          id: 'n2',
          type: 'core.if_else',
          referenceId: 'check',
          params: { expression: 'value > 0' },
        },
        { id: 'n3', type: 'core.output', referenceId: 'yes', params: { outputValue: 'yes' } },
        { id: 'n4', type: 'core.output', referenceId: 'no', params: { outputValue: 'no' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'true_output' },
        { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'false_output' },
      ],
    };

    const { code } = emitSdkSource(def);

    assertParsesWithoutErrors(code);
    expect(code).toContain(`ifElse("check", { condition:`);
    expect(code).toContain(`const { value } = ctx;`);
    expect(code).toContain(`return (value > 0);`);
    expect(code).toContain(`{ from: "check", to: "yes", handle: "true_output" }`);
    expect(code).toContain(`{ from: "check", to: "no", handle: "false_output" }`);
  });

  it('emits switchNode with cases containing condition arrows', () => {
    const def: InvectDefinition = {
      nodes: [
        { id: 'n1', type: 'core.input', referenceId: 'kind', params: {} },
        {
          id: 'n2',
          type: 'core.switch',
          referenceId: 'route',
          params: {
            matchMode: 'first',
            cases: [
              { slug: 'a', label: 'A', expression: 'kind === "a"' },
              { slug: 'b', label: 'B', expression: 'kind === "b"' },
            ],
          },
        },
        { id: 'n3', type: 'core.output', referenceId: 'out_a', params: { outputValue: 'a' } },
        { id: 'n4', type: 'core.output', referenceId: 'out_b', params: { outputValue: 'b' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'a' },
        { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'b' },
      ],
    };

    const { code } = emitSdkSource(def);

    assertParsesWithoutErrors(code);
    expect(code).toContain(`switchNode("route", {`);
    expect(code).toContain(`matchMode: "first"`);
    expect(code).toContain(`{ slug: "a", label: "A", condition:`);
    expect(code).toContain(`return (kind === "a");`);
    expect(code).toContain(`return (kind === "b");`);
  });

  it('emits a generic node() fallback for action types without a dedicated SDK helper', () => {
    const def: InvectDefinition = {
      nodes: [{ id: 'n1', type: 'gmail.send_message', referenceId: 'email', params: {} }],
      edges: [],
    };

    const { code, importedBuilders } = emitSdkSource(def);
    assertParsesWithoutErrors(code);
    // The generic `node()` builder preserves the original type string verbatim.
    expect(code).toContain(`node("email", "gmail.send_message"`);
    expect(importedBuilders).toContain('node');
  });

  it('throws for invalid flowName identifier', () => {
    const def: InvectDefinition = { nodes: [], edges: [] };
    expect(() => emitSdkSource(def, { flowName: 'bad name' })).toThrow(/not a valid JS identifier/);
  });

  it('translates a pure {{ expr }} outputValue into a JS return, not a Nunjucks block', () => {
    // `core.output` stores the outputValue as a `{{ expr }}` template (JS inside
    // the braces). Before the fix the emitter produced `return ({{ x }});`,
    // which is a parse error. The pure-expression path now emits real JS.
    const def: InvectDefinition = {
      nodes: [
        { id: 'n1', type: 'core.input', referenceId: 'compute_metrics', params: {} },
        {
          id: 'n2',
          type: 'core.output',
          referenceId: 'final',
          params: { outputValue: '{{ compute_metrics }}', outputName: 'result' },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };

    const { code } = emitSdkSource(def);
    assertParsesWithoutErrors(code);
    expect(code).toContain(`const { compute_metrics } = ctx;`);
    expect(code).toContain(`return (compute_metrics);`);
    expect(code).not.toContain(`{{`);
  });

  it('translates a mixed-text outputValue into a JS template literal', () => {
    const def: InvectDefinition = {
      nodes: [
        { id: 'n1', type: 'core.input', referenceId: 'user', params: {} },
        {
          id: 'n2',
          type: 'core.output',
          referenceId: 'greeting',
          params: { outputValue: 'Hi {{ user.name }} — welcome!' },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };

    const { code } = emitSdkSource(def);
    assertParsesWithoutErrors(code);
    expect(code).toContain(`const { user } = ctx;`);
    expect(code).toContain('`Hi ${(user.name)} — welcome!`');
    expect(code).not.toContain(`{{`);
  });

  it('emits previous_nodes destructuring when an expression references it', () => {
    // At runtime `incomingData` exposes direct parents at the top level and
    // indirect ancestors under `previous_nodes`. The emitter must mirror that
    // so expressions referencing `previous_nodes.foo` don't hit ReferenceError.
    const def: InvectDefinition = {
      nodes: [
        { id: 'n1', type: 'core.input', referenceId: 'raw', params: {} },
        {
          id: 'n2',
          type: 'core.javascript',
          referenceId: 'clean',
          params: { code: 'return raw.trim();' },
        },
        {
          id: 'n3',
          type: 'core.if_else',
          referenceId: 'check',
          params: { expression: 'previous_nodes.raw.length > 0 && clean' },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };

    const { code } = emitSdkSource(def);
    assertParsesWithoutErrors(code);
    // Direct parent is `clean`; the expression also touches `previous_nodes`,
    // so both get destructured on the ifElse arrow.
    expect(code).toContain(`const { clean, previous_nodes } = ctx;`);
    // The code node's expression doesn't touch previous_nodes → it should NOT
    // be destructured there, keeping the emitted output tight.
    expect(code).toContain(`const { raw } = ctx;`);
    expect(code).not.toContain(`const { raw, previous_nodes } = ctx;`);
  });

  it('keeps non-template output strings as plain string literals', () => {
    const def: InvectDefinition = {
      nodes: [
        {
          id: 'n1',
          type: 'core.output',
          referenceId: 'msg',
          params: { outputValue: 'static literal' },
        },
      ],
      edges: [],
    };

    const { code } = emitSdkSource(def);
    assertParsesWithoutErrors(code);
    expect(code).toContain(`(ctx) => ("static literal")`);
  });

  it('preserves explicit return in multi-line code', () => {
    const def: InvectDefinition = {
      nodes: [
        { id: 'n1', type: 'core.input', referenceId: 'x', params: {} },
        {
          id: 'n2',
          type: 'core.javascript',
          referenceId: 'work',
          params: { code: 'const y = x * 2;\nreturn y + 1;' },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };

    const { code } = emitSdkSource(def);
    assertParsesWithoutErrors(code);
    expect(code).toContain(`const { x } = ctx;`);
    expect(code).toContain(`const y = x * 2;`);
    expect(code).toContain(`return y + 1;`);
    // Should NOT wrap with auto-return when user wrote explicit return
    expect(code).not.toContain(`return (const y`);
  });
});
