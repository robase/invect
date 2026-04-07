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
  Search,
} from 'lucide-react';
import { useState, useMemo } from 'react';
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
  const [flowSearch, setFlowSearch] = useState('');
  const [flowPage, setFlowPage] = useState(1);
  const FLOWS_PAGE_SIZE = 8;

  const filteredFlows = useMemo(() => {
    if (!flowSearch.trim()) {
      return flows;
    }
    const q = flowSearch.toLowerCase();
    return flows.filter((f) => f.name.toLowerCase().includes(q));
  }, [flows, flowSearch]);

  const totalFlowPages = Math.max(1, Math.ceil(filteredFlows.length / FLOWS_PAGE_SIZE));
  const paginatedFlows = filteredFlows.slice(
    (flowPage - 1) * FLOWS_PAGE_SIZE,
    flowPage * FLOWS_PAGE_SIZE,
  );

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
        <Card className="border-destructive/30">
          <CardContent className="py-4">
            <div className="text-sm text-destructive">
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
        <div className="space-y-4 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold shrink-0">
              Flows
              {!flowsLoading && ` (${filteredFlows.length}${flowSearch ? `/${flows.length}` : ''})`}
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              <input
                type="text"
                value={flowSearch}
                onChange={(e) => {
                  setFlowSearch(e.target.value);
                  setFlowPage(1);
                }}
                placeholder="Search flows…"
                className="py-2 pr-3 text-sm bg-transparent border rounded-lg outline-none w-72 border-border pl-9 placeholder:text-muted-foreground focus:border-primary/50"
              />
            </div>
          </div>

          {flowsLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading flows…
            </div>
          )}

          {!flowsLoading && flows.length === 0 && !error && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="p-4 mb-4 rounded-full bg-muted">
                  <Plus className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="mb-1 text-sm font-medium">No flows yet</h3>
                <p className="max-w-xs mb-4 text-xs text-center text-muted-foreground">
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
              {filteredFlows.length === 0 ? (
                <p className="py-6 text-sm text-center text-muted-foreground">
                  No flows match &ldquo;{flowSearch}&rdquo;
                </p>
              ) : (
                paginatedFlows.map((flow) => (
                  <FlowCard key={flow.id} flow={flow} basePath={basePath} />
                ))
              )}
            </div>
          )}

          {/* Flows Pagination */}
          {!flowsLoading && filteredFlows.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filteredFlows.length} flow{filteredFlows.length !== 1 ? 's' : ''}
                {flowSearch ? ` matching “${flowSearch}”` : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFlowPage((p) => Math.max(1, p - 1))}
                  disabled={flowPage === 1}
                  className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50"
                >
                  Previous
                </button>
                <span>
                  {flowPage} / {totalFlowPages}
                </span>
                <button
                  type="button"
                  onClick={() => setFlowPage((p) => Math.min(totalFlowPages, p + 1))}
                  disabled={flowPage === totalFlowPages}
                  className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Recent Activity (2/5) ───────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent Activity</h2>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link to={`${basePath}/executions`}>
                View all
                <ArrowRight className="w-3 h-3 ml-1" />
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
