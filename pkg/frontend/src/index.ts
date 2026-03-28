// Main component exports
export { Invect } from './Invect';
export { InvectShell } from './InvectShell';
export { InvectLoader } from './components/shared/InvectLoader';
export { InvectLogo } from './components/shared/InvectLogo';

// Export types for better TypeScript support
export type { InvectProps } from './Invect';
export type { InvectShellProps } from './InvectShell';
export type { InvectLoaderProps } from './components/shared/InvectLoader';
export type { InvectLogoProps } from './components/shared/InvectLogo';

// Plugin system types
export type {
  InvectFrontendPlugin,
  PluginSidebarContribution,
  PluginRouteContribution,
  PluginPanelTabContribution,
  PluginHeaderActionContribution,
  PanelTabProps,
  HeaderActionProps,
  PermissionContext,
} from './types/plugin.types';
export { usePluginRegistry } from './contexts/PluginRegistryContext';
export type { PluginRegistry } from './contexts/PluginRegistryContext';

// Export API context for advanced usage
export { ApiProvider, useApiClient, useApiBaseURL } from './contexts/ApiContext';
export type { ApiProviderProps } from './contexts/ApiContext';

// OAuth2 callback handler - needed for OAuth2 redirects
export { OAuth2CallbackHandler } from './components/credentials/OAuth2ConnectButton';

// Experimental v2 flow editor shell (mock-ui layout integration)
export { FlowEditor } from './components/flow-editor/FlowEditor';
export { FlowEditor as FlowEditorV2 } from './components/flow-editor/FlowEditor';

// Standard page layout for non-editor pages
export { PageLayout } from './components/PageLayout';
export type { PageLayoutProps } from './components/PageLayout';

// Zustand stores for state management
export * from './stores';

// React Query + Zustand hooks
export * from './api';

// UI primitives
export { TreeView, type TreeDataItem, type TreeRenderItemParams } from './components/ui/tree-view';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog';
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
