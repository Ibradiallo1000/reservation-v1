
// src/components/ui/separator.tsx

import * as React from "react";

export const Separator = React.forwardRef<
  HTMLHRElement,
  React.HTMLAttributes<HTMLHRElement>
>(({ className = "", ...props }, ref) => (
  <hr
    ref={ref}
    className={`shrink-0 border border-gray-200 ${className}`}
    {...props}
  />
));

Separator.displayName = "Separator";
