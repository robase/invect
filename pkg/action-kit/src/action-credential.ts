/**
 * Credential shape as provided to an executing action.
 */
export interface ActionCredential {
  id: string;
  name: string;
  type: string;
  authType: string;
  config: Record<string, unknown>;
}
