import { FlowEditor } from '../components/flow-editor/FlowEditor';
import { useParams } from 'react-router';

interface FlowProps {
  basePath?: string;
}

export const Flow = ({ basePath = '' }: FlowProps) => {
  const { flowId, version } = useParams();

  if (!flowId) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-muted-foreground">No flow ID provided</div>
      </div>
    );
  }

  return <FlowEditor flowId={flowId} flowVersion={version} basePath={basePath} />;
};
