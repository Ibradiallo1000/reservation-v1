/**
 * Teliya Design System — Single authoritative UI foundation.
 * Use across: Agence, Comptable, CEO, Guichet, Courrier, Compagnie, Admin, Auth.
 *
 * Import from "@/ui" or "@/ui/layout", "@/ui/cards", etc.
 */

// Foundation tokens
export {
  spacing,
  spacingClasses,
  pagePaddingX,
  pagePaddingY,
  pagePadding,
  pageVerticalGap,
  pageMaxWidth,
  typography,
  radius,
  shadows,
  transitions,
  statusVariants,
  table,
  tableRowClassName,
} from "./foundation";
export type {
  TypographyKey,
  RadiusKey,
  ShadowKey,
  TransitionKey,
  StatusVariant,
} from "./foundation";

// Layout
export { StandardLayoutWrapper, PageHeader } from "./layout";
export type { StandardLayoutWrapperProps, PageHeaderProps } from "./layout";

// Cards
export { SectionCard, MetricCard } from "./cards";
export type { SectionCardProps, MetricCardProps } from "./cards";

// Feedback
export { StatusBadge, EmptyState, AlertMessage } from "./feedback";
export type { StatusBadgeProps, EmptyStateProps, AlertMessageProps, AlertSeverity } from "./feedback";

// Controls
export { ActionButton, Input } from "./controls";
export type {
  ActionButtonProps,
  ActionButtonVariant,
  ActionButtonSize,
  InputProps,
} from "./controls";
