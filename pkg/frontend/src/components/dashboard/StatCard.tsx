import React from 'react';
import { cn } from '~/lib/utils';
import { Card, CardContent, CardDescription, CardHeader } from '~/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={cn('gap-0 py-4', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium uppercase tracking-wider">
            {title}
          </CardDescription>
          <div className="rounded-md bg-muted p-1.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
