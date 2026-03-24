/**
 * Common error types for Invect
 */

export abstract class InvectError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Flow not found error
 */
export class FlowNotFoundError extends InvectError {
  readonly code = 'FLOW_NOT_FOUND';
  readonly statusCode = 404;
}

export class DatabaseError extends InvectError {
  code: string = 'DATABASE_ERROR';
  statusCode: number = 500;
  constructor(
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DatabaseError';
    if (details) {
      this.details = details;
    }
  }
}

/**
 * Flow execution error
 */
export class FlowExecutionError extends InvectError {
  readonly code = 'FLOW_EXECUTION_ERROR';
  readonly statusCode = 500;
}

/**
 * Node execution error
 */
export class NodeExecutionError extends InvectError {
  readonly code = 'NODE_EXECUTION_ERROR';
  readonly statusCode = 500;

  constructor(
    message: string,
    public readonly nodeId: string,
    public readonly nodeType: string,
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

/**
 * Validation error
 */
export class ValidationError extends InvectError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends InvectError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;
}

/**
 * Timeout error
 */
export class TimeoutError extends InvectError {
  readonly code = 'TIMEOUT_ERROR';
  readonly statusCode = 408;
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends InvectError {
  readonly code = 'UNAUTHORIZED';
  readonly statusCode = 401;
}

/**
 * Forbidden error
 */
export class ForbiddenError extends InvectError {
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;
}

/**
 * Rate limit error
 */
export class RateLimitError extends InvectError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
}
