// src/components/ui/skeleton.tsx
import React from "react";

type Props = React.HTMLAttributes<HTMLDivElement>;

/** Export nommé */
export const Skeleton: React.FC<Props> = ({ className = "", ...rest }) => (
  <div
    className={`animate-pulse rounded-md bg-gray-200 ${className}`}
    {...rest}
  />
);

/** Export par défaut (compat) */
export default Skeleton;
