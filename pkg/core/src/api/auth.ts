import type { AuthAPI } from './types';
import type { AuthorizationService } from '../services/auth';
import type { PluginManager } from '../services/plugin-manager';
import type { ServiceFactory } from '../services/service-factory';
import { createPluginDatabaseApi } from '../services/plugin-database-api';

export function createAuthAPI(
  authService: AuthorizationService,
  pluginManager: PluginManager,
  sf: ServiceFactory,
): AuthAPI {
  return {
    async authorize(context) {
      const hookResult = await pluginManager.runOnAuthorize({
        ...context,
        database: createPluginDatabaseApi(sf.getDatabaseService().getConnection()),
      });
      if (hookResult) {
        return hookResult;
      }
      return authService.authorize(context);
    },

    hasPermission(identity, permission) {
      return authService.hasPermission(identity, permission);
    },

    getPermissions(identity) {
      return authService.getPermissions(identity);
    },

    getService() {
      return authService;
    },

    getAvailableRoles() {
      return authService.getAvailableRoles();
    },

    getResolvedRole(identity) {
      return identity ? authService.getResolvedRole(identity) : null;
    },

    onEvent(event, listener) {
      authService.on(event, listener);
    },

    isEnabled() {
      return authService.isEnabled();
    },

    isPublicRoute(path) {
      return authService.isPublicRoute(path);
    },
  };
}
