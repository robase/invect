// Main entry point for invect package
// This file re-exports the most commonly used items from the packages

// Re-export the main InvectModule and configuration from NestJS package
export { InvectModule } from '../pkg/nestjs/src/index';

// Re-export core functionality  
export { Invect } from '../pkg/core/src/index';

// Re-export InvectConfig type from core
export type { InvectConfig } from '../pkg/core/src/index';


