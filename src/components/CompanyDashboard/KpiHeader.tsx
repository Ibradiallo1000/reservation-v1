// =============================================
// src/components/CompanyDashboard/KpiHeader.tsx
// =============================================
import React from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Item = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  /** chemin optionnel : si présent, la carte devient cliquable */
  to?: string;
};

export function KpiHeader({
  loading,
  couleurPrimaire,
  couleurSecondaire,
  items,
}: {
  loading: boolean;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  items: Item[];
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const primary = couleurPrimaire || "#b91c1c";
  const secondary = couleurSecondaire || "#f59e0b";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {items.map((it, idx) => {
        const Icon = it.icon;
        const clickable = Boolean(it.to);
        return (
          <div
            key={idx}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : -1}
            onClick={() => it.to && navigate(it.to)}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                navigate(it.to!);
              }
            }}
            className={cn(
              "rounded-xl border bg-white p-4 transition-all duration-200 select-none",
              "flex items-center gap-3",
              clickable ? "cursor-pointer hover:shadow-md" : "cursor-default"
            )}
          >
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ background: secondary }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{it.label}</p>
              <p className="text-lg font-semibold leading-tight truncate" style={{ color: primary }}>
                {it.value}
              </p>
              {it.sub && (
                <p className="text-[11px] text-muted-foreground truncate">{it.sub}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
