import { Link, useNavigate } from 'react-router';
import { Edit, History } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useLatestFlowRun } from '~/api/executions.api';
import { StatusBadge, formatRelativeTime } from './status-helpers';
import type { Flow } from '@invect/core/types';

interface FlowCardProps {
  flow: Flow;
  basePath: string;
}

export function FlowCard({ flow, basePath }: FlowCardProps) {
  const { data: latestRun } = useLatestFlowRun(flow.id);
  const navigate = useNavigate();

  return (
    <div
      className="group flex items-center justify-between rounded-lg border bg-card p-4 transition-all hover:shadow-sm hover:border-primary/20 cursor-pointer"
      onClick={() => navigate(`${basePath}/flow/${flow.id}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-medium truncate">{flow.name}</h3>
          {latestRun && <StatusBadge status={latestRun.status} />}
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          {flow.description && <span className="truncate max-w-[300px]">{flow.description}</span>}
          {latestRun ? (
            <span className="shrink-0">Last run {formatRelativeTime(latestRun.startedAt)}</span>
          ) : (
            <span className="italic">Never run</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`${basePath}/flow/${flow.id}`);
          }}
        >
          <Edit className="h-3 w-3 mr-1" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          asChild
          onClick={(e) => e.stopPropagation()}
        >
          <Link to={`${basePath}/flow/${flow.id}/runs`}>
            <History className="h-3 w-3 mr-1" />
            Runs
          </Link>
        </Button>
      </div>
    </div>
  );
}
