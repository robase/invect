import { GraphNodeType } from 'src/types-fresh';
import { NodeDefinition } from '../types/node-definition.types';
import { Logger } from 'src/types/schemas';
import { CredentialsService } from 'src/services/credentials/credentials.service';
import { BaseAIClient } from 'src/services/ai/base-client';

export interface NodeConfigUpdateEvent {
  nodeId: string;
  nodeType: GraphNodeType;
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
