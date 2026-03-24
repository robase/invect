# RBAC Hierarchical Scopes Plan

## Status

- [x] Research current RBAC implementation
- [x] Write implementation plan
- [x] Add schema changes for scopes and inheritance
- [x] Regenerate schema via Invect CLI
- [x] Add shared types and frontend hooks for scopes
- [x] Implement backend scope tree / move / preview endpoints
- [x] Rewrite authorization entrypoint to honor plugin overrides
- [x] Replace current access page with tree + detail layout
- [x] Add drag and drop + confirmation dialog
- [x] Update seed data for scoped hierarchy
- [x] Build and verify all touched packages

## Chosen Model

Use the existing `rbac_teams` table as the scope entity.

- Add `parent_id` to `rbac_teams` for nesting
- Add `scope_id` to `flows` to place flows into scopes
- Add `rbac_scope_access` for scope-level grants
- Remove old flat-teams-only assumptions where no longer needed

## Backend Plan

1. Extend the RBAC plugin schema with:
   - `rbac_teams.parent_id`
   - `flows.scope_id`
   - new `rbac_scope_access`
2. Add recursive ancestry resolution using `WITH RECURSIVE`
3. Add effective permission resolution: direct flow grants + inherited scope grants
4. Add endpoints:
   - `GET /rbac/scopes/tree`
   - `PUT /rbac/flows/:flowId/scope`
   - `GET /rbac/flows/:flowId/effective-access`
   - `GET|POST|DELETE /rbac/scopes/:scopeId/access`
   - `POST /rbac/preview-move`
5. Change auth enforcement to use the new effective permission lookup

## Frontend Plan

1. Add new shared types and hooks for:
   - scope tree
   - scope access
   - move preview
   - flow scope assignment
2. Replace the current flows/teams split UI with:
   - left tree panel
   - right detail panel
3. Add drag and drop and a confirmation dialog that explains the effect of a move

## Progress Log

### 2026-03-21
- Plan doc created
- Added `rbac_teams.parent_id`, `flows.scope_id`, and new `rbac_scope_access` to the RBAC plugin schema
- Expanded shared RBAC types for scope tree, effective access, and move preview payloads
- Fixed RBAC schema nullability so existing `rbac_teams` rows do not force destructive `NOT NULL` migrations for `parent_id`
- Added backend scope APIs: scope tree, scope access CRUD, flow scope assignment, effective flow access, and move preview
- Updated the core authorization entrypoint to check plugin `onAuthorize` hooks before falling back to role-based auth
- Wired a core-owned `PluginDatabaseApi` into authorization hooks so inherited scope checks do not depend on prior RBAC endpoint calls
- Added frontend scope hooks for the tree, scope access, effective flow access, flow moves, and move previews
- Replaced the old access page with a tree-based scope browser, native drag-and-drop, and a confirmation dialog backed by the move preview API
- Updated the Express example seed script to create nested scopes, assign flows into scopes, and populate scope-level inherited access grants
- Verified the updated work by building `@invect/rbac` and `@invect/core`, and by regenerating the Express example schema via the CLI
