import { StatCard } from './components/StatCard';

/**
 * Main dashboard page — shows high-level stats for the startup.
 */
export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">Welcome back, Sarah. Here&apos;s what&apos;s happening at Acme.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Customers" value="7" change="+2 this month" changeType="positive" icon="👥" />
        <StatCard title="Monthly Revenue" value="$3,145" change="+12% vs last month" changeType="positive" icon="💰" />
        <StatCard title="Active Orders" value="3" change="2 pending shipment" changeType="neutral" icon="🛒" />
        <StatCard title="Team Members" value="5" change="1 invite pending" changeType="neutral" icon="🏢" />
      </div>

      {/* Recent activity */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
        <div className="space-y-3">
          {[
            { text: 'New order from DataFlow Labs — Enterprise plan', time: '2 hours ago', icon: '🛒' },
            { text: 'GreenLeaf Co upgraded from Free to Starter', time: '5 hours ago', icon: '⬆️' },
            { text: 'Custom Integration quote sent to CloudNine SaaS', time: '1 day ago', icon: '📧' },
            { text: 'Jordan Lee joined the Product team', time: '2 days ago', icon: '👤' },
            { text: 'OldCorp LLC churned — follow-up scheduled', time: '3 days ago', icon: '⚠️' },
          ].map((activity, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border border-card-border bg-card p-3">
              <span className="text-lg">{activity.icon}</span>
              <div className="flex-1">
                <div className="text-sm">{activity.text}</div>
                <div className="text-xs text-muted">{activity.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
