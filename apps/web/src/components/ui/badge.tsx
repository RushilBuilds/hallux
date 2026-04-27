import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'critical' | 'high' | 'medium' | 'low' | 'outline';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-accent-dim text-accent border border-accent/30',
  critical: 'bg-red-950/50 text-red-400 border border-red-900/50',
  high: 'bg-orange-950/50 text-orange-400 border border-orange-900/50',
  medium: 'bg-yellow-950/50 text-yellow-400 border border-yellow-900/50',
  low: 'bg-blue-950/50 text-blue-400 border border-blue-900/50',
  outline: 'bg-transparent text-foreground-muted border border-card-border',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/**
 * Small label badge. Includes severity-specific color variants.
 */
export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-mono font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
