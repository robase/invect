/**
 * Integration tests: Flow CRUD operations
 *
 * Tests creating, reading, updating, listing, and deleting flows
 * through the real Invect core with an in-memory SQLite database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { InvectInstance } from '../../../src/api/types';
import { createTestInvect } from '../helpers/test-invect';

describe('Flow CRUD', () => {
  let invect: InvectInstance;

  beforeAll(async () => {
    invect = await createTestInvect();
  });

  afterAll(async () => {
    await invect.shutdown();
  });

  it('should create a flow', async () => {
    const flow = await invect.flows.create({ name: 'Test Flow' });

    expect(flow).toBeDefined();
    expect(flow.id).toBeTruthy();
    expect(flow.name).toBe('Test Flow');
  });

  it('should get a flow by id', async () => {
    const created = await invect.flows.create({ name: 'Fetch Me' });
    const fetched = await invect.flows.get(created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe('Fetch Me');
  });

  it('should list flows', async () => {
    const name = `List-Test-${Date.now()}`;
    await invect.flows.create({ name });

    const result = await invect.flows.list();

    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some((f) => f.name === name)).toBe(true);
  });

  it('should update a flow', async () => {
    const flow = await invect.flows.create({ name: 'Before Update' });
    const updated = await invect.flows.update(flow.id, { name: 'After Update' });

    expect(updated.name).toBe('After Update');

    const fetched = await invect.flows.get(flow.id);
    expect(fetched.name).toBe('After Update');
  });

  it('should delete a flow', async () => {
    const flow = await invect.flows.create({ name: 'Delete Me' });
    await invect.flows.delete(flow.id);

    await expect(invect.flows.get(flow.id)).rejects.toThrow();
  });

  describe('Flow Versioning', () => {
    it('should create and retrieve a flow version', async () => {
      const flow = await invect.flows.create({ name: 'Versioned Flow' });

      const version = await invect.versions.create(flow.id, {
        invectDefinition: {
          nodes: [
            {
              id: 'input-1',
              type: 'core.input',
              label: 'Input',
              referenceId: 'data',
              params: { variableName: 'x', defaultValue: '42' },
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
      });

      expect(version).toBeDefined();
      // createFlow auto-creates version 1 (empty), so first explicit version is 2
      expect(version.version).toBe(2);
    });

    it('should get the latest version', async () => {
      const flow = await invect.flows.create({ name: 'Latest Version Flow' });

      await invect.versions.create(flow.id, {
        invectDefinition: {
          nodes: [
            {
              id: 'n1',
              type: 'core.input',
              label: 'V1',
              referenceId: 'v1',
              params: { variableName: 'x', defaultValue: '1' },
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
      });

      await invect.versions.create(flow.id, {
        invectDefinition: {
          nodes: [
            {
              id: 'n2',
              type: 'core.input',
              label: 'V2',
              referenceId: 'v2',
              params: { variableName: 'x', defaultValue: '2' },
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
      });

      const latest = await invect.versions.get(flow.id, 'latest');
      expect(latest).toBeDefined();
      // createFlow auto-creates v1, two createFlowVersion calls make v2 and v3
      expect(latest!.version).toBe(3);
    });

    it('should list versions for a flow', async () => {
      const flow = await invect.flows.create({ name: 'Multi Version Flow' });

      await invect.versions.create(flow.id, {
        invectDefinition: { nodes: [], edges: [] },
      });
      await invect.versions.create(flow.id, {
        invectDefinition: { nodes: [], edges: [] },
      });

      const result = await invect.versions.list(flow.id);
      // createFlow auto-creates v1, plus two explicit versions = 3 total
      expect(result.data.length).toBe(3);
    });
  });
});
