import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import type { InvectDefinition } from '@invect/core';
import { emitSdkSource, SdkEmitError } from '../src/emitter/sdk-source';

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
    expect(code).toContain(`["name", "greet"]`);
    expect(code).toContain(`["greet", "result"]`);
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
    expect(code).toContain(`["check", "yes", "true_output"]`);
    expect(code).toContain(`["check", "no", "false_output"]`);
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

  it('throws SdkEmitError for unsupported action types', () => {
    const def: InvectDefinition = {
      nodes: [{ id: 'n1', type: 'gmail.send_message', referenceId: 'email', params: {} }],
      edges: [],
    };

    expect(() => emitSdkSource(def)).toThrow(SdkEmitError);
    expect(() => emitSdkSource(def)).toThrow(/has no SDK builder/);
  });

  it('throws for invalid flowName identifier', () => {
    const def: InvectDefinition = { nodes: [], edges: [] };
    expect(() => emitSdkSource(def, { flowName: 'bad name' })).toThrow(/not a valid JS identifier/);
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
