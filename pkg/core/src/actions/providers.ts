/**
 * Re-exports provider definitions from `@invect/actions`. Kept here so the
 * remaining in-core actions (`core/`, `http/`, `triggers/`) can continue to
 * `import { CORE_PROVIDER } from '../providers'` without changes.
 */

export * from '@invect/actions/providers';
