import React, { useMemo, useCallback, createContext, useContext } from 'react';
import { Outlet, useParams, useLocation } from 'react-router';
import { FlowHeader } from '../components/flow-editor/FlowHeader';
import { useFlowEditor } from '../components/flow-editor/use-flow-editor';
import { useUpdateFlow } from '../api/flows.api';
import { ReactFlowProvider } from '@xyflow/react';
import { useFlowEditorStore } from '../components/flow-editor/flow-editor.store';

interface FlowRouteLayoutProps {
  basePath?: string;
}

// Options for save operation
interface SaveOptions {
  skipSuccessToast?: boolean;
}

// Context for flow actions
interface FlowActionsContextType {
  // Always available
  onExecute: () => Promise<void>;
  isExecuting: boolean;
  isActive?: boolean;
  isTogglingActive: boolean;
  onToggleActive?: () => void;
  // Edit-only
  isDirty?: boolean;
  onSave?: (options?: SaveOptions) => Promise<boolean>;
  isSaving?: boolean;
}

const FlowActionsContext = createContext<FlowActionsContextType | null>(null);

export function useFlowActions() {
  return useContext(FlowActionsContext);
}

export function FlowRouteLayout({ basePath = '' }: FlowRouteLayoutProps) {
  const { flowId, version } = useParams();
  const location = useLocation();

  // Only provide context in edit view (when path ends with flow ID or version)
  const isEditView = location.pathname.includes('/flow/') && !location.pathname.includes('/runs');

  // Use the new Zustand-based hook
  const { flowName, isDirty, isActive, save, execute, isSaving, isExecuting } = useFlowEditor({
    flowId: flowId ?? '',
    version,
    basePath,
  });

  // Toggle flow active state
  const updateFlowMutation = useUpdateFlow();
  const handleToggleActive = useCallback(() => {
    if (!flowId || isActive === undefined) {
      return;
    }
    updateFlowMutation.mutate({ id: flowId, data: { isActive: !isActive } });
  }, [flowId, isActive, updateFlowMutation]);

  // Get setFlowName from store for header updates
  const setFlowName = useFlowEditorStore((s) => s.setFlowName);

  // Context value — always provided for Run + Active/Inactive; save fields only in edit view
  const flowActionsValue = useMemo<FlowActionsContextType>(
    () => ({
      onExecute: execute,
      isExecuting,
      isActive,
      isTogglingActive: updateFlowMutation.isPending,
      onToggleActive: handleToggleActive,
      ...(isEditView
        ? {
            isDirty,
            onSave: save,
            isSaving,
          }
        : {}),
    }),
    [isEditView, isDirty, save, execute, isSaving, isExecuting, isActive, updateFlowMutation.isPending, handleToggleActive],
  );

  return (
    <ReactFlowProvider>
      <FlowActionsContext.Provider value={flowActionsValue}>
        <div className="imp-page flex flex-col flex-1 min-h-0 bg-imp-background">
          <FlowHeader
            flowName={flowName}
            onFlowNameChange={setFlowName}
            isDirty={flowActionsValue?.isDirty}
            onSave={flowActionsValue?.onSave}
            isSaving={flowActionsValue?.isSaving}
          />
          <div className="imp-page flex-1 min-h-0 bg-imp-background">
            <Outlet />
          </div>
        </div>
      </FlowActionsContext.Provider>
    </ReactFlowProvider>
  );
}

export default FlowRouteLayout;
