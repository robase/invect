import React, { useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useFlowEditorStore } from './flow-editor.store';
import { useNodeExecutions } from '~/api/executions.api';
import { extractOutputValue } from './node-config-panel/utils';

/**
 * Handles query-parameter-driven behaviors when navigating from the runs view:
 * - `openNode=<id>` — opens the config panel for the specified node
 * - `fromRunId=<id>` — populates node previews from a specific flow run
 */
export function useRunDataFromQueryParams() {
  const storeNodes = useFlowEditorStore((s) => s.nodes);
  const openConfigPanel = useFlowEditorStore((s) => s.openConfigPanel);
  const populateFromRunData = useFlowEditorStore((s) => s.populateFromRunData);

  const [searchParams, setSearchParams] = useSearchParams();

  // Capture fromRunId in a ref so it survives URL param cleanup
  const fromRunIdRef = useRef<string | null>(null);
  if (searchParams.get('fromRunId') && !fromRunIdRef.current) {
    fromRunIdRef.current = searchParams.get('fromRunId');
  }

  // Open the specified node's config panel and clear the query params
  React.useEffect(() => {
    const openNodeId = searchParams.get('openNode');
    if (openNodeId && storeNodes.length > 0) {
      const nodeExists = storeNodes.some((n) => n.id === openNodeId);
      if (nodeExists) {
        openConfigPanel(openNodeId);
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('openNode');
          next.delete('fromRunId');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, storeNodes, openConfigPanel, setSearchParams]);

  // Populate node preview data from a specific flow run
  const { data: fromRunNodeExecutions } = useNodeExecutions(fromRunIdRef.current ?? '');
  const fromRunPopulatedRef = useRef(false);

  React.useEffect(() => {
    if (
      !fromRunIdRef.current ||
      !fromRunNodeExecutions?.length ||
      storeNodes.length === 0 ||
      fromRunPopulatedRef.current
    ) {
      return;
    }
    fromRunPopulatedRef.current = true;

    const nodeExecutionMap: Record<string, { inputs?: unknown; outputs?: unknown }> = {};
    for (const exec of fromRunNodeExecutions) {
      const extracted = extractOutputValue(exec.outputs);
      nodeExecutionMap[exec.nodeId] = {
        inputs: exec.inputs,
        outputs: extracted ?? undefined,
      };
    }
    populateFromRunData(nodeExecutionMap);
  }, [fromRunNodeExecutions, storeNodes, populateFromRunData]);
}
