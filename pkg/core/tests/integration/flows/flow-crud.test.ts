/**
 * Integration tests: Flow CRUD operations
 *
 * Tests creating, reading, updating, listing, and deleting flows
 * through the real Invect core with an in-memory SQLite database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Invect } from '../../../src/invect-core';
import { createTestInvect } from '../helpers/test-invect';

describe('Flow CRUD', () => {
  let invect: Invect;

  beforeAll(async () => {
    invect = await createTestInvect();
  });

  afterAll(async () => {
    await invect.shutdown();
  });

  it('should create a flow', async () => {
    const flow = await invect.createFlow({ name: 'Test Flow' });

    expect(flow).toBeDefined();
    expect(flow.id).toBeTruthy();
    expect(flow.name).toBe('Test Flow');
  });

  it('should get a flow by id', async () => {
    const created = await invect.createFlow({ name: 'Fetch Me' });
    const fetched = await invect.getFlow(created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe('Fetch Me');
  });

  it('should list flows', async () => {
    const name = `List-Test-${Date.now()}`;
    await invect.createFlow({ name });

    const result = await invect.listFlows();

    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some((f) => f.name === name)).toBe(true);
  });

  it('should update a flow', async () => {
    const flow = await invect.createFlow({ name: 'Before Update' });
    const updated = await invect.updateFlow(flow.id, { name: 'After Update' });

    expect(updated.name).toBe('After Update');

    const fetched = await invect.getFlow(flow.id);
    expect(fetched.name).toBe('After Update');
  });

  it('should delete a flow', async () => {
    const flow = await invect.createFlow({ name: 'Delete Me' });
    await invect.deleteFlow(flow.id);

    await expect(invect.getFlow(flow.id)).rejects.toThrow();
  });

  describe('Flow Versioning', () => {
    it('should create and retrieve a flow version', async () => {
      const flow = await invect.createFlow({ name: 'Versioned Flow' });

      const version = await invect.createFlowVersion(flow.id, {
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
      const flow = await invect.createFlow({ name: 'Latest Version Flow' });

      await invect.createFlowVersion(flow.id, {
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

      await invect.createFlowVersion(flow.id, {
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

      const latest = await invect.getFlowVersion(flow.id, 'latest');
      expect(latest).toBeDefined();
      // createFlow auto-creates v1, two createFlowVersion calls make v2 and v3
      expect(latest!.version).toBe(3);
    });

    it('should list versions for a flow', async () => {
      const flow = await invect.createFlow({ name: 'Multi Version Flow' });

      await invect.createFlowVersion(flow.id, {
        invectDefinition: { nodes: [], edges: [] },
      });
      await invect.createFlowVersion(flow.id, {
        invectDefinition: { nodes: [], edges: [] },
      });

      const result = await invect.listFlowVersions(flow.id);
      // createFlow auto-creates v1, plus two explicit versions = 3 total
      expect(result.data.length).toBe(3);
    });
  });
});
