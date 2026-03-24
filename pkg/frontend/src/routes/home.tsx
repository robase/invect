import { Link, useNavigate } from 'react-router';
import {
  Plus,
  Loader2,
  Activity,
  TrendingUp,
  Zap,
  ArrowRight,
  BarChart3,
  Key,
  History,
} from 'lucide-react';
import { PageLayout } from '../components/PageLayout';
import { useFlows, useDashboardStats, useCreateFlow } from '../api/flows.api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { StatCard } from '../components/dashboard/StatCard';
import { FlowCard } from '../components/dashboard/FlowCard';
import { RecentActivityTable } from '../components/dashboard/RecentActivityTable';
import { FailedRunsAlert } from '../components/dashboard/FailedRunsAlert';

// ─── Main Home Page ─────────────────────────────────────────────────────────

interface HomeProps {
  basePath?: string;
}

export const Home = ({ basePath = '' }: HomeProps) => {
  const navigate = useNavigate();
  const { data: statsData, isLoading: statsLoading } = useDashboardStats();
  const { data: flowsResponse, isLoading: flowsLoading, error } = useFlows();
  const flows = flowsResponse?.data ?? [];
  const createFlowMutation = useCreateFlow();

  const recentRuns = statsData?.recentRuns ?? [];

  const handleCreateFlow = () => {
    createFlowMutation.mutate(
      { name: 'Untitled Flow', tags: [], isActive: true },
      { onSuccess: (data) => navigate(`${basePath}/flow/${data.id}`) },
    );
  };

  return (
    <PageLayout
      title="Dashboard"
      subtitle="Overview of your workflow activity"
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to={`${basePath}/credentials`}>
              <Key className="h-3.5 w-3.5 mr-1.5" />
              Credentials
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`${basePath}/executions`}>
              <History className="h-3.5 w-3.5 mr-1.5" />
              Executions
            </Link>
          </Button>
          <Button size="sm" onClick={handleCreateFlow} disabled={createFlowMutation.isPending}>
            {createFlowMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            New Flow
          </Button>
        </>
      }
    >
      {/* ── Stats Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Flows"
          value={statsLoading ? '—' : (statsData?.totalFlows ?? 0)}
          subtitle={
            !statsLoading && flows.length > 0
              ? `${flows.filter((f) => f.isActive).length} active`
              : undefined
          }
          icon={BarChart3}
        />
        <StatCard
          title="Runs (24h)"
          value={statsLoading ? '—' : (statsData?.runsLast24h ?? 0)}
          subtitle={!statsLoading ? `${statsData?.totalRuns ?? 0} total all-time` : undefined}
          icon={Activity}
        />
        <StatCard
          title="Success Rate"
          value={statsLoading ? '—' : `${statsData?.successRate ?? 0}%`}
          subtitle={
            !statsLoading && statsData?.failedRunsLast24h
              ? `${statsData.failedRunsLast24h} failed (24h)`
              : !statsLoading
                ? 'No failures (24h)'
                : undefined
          }
          icon={TrendingUp}
        />
        <StatCard
          title="Active Runs"
          value={statsLoading ? '—' : (statsData?.activeRuns ?? 0)}
          subtitle={
            !statsLoading && statsData && statsData.activeRuns > 0
              ? 'Currently executing'
              : !statsLoading
                ? 'All quiet'
                : undefined
          }
          icon={Zap}
        />
      </div>

      {/* ── Error State ─────────────────────────────────────── */}
      {error && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="py-4">
            <div className="text-sm text-red-700 dark:text-red-300">
              <strong>Error loading data:</strong>{' '}
              {error instanceof Error ? error.message : 'Failed to connect to server'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Failed Runs Alert ───────────────────────────────── */}
      <FailedRunsAlert basePath={basePath} />

      {/* ── Main Grid: Flows + Recent Activity ──────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Flows List (3/5) ────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              Flows{!flowsLoading && ` (${flows.length})`}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={handleCreateFlow}
              disabled={createFlowMutation.isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>

          {flowsLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading flows…
            </div>
          )}

          {!flowsLoading && flows.length === 0 && !error && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium mb-1">No flows yet</h3>
                <p className="text-xs text-muted-foreground mb-4 max-w-xs text-center">
                  Create your first workflow to get started with automation.
                </p>
                <Button
                  size="sm"
                  onClick={handleCreateFlow}
                  disabled={createFlowMutation.isPending}
                >
                  {createFlowMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Create Flow
                </Button>
              </CardContent>
            </Card>
          )}

          {!flowsLoading && flows.length > 0 && (
            <div className="space-y-2">
              {flows.map((flow) => (
                <FlowCard key={flow.id} flow={flow} basePath={basePath} />
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Activity (2/5) ───────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent Activity</h2>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link to={`${basePath}/executions`}>
                View all
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>

          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              <RecentActivityTable
                runs={recentRuns}
                flows={flows}
                basePath={basePath}
                isLoading={statsLoading}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
};
