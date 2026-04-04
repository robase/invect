import type { PluginsAPI } from './types';
import type { PluginManager } from '../services/plugin-manager';
import type { ServiceFactory } from '../services/service-factory';

export function createPluginsAPI(pluginManager: PluginManager, sf: ServiceFactory): PluginsAPI {
  return {
    has(pluginId) {
      return pluginManager.hasPlugin(pluginId);
    },

    get(pluginId) {
      return pluginManager.getPlugin(pluginId);
    },

    getAll() {
      return pluginManager.getPlugins();
    },

    getEndpoints() {
      return pluginManager.getPluginEndpoints();
    },

    getHookRunner() {
      return pluginManager;
    },

    getDatabaseConnection() {
      return sf.getDatabaseService().getConnection();
    },
  };
}
