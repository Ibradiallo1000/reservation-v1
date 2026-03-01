/**
 * Teliya Design System — Semantic status tokens (authoritative).
 * Use ONLY via StatusBadge component. No raw emerald/red/yellow classes outside StatusBadge.
 * Tailwind classes are internal to the StatusBadge implementation.
 */
export const statusVariants = [
  "success",
  "warning",
  "danger",
  "info",
  "neutral",
  "active",
  "pending",
  "completed",
  "cancelled",
] as const;

export type StatusVariant = (typeof statusVariants)[number];

/** Internal Tailwind class pairs for StatusBadge. Do not use directly in page code. */
export const statusBadgeClasses: Record<StatusVariant, { bg: string; text: string }> = {
  success: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-200" },
  warning: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-200" },
  danger: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200" },
  info: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-800 dark:text-blue-200" },
  neutral: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" },
  active: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-200" },
  pending: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-200" },
  completed: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-200" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200" },
};
