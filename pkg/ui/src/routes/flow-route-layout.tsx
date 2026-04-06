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
  isDirty: boolean;
  onSave: (options?: SaveOptions) => Promise<boolean>;
  onExecute: () => Promise<void>;
  isSaving: boolean;
  isExecuting: boolean;
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

  // Context value (only provide in edit view)
  const flowActionsValue = useMemo(
    () =>
      isEditView
        ? {
            isDirty,
            onSave: save,
            onExecute: execute,
            isSaving,
            isExecuting,
          }
        : null,
    [isEditView, isDirty, save, execute, isSaving, isExecuting],
  );

  return (
    <ReactFlowProvider>
      <FlowActionsContext.Provider value={flowActionsValue}>
        <div className="imp-page flex flex-col flex-1 min-h-0 bg-imp-background">
          <FlowHeader
            flowName={flowName}
            onFlowNameChange={setFlowName}
            isDirty={flowActionsValue?.isDirty}
            isActive={isActive}
            isTogglingActive={updateFlowMutation.isPending}
            onToggleActive={handleToggleActive}
            onSave={flowActionsValue?.onSave}
            onExecute={execute}
            isSaving={flowActionsValue?.isSaving}
            isExecuting={isExecuting}
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
