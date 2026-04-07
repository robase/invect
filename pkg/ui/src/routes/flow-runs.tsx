import { FlowRunsView } from '../components/flow-viewer/FlowRunsView';
import { useParams } from 'react-router';
import { useDocumentTitle } from '../hooks/use-document-title';

interface FlowRunsProps {
  basePath?: string;
}

export const FlowRuns = ({ basePath = '' }: FlowRunsProps) => {
  useDocumentTitle('runs');
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
