import { Link } from 'react-router';
import { ExecutionsTable } from '../components/executions/ExecutionsTable';
import { PageLayout } from '../components/PageLayout';

interface ExecutionsProps {
  basePath?: string;
}

export const Executions = ({ basePath = '' }: ExecutionsProps) => {
  return (
    <PageLayout
      title="Executions"
      actions={
        <Link
          to={basePath || '/'}
          className="inline-flex items-center px-3 py-1.5 text-sm text-muted-foreground bg-card border border-border rounded hover:bg-muted transition-colors"
        >
          ← Back to Home
        </Link>
      }
    >
      <ExecutionsTable basePath={basePath} />
    </PageLayout>
  );
};
