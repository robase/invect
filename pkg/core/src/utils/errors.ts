import {
  InvectError,
  FlowNotFoundError,
  FlowExecutionError,
  ConfigurationError,
  TimeoutError,
  DatabaseError,
  ValidationError,
} from 'src/types/common/errors.types';
import { Logger } from 'src/types/schemas';

/**
 * Error handling utilities
 */
export class ErrorUtils {
  /**
   * Safely extract error message from unknown error
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return 'Unknown error occurred';
  }

  /**
   * Safely extract error stack from unknown error
   */
  static getErrorStack(error: unknown): string | undefined {
    if (error instanceof Error) {
      return error.stack;
    }
    return undefined;
  }

  /**
   * Check if error is a specific Invect error type
   */
  static isInvectError(error: unknown): error is InvectError {
    return error instanceof Error && 'code' in error && 'statusCode' in error;
  }

  /**
   * Check if error is a validation error
   */
  static isValidationError(error: unknown): error is ValidationError {
    return ErrorUtils.isInvectError(error) && error.code === 'VALIDATION_ERROR';
  }

  /**
   * Check if error is a database error
   */
  static isDatabaseError(error: unknown): error is DatabaseError {
    return ErrorUtils.isInvectError(error) && error.code === 'DATABASE_ERROR';
  }

  /**
   * Check if error is a flow not found error
   */
  static isFlowNotFoundError(error: unknown): error is FlowNotFoundError {
    return ErrorUtils.isInvectError(error) && error.code === 'FLOW_NOT_FOUND';
  }

  /**
   * Check if error is an execution error
   */
  static isExecutionError(error: unknown): error is FlowExecutionError {
    return (
      ErrorUtils.isInvectError(error) &&
      (error.code === 'FLOW_EXECUTION_ERROR' || error.code === 'NODE_EXECUTION_ERROR')
    );
  }

  /**
   * Check if error is a configuration error
   */
  static isConfigurationError(error: unknown): error is ConfigurationError {
    return ErrorUtils.isInvectError(error) && error.code === 'CONFIGURATION_ERROR';
  }

  /**
   * Check if error is a timeout error
   */
  static isTimeoutError(error: unknown): error is TimeoutError {
    return ErrorUtils.isInvectError(error) && error.code === 'TIMEOUT_ERROR';
  }

  /**
   * Get error HTTP status code
   */
  static getErrorStatusCode(error: unknown): number {
    if (ErrorUtils.isInvectError(error)) {
      return error.statusCode;
    }
    return 500; // Internal server error by default
  }

  /**
   * Create error context for logging
   */
  static createErrorContext(
    error: unknown,
    additionalContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const context: Record<string, unknown> = {
      message: ErrorUtils.getErrorMessage(error),
      stack: ErrorUtils.getErrorStack(error),
      timestamp: new Date().toISOString(),
      ...additionalContext,
    };

    if (ErrorUtils.isInvectError(error)) {
      context.code = error.code;
      context.statusCode = error.statusCode;
      context.context = error.context;
    }

    return context;
  }

  /**
   * Safely log error with context
   */
  static logError(
    logger: Logger,
    error: unknown,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const errorContext = ErrorUtils.createErrorContext(error, context);
    logger.error(message, errorContext);
  }

  /**
   * Create sanitized error response for client
   */
  static createErrorResponse(
    error: unknown,
    includeStack = false,
  ): {
    message: string;
    code?: string;
    statusCode: number;
    stack?: string;
    context?: Record<string, unknown>;
  } {
    const message = ErrorUtils.getErrorMessage(error);
    const statusCode = ErrorUtils.getErrorStatusCode(error);

    const response: {
      message: string;
      code?: string;
      statusCode: number;
      stack?: string;
      context?: Record<string, unknown>;
    } = {
      message,
      statusCode,
    };

    if (ErrorUtils.isInvectError(error)) {
      response.code = error.code;
      // Only include safe context fields for client
      if (error.context) {
        response.context = ErrorUtils.sanitizeContext(error.context);
      }
    }

    if (includeStack) {
      response.stack = ErrorUtils.getErrorStack(error);
    }

    return response;
  }

  /**
   * Sanitize error context for client response
   */
  private static sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const allowedFields = ['field', 'nodeId', 'executionId', 'flowId', 'type', 'timestamp'];

    for (const [key, value] of Object.entries(context)) {
      if (allowedFields.includes(key)) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Wrap async function with error handling
   */
  static async withErrorHandling<T>(
    fn: () => Promise<T>,
    logger: Logger,
    errorMessage: string,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      ErrorUtils.logError(logger, error, errorMessage, context);
      throw error;
    }
  }

  /**
   * Retry async operation with exponential backoff
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      retryCondition?: (error: unknown) => boolean;
      logger?: Logger;
    } = {},
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      retryCondition = () => true,
      logger,
    } = options;

    let lastError: unknown;
    let delay = baseDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries || !retryCondition(error)) {
          throw error;
        }

        if (logger) {
          logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
            error: ErrorUtils.getErrorMessage(error),
            attempt: attempt + 1,
            maxRetries,
            delay,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Create a circuit breaker for async operations
   */
  static createCircuitBreaker<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    options: {
      failureThreshold?: number;
      resetTimeout?: number;
      logger?: Logger;
    } = {},
  ): (...args: T) => Promise<R> {
    const { failureThreshold = 5, resetTimeout = 60000, logger } = options;

    let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    let failureCount = 0;
    let lastFailureTime = 0;

    return async (...args: T): Promise<R> => {
      const now = Date.now();

      // Check if we should reset from OPEN to HALF_OPEN
      if (state === 'OPEN' && now - lastFailureTime >= resetTimeout) {
        state = 'HALF_OPEN';
        failureCount = 0;
        if (logger) {
          logger.info('Circuit breaker state changed to HALF_OPEN');
        }
      }

      // Reject immediately if circuit is OPEN
      if (state === 'OPEN') {
        throw new Error('Circuit breaker is OPEN - operation rejected');
      }

      try {
        const result = await fn(...args);

        // Success - reset failure count and close circuit
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
          if (logger) {
            logger.info('Circuit breaker state changed to CLOSED');
          }
        }
        failureCount = 0;

        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = now;

        if (failureCount >= failureThreshold) {
          state = 'OPEN';
          if (logger) {
            logger.warn(`Circuit breaker state changed to OPEN after ${failureCount} failures`);
          }
        }

        throw error;
      }
    };
  }

  /**
   * Aggregate multiple errors into a single error
   */
  static aggregateErrors(errors: unknown[], message = 'Multiple errors occurred'): Error {
    const errorMessages = errors.map((error) => ErrorUtils.getErrorMessage(error));
    const aggregatedMessage = `${message}: ${errorMessages.join('; ')}`;

    const aggregatedError = new Error(aggregatedMessage);
    (aggregatedError as unknown as Record<string, unknown>).originalErrors = errors;

    return aggregatedError;
  }

  /**
   * Extract validation errors from error
   */
  static extractValidationErrors(error: unknown): string[] {
    if (ErrorUtils.isValidationError(error)) {
      return [error.message];
    }

    if (error && typeof error === 'object' && 'errors' in error) {
      const errors = (error as { errors: unknown }).errors;
      if (Array.isArray(errors)) {
        return errors.map((err: unknown) => ErrorUtils.getErrorMessage(err));
      }
    }

    return [ErrorUtils.getErrorMessage(error)];
  }

  /**
   * Check if error indicates a temporary failure that should be retried
   */
  static isRetryableError(error: unknown): boolean {
    if (ErrorUtils.isTimeoutError(error)) {
      return true;
    }

    if (ErrorUtils.isDatabaseError(error)) {
      const message = ErrorUtils.getErrorMessage(error).toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('busy') ||
        message.includes('lock')
      );
    }

    // Check for common transient error patterns
    const message = ErrorUtils.getErrorMessage(error).toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('temporary') ||
      message.includes('unavailable') ||
      message.includes('try again') ||
      message.includes('connection') ||
      message.includes('network')
    );
  }
}

/**
 * Error tracking utilities for debugging and monitoring
 */
export class ErrorTracker {
  private errors: Array<{
    timestamp: Date;
    error: unknown;
    context?: Record<string, unknown>;
  }> = [];

  private maxErrors: number;

  constructor(maxErrors = 100) {
    this.maxErrors = maxErrors;
  }

  /**
   * Track an error
   */
  track(error: unknown, context?: Record<string, unknown>): void {
    this.errors.push({
      timestamp: new Date(),
      error,
      context,
    });

    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  /**
   * Get recent errors
   */
  getRecentErrors(count = 10): Array<{
    timestamp: Date;
    message: string;
    stack?: string;
    context?: Record<string, unknown>;
  }> {
    return this.errors.slice(-count).map(({ timestamp, error, context }) => ({
      timestamp,
      message: ErrorUtils.getErrorMessage(error),
      stack: ErrorUtils.getErrorStack(error),
      context,
    }));
  }

  /**
   * Get error statistics
   */
  getStats(): {
    totalErrors: number;
    recentErrors: number;
    errorsByType: Record<string, number>;
  } {
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const recentErrors = this.errors.filter((e) => e.timestamp > recentThreshold).length;

    const errorsByType: Record<string, number> = {};
    for (const { error } of this.errors) {
      if (ErrorUtils.isInvectError(error)) {
        const code = error.code;
        errorsByType[code] = (errorsByType[code] || 0) + 1;
      } else {
        errorsByType['UNKNOWN'] = (errorsByType['UNKNOWN'] || 0) + 1;
      }
    }

    return {
      totalErrors: this.errors.length,
      recentErrors,
      errorsByType,
    };
  }

  /**
   * Clear error history
   */
  clear(): void {
    this.errors = [];
  }
}
