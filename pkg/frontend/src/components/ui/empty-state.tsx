import type React from 'react';
import { cn } from '~/lib/utils';
import { Button } from './button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  /** Optional secondary text below description */
  hint?: string;
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  hint,
  className,
  size = 'md',
}: EmptyStateProps) {
  const sizeConfig = {
    sm: {
      wrapper: 'py-8',
      iconBox: 'w-10 h-10 mb-3',
      title: 'text-sm font-medium',
      description: 'text-xs',
      hint: 'text-[11px]',
    },
    md: {
      wrapper: 'py-14',
      iconBox: 'w-14 h-14 mb-4',
      title: 'text-base font-semibold',
      description: 'text-sm',
      hint: 'text-xs',
    },
    lg: {
      wrapper: 'py-20',
      iconBox: 'w-16 h-16 mb-5',
      title: 'text-lg font-semibold',
      description: 'text-sm',
      hint: 'text-xs',
    },
  };

  const s = sizeConfig[size];

  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center', s.wrapper, className)}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-xl bg-muted/60 [&>svg]:h-1/2 [&>svg]:w-1/2 [&>svg]:text-muted-foreground',
          s.iconBox,
        )}
      >
        {icon}
      </div>
      <h3 className={cn(s.title, 'text-foreground')}>{title}</h3>
      <p className={cn(s.description, 'mt-1 max-w-sm text-muted-foreground')}>{description}</p>
      {hint && <p className={cn(s.hint, 'mt-1.5 max-w-xs text-muted-foreground/70')}>{hint}</p>}
      {actions && actions.length > 0 && (
        <div className="mt-5 flex items-center gap-2">
          {actions.map((action, i) => (
            <Button
              key={i}
              size="sm"
              variant={action.variant ?? (i === 0 ? 'default' : 'outline')}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
