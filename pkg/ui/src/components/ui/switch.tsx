import * as React from 'react';
import { cn } from '../../lib/utils';

const Switch = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative inline-flex items-center">
      <input
        type="checkbox"
        className={cn(
          'peer h-5 w-9 cursor-pointer appearance-none rounded-full bg-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 checked:bg-primary',
          className,
        )}
        ref={ref}
        {...props}
      />
      <span className="absolute block w-3 h-3 transition-transform rounded-full shadow-lg pointer-events-none left-1.5 top-1 bg-background ring-0 peer-checked:translate-x-3" />
    </div>
  ),
);
Switch.displayName = 'Switch';

export { Switch };
