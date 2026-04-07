import { Link } from 'react-router';
import { FlowRunsTable } from '../components/flow-runs-table/FlowRunsTable';
import { PageLayout } from '../components/PageLayout';
import { useDocumentTitle } from '../hooks/use-document-title';

interface AllFlowRunsProps {
  basePath?: string;
}

export const AllFlowRuns = ({ basePath = '' }: AllFlowRunsProps) => {
  useDocumentTitle('flow runs');
  return (
    <PageLayout
      title="Flow Runs"
      actions={
        <Link
          to={basePath || '/'}
          className="inline-flex items-center px-3 py-1.5 text-sm text-muted-foreground bg-card border border-border rounded hover:bg-muted transition-colors"
        >
          ← Back to Home
        </Link>
      }
    >
      <FlowRunsTable basePath={basePath} />
    </PageLayout>
  );
};
