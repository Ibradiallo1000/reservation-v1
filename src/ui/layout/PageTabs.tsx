import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageTabItem<T extends string = string> = {
  key: T;
  label: string;
  icon?: LucideIcon;
};

export interface PageTabsProps<T extends string = string> {
  items: PageTabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
  accentColor?: string;
}

const DEFAULT_ACCENT = "var(--teliya-primary, #FF6600)";

export function PageTabs<T extends string = string>({
  items,
  activeKey,
  onChange,
  className,
  accentColor = DEFAULT_ACCENT,
}: PageTabsProps<T>) {
  return (
    <div className={cn("mb-4 border-b border-gray-200 pb-3 dark:border-slate-600", className)}>
      <div className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1">
        {items.map(({ key, label, icon: Icon }) => {
          const active = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              style={active ? { backgroundColor: accentColor } : undefined}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

PageTabs.displayName = "PageTabs";
