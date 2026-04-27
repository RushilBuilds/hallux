import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default:
    'bg-accent text-background font-semibold hover:opacity-90 active:opacity-80',
  outline:
    'border border-card-border bg-transparent text-foreground hover:bg-accent-dim hover:border-accent',
  ghost:
    'bg-transparent text-foreground-muted hover:text-foreground hover:bg-accent-dim',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
};

/**
 * Primary button component. Supports default (teal fill), outline, and ghost variants.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    // Strip any unknown props that shouldn't land on the DOM element.
    const { ...domProps } = props;
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 font-mono',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...domProps}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
