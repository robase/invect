/**
 * Graph Node Types
 *
 * This file contains ONLY the GraphNodeType enum and related constants.
 * It has NO runtime dependencies (no Zod, no imports from service files).
 *
 * This separation is critical for frontend bundling - the frontend imports
 * these values at runtime, and they must not pull in Node.js-specific code.
 */

/**
 * All supported node types in the flow graph
 */
export enum GraphNodeType {
  TEMPLATE_STRING = 'TEMPLATE_STRING',
  MODEL = 'MODEL',
  SQL_QUERY = 'SQL_QUERY',
  IF_ELSE = 'IF_ELSE',
  INPUT = 'INPUT',
  OUTPUT = 'OUTPUT',
  JQ = 'JQ',
  HTTP_REQUEST = 'HTTP_REQUEST',
  AGENT = 'core.agent',
  GMAIL = 'GMAIL',
}

/**
 * Human-readable display names for each node type
 */
export const GRAPH_NODE_TYPE_NAMES: Record<GraphNodeType, string> = {
  [GraphNodeType.TEMPLATE_STRING]: 'Template String',
  [GraphNodeType.MODEL]: 'Language Model',
  [GraphNodeType.SQL_QUERY]: 'SQL Query',
  [GraphNodeType.IF_ELSE]: 'If-Else Condition',
  [GraphNodeType.INPUT]: 'Input',
  [GraphNodeType.OUTPUT]: 'Output',
  [GraphNodeType.JQ]: 'JQ Data Selector',
  [GraphNodeType.HTTP_REQUEST]: 'HTTP Request',
  [GraphNodeType.AGENT]: 'AI Agent',
  [GraphNodeType.GMAIL]: 'Gmail',
};
