import type { ChatAPI } from './types';
import type { ServiceFactory } from '../services/service-factory';

export function createChatAPI(sf: ServiceFactory): ChatAPI {
  return {
    async createStream(options) {
      const chatService = sf.getChatStreamService();
      return chatService.createStream({
        messages: options.messages,
        context: options.context,
        identity: options.identity,
      });
    },

    isEnabled() {
      return sf.getChatStreamService().isEnabled();
    },

    async listModels(credentialId: string, query?: string) {
      return sf.getChatStreamService().listModels(credentialId, query);
    },

    getMessages(flowId, options) {
      return sf.getDatabaseService().chatMessages.getByFlowId(flowId, options);
    },

    async saveMessages(flowId, messages) {
      const db = sf.getDatabaseService();
      await db.chatMessages.deleteByFlowId(flowId);
      return db.chatMessages.createMany(
        messages.map((m) => ({
          flowId,
          role: m.role,
          content: m.content,
          toolMeta: m.toolMeta,
        })),
      );
    },

    deleteMessages(flowId) {
      return sf.getDatabaseService().chatMessages.deleteByFlowId(flowId);
    },
  };
}
