import * as React from 'react';
import { cn } from '@/lib/utils'; // Assure-toi que cette fonction utilitaire existe

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('w-full h-2 bg-muted rounded-full', className)}
        {...props}
      >
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    );
  }
);

Progress.displayName = 'Progress';
