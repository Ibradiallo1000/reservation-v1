// input.tsx
import * as React from 'react';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={`border border-gray-300 rounded px-3 py-2 w-full ${className || ''}`}
    {...props}
  />
));
Input.displayName = 'Input';
