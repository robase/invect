import { Link } from 'react-router';
import { AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { useListFlowRuns } from '~/api/executions.api';
import { formatRelativeTime } from './status-helpers';

export function FailedRunsAlert({ basePath }: { basePath: string }) {
  const { data: failedResponse, isLoading } = useListFlowRuns(
    undefined,
    'FAILED',
    1,
    5,
    'startedAt',
    'desc',
  );

  const failedRuns = failedResponse?.data ?? [];

  if (isLoading || failedRuns.length === 0) {
    return null;
  }

  return (
    <Card className="border-red-200 dark:border-red-900 gap-0 py-0">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <CardTitle className="text-sm">Attention Required</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Recent failed runs that may need investigation
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-2">
          {failedRuns.map((run) => (
            <Link
              key={run.id}
              to={`${basePath}/flow/${run.flowId}`}
              className="flex items-center justify-between rounded-md border border-red-100 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-2.5 text-sm hover:bg-red-100/50 dark:hover:bg-red-950/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <span className="truncate font-medium text-xs">{run.flowId.slice(0, 24)}</span>
                {run.error && (
                  <span className="text-xs text-red-600/70 dark:text-red-400/70 truncate max-w-[200px]">
                    {run.error}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                {formatRelativeTime(run.startedAt)}
              </span>
            </Link>
          ))}
        </div>
        <Button variant="ghost" size="sm" asChild className="mt-2 w-full text-xs">
          <Link to={`${basePath}/flow-runs`}>
            View all flow runs
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
