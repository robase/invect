import { FlowRunsView } from '../components/flow-viewer/FlowRunsView';
import { useParams } from 'react-router';

interface FlowRunsProps {
  basePath?: string;
}

export const FlowRuns = ({ basePath = '' }: FlowRunsProps) => {
  const { flowId, version } = useParams();

  if (!flowId) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-muted-foreground">No flow ID provided</div>
      </div>
    );
  }

  return <FlowRunsView flowId={flowId} flowVersion={version} basePath={basePath} />;
};
