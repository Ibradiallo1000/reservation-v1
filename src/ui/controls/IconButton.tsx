import React from "react";
import { ActionButton, type ActionButtonProps } from "./ActionButton";

export interface IconButtonProps extends Omit<ActionButtonProps, "size" | "aria-label"> {
  "aria-label": string;
  size?: "sm" | "md" | "lg";
}
const sizes = { sm: "h-11 w-11", md: "h-11 w-11", lg: "h-12 w-12" } as const;
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "md", ...props }, ref) => <ActionButton ref={ref} size="icon" className={`${sizes[size]} shrink-0 p-0 ${className ?? ""}`} {...props} />,
);
IconButton.displayName = "IconButton";
