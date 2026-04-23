import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { evaluateSdkSource } from '../src/evaluator';
import { scanImports } from '../src/evaluator/import-scan';

/**
 * The evaluator resolves `@invect/sdk` + friends via jiti's alias map, which
 * routes each package specifier to its `package.json` → `exports` →
 * `dist/index.mjs`. That means the dist must exist before tests run. In
 * normal dev flows `pnpm build` is the first step; this guard is belt-and-
 * suspenders for CI / cold runs.
 */
beforeAll(() => {
  const sdkDist = path.resolve(__dirname, '..', 'dist', 'index.mjs');
  if (!fs.existsSync(sdkDist)) {
    execSync('pnpm --filter @invect/sdk build', { stdio: 'inherit' });
  }
});

/**
 * No virtual modules needed — @invect/sdk, @invect/action-kit, and
 * @invect/actions/* all resolve via the standard alias map the evaluator
 * builds at call time.
 */
const TEST_MODULES = {};

describe('scanImports', () => {
  describe('allowlist', () => {
    it('accepts @invect/sdk imports', () => {
      const { errors } = scanImports(`import { defineFlow, input } from '@invect/sdk';`);
      expect(errors).toEqual([]);
    });

    it('accepts @invect/actions/<provider> subpaths', () => {
      const { errors } = scanImports(
        `import { gmailSendMessageAction } from '@invect/actions/gmail';`,
      );
      expect(errors).toEqual([]);
    });

    it('accepts @invect/action-kit', () => {
      const { errors } = scanImports(`import { defineAction } from '@invect/action-kit';`);
      expect(errors).toEqual([]);
    });

    it('accepts caller-registered additional imports', () => {
      const { errors } = scanImports(`import { myAction } from '@acme/invect-actions';`, [
        '@acme/invect-actions',
      ]);
      expect(errors).toEqual([]);
    });
  });

  describe('rejections', () => {
    it('rejects node:fs', () => {
      const { errors } = scanImports(`import fs from 'node:fs';`);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('import-forbidden');
      expect(errors[0].specifier).toBe('node:fs');
    });

    it('rejects process', () => {
      const { errors } = scanImports(`import process from 'node:process';`);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('import-forbidden');
    });

    it('rejects child_process', () => {
      const { errors } = scanImports(`import { exec } from 'child_process';`);
      expect(errors).toHaveLength(1);
    });

    it('rejects relative-path imports', () => {
      const { errors } = scanImports(`import stuff from './secret';`);
      expect(errors).toHaveLength(1);
      expect(errors[0].specifier).toBe('./secret');
    });

    it('rejects URL imports', () => {
      const { errors } = scanImports(`import pkg from 'https://evil.example.com/mod.js';`);
      expect(errors).toHaveLength(1);
    });

    it('rejects dynamic import()', () => {
      const { errors } = scanImports(`const fs = await import('node:fs');`);
      expect(errors.some((e) => e.code === 'dynamic-import')).toBe(true);
    });

    it('rejects require() calls', () => {
      const { errors } = scanImports(`const fs = require('node:fs');`);
      expect(errors.some((e) => e.code === 'import-forbidden')).toBe(true);
    });

    it('includes line numbers in errors', () => {
      const src = `
import { defineFlow } from '@invect/sdk';
import fs from 'node:fs';
      `;
      const { errors } = scanImports(src);
      expect(errors[0].line).toBe(3);
    });
  });

  describe('mixed imports', () => {
    it('accepts allowed, rejects forbidden — returns only the forbidden as errors', () => {
      const src = `
import { defineFlow, input } from '@invect/sdk';
import { gmailSendMessageAction } from '@invect/actions/gmail';
import fs from 'node:fs';
      `;
      const { errors, allowedImports } = scanImports(src);
      expect(errors).toHaveLength(1);
      expect(errors[0].specifier).toBe('node:fs');
      expect(allowedImports.sort()).toEqual(['@invect/actions/gmail', '@invect/sdk']);
    });
  });
});

describe('evaluateSdkSource', () => {
  describe('security: import scan runs first', () => {
    it('rejects a source with forbidden imports before evaluating', async () => {
      const src = `
import { defineFlow, input } from '@invect/sdk';
import fs from 'node:fs';
export default defineFlow({ nodes: [input('q')], edges: [] });
      `;
      const { ok, errors, flow } = await evaluateSdkSource(src, {
        additionalModules: TEST_MODULES,
      });
      expect(ok).toBe(false);
      expect(flow).toBeNull();
      expect(errors[0].code).toBe('import-forbidden');
    });

    it('rejects dynamic import before evaluating', async () => {
      const src = `
import { defineFlow, input } from '@invect/sdk';
const _fs = await import('node:fs');
export default defineFlow({ nodes: [input('q')], edges: [] });
      `;
      const { ok, errors } = await evaluateSdkSource(src, { additionalModules: TEST_MODULES });
      expect(ok).toBe(false);
      expect(errors.some((e) => e.code === 'dynamic-import')).toBe(true);
    });
  });

  describe('evaluation', () => {
    it('evaluates a minimal flow', async () => {
      const src = `
import { defineFlow, input, output } from '@invect/sdk';
export default defineFlow({
  nodes: [input('query'), output('result', { value: 'hello' })],
  edges: [['query', 'result']],
});
      `;
      const { ok, flow, errors } = await evaluateSdkSource(src, {
        additionalModules: TEST_MODULES,
      });
      expect(errors).toEqual([]);
      expect(ok).toBe(true);
      expect(flow).not.toBeNull();
      expect(flow!.nodes).toHaveLength(2);
      expect(flow!.nodes[0].referenceId).toBe('query');
      expect(flow!.nodes[0].type).toBe('core.input');
      expect(flow!.edges).toEqual([{ from: 'query', to: 'result' }]);
    });

    it('preserves function-valued params (arrow bodies) for the transform step', async () => {
      const src = `
import { defineFlow, input, code } from '@invect/sdk';
export default defineFlow({
  nodes: [
    input('x'),
    code('double', { code: 'return x * 2' }),
  ],
  edges: [['x', 'double']],
});
      `;
      const { ok, flow } = await evaluateSdkSource(src, { additionalModules: TEST_MODULES });
      expect(ok).toBe(true);
      // String-form code is what the emitter currently produces; arrows come later.
      expect(flow!.nodes[1].params.code).toBe('return x * 2');
    });

    it('preserves metadata', async () => {
      const src = `
import { defineFlow, input } from '@invect/sdk';
export default defineFlow({
  name: 'My Flow',
  description: 'A test flow',
  tags: ['test'],
  nodes: [input('x')],
  edges: [],
});
      `;
      const { ok, flow } = await evaluateSdkSource(src, { additionalModules: TEST_MODULES });
      expect(ok).toBe(true);
      expect(flow!.metadata).toEqual({
        name: 'My Flow',
        description: 'A test flow',
        tags: ['test'],
      });
    });

    it('rejects sources without a default export', async () => {
      const src = `
import { defineFlow, input } from '@invect/sdk';
const notDefault = defineFlow({ nodes: [input('x')], edges: [] });
      `;
      const { ok, errors } = await evaluateSdkSource(src, { additionalModules: TEST_MODULES });
      expect(ok).toBe(false);
      expect(errors[0].code).toBe('no-default-export');
    });

    it('rejects a default export that is not a flow', async () => {
      const src = `export default 42;`;
      const { ok, errors } = await evaluateSdkSource(src, { additionalModules: TEST_MODULES });
      expect(ok).toBe(false);
      expect(errors[0].code).toBe('default-export-not-a-flow');
    });

    it('returns eval-failed on runtime errors inside defineFlow', async () => {
      // defineFlow rejects duplicate referenceIds — this surfaces as eval-failed.
      const src = `
import { defineFlow, input } from '@invect/sdk';
export default defineFlow({
  nodes: [input('q'), input('q')],
  edges: [],
});
      `;
      const { ok, errors } = await evaluateSdkSource(src, { additionalModules: TEST_MODULES });
      expect(ok).toBe(false);
      expect(errors[0].code).toBe('eval-failed');
      expect(errors[0].message).toMatch(/duplicate/i);
    });

    it('respects timeout for evaluation', async () => {
      const src = `
import { defineFlow, input } from '@invect/sdk';
// Force a long synchronous hang isn't feasible here without extra primitives,
// so just use a Promise to simulate an await that never resolves.
await new Promise(() => {});
export default defineFlow({ nodes: [input('x')], edges: [] });
      `;
      const { ok, errors } = await evaluateSdkSource(src, {
        additionalModules: TEST_MODULES,
        timeoutMs: 200,
      });
      expect(ok).toBe(false);
      expect(errors[0].code).toBe('timeout');
    });
  });

  describe('integration with provider actions', () => {
    it('evaluates a source that imports from @invect/actions/gmail', async () => {
      // Note: this imports a real package from the workspace. The action
      // callable has a strict Zod schema, so we pass valid params.
      const src = `
import { defineFlow, input } from '@invect/sdk';
import { gmailSendMessageAction } from '@invect/actions/gmail';
export default defineFlow({
  nodes: [
    input('event'),
    gmailSendMessageAction('notify', {
      credentialId: 'cred_test',
      to: 'a@b.c',
      subject: 'Test',
      body: 'Hello',
    }),
  ],
  edges: [['event', 'notify']],
});
      `;
      const { ok, flow, errors } = await evaluateSdkSource(src, {
        additionalModules: TEST_MODULES,
      });
      expect(errors).toEqual([]);
      expect(ok).toBe(true);
      expect(flow!.nodes[1].type).toBe('gmail.send_message');
    });
  });
});
