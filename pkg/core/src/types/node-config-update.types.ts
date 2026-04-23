import { NodeDefinition } from './node-definition.types';
import { Logger } from 'src/schemas';
import { CredentialsService } from 'src/services/credentials/credentials.service';
import { BaseAIClient } from 'src/services/ai/base-client';

export interface NodeConfigUpdateEvent {
  nodeId: string;
  nodeType: string;
  flowId?: string;
  params: Record<string, unknown>;
  change?: {
    field: string;
    value: unknown;
  };
}

export interface NodeConfigUpdateResponse {
  definition: NodeDefinition;
  params?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
}

export interface NodeConfigUpdateContext {
  logger: Logger;
  services: {
    credentials: CredentialsService;
    baseAIClient: BaseAIClient;
  };
}
