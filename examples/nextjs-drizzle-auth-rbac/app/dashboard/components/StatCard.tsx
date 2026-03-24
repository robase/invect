interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: string;
}

export function StatCard({ title, value, change, changeType = 'neutral', icon }: StatCardProps) {
  const changeColor =
    changeType === 'positive'
      ? 'text-green-600'
      : changeType === 'negative'
        ? 'text-red-600'
        : 'text-muted';

  return (
    <div className="p-5 border rounded-lg border-card-border bg-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {change && <div className={`mt-1 text-xs ${changeColor}`}>{change}</div>}
    </div>
  );
}
