/**
 * Credential tools — reference-only (list metadata, test connectivity).
 * No create/delete/get-values for security.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvectClient } from '../client/types';
import { resolveIdentity } from '../auth';
import { TOOL_IDS } from '../../shared/types';
import { mapCredentialList, mapTestResult } from '../response-mappers';

export function registerCredentialTools(server: McpServer, client: InvectClient): void {
  server.tool(
    TOOL_IDS.CREDENTIAL_LIST,
    'List all credentials with their names, types, and providers. Does NOT expose secrets — only metadata for referencing in flow configs.',
    {},
    async (_params, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const creds = await client.listCredentials(identity);
      return {
        content: [{ type: 'text', text: mapCredentialList(creds) }],
      };
    },
  );

  server.tool(
    TOOL_IDS.CREDENTIAL_TEST,
    'Test connectivity of a credential by ID. Verifies the credential is valid and can reach the external service.',
    {
      credentialId: z.string().describe('The credential ID to test'),
    },
    async ({ credentialId }, extra) => {
      const identity = resolveIdentity(extra.authInfo);
      const result = await client.testCredential(identity, credentialId);
      return {
        content: [{ type: 'text', text: mapTestResult(result) }],
      };
    },
  );
}
