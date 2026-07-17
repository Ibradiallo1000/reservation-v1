import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5", className)}>
      <header className="mb-4">
        <h2 className="text-sm font-bold text-slate-950 sm:text-base">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function DashboardKpi({
  label,
  value,
  context,
  icon: Icon,
  unavailable = false,
}: {
  label: string;
  value: ReactNode;
  context: string;
  icon: ComponentType<{ className?: string }>;
  unavailable?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={cn("mt-2 truncate text-2xl font-black tabular-nums text-slate-950", unavailable && "text-slate-500")}>
            {value}
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{context}</p>
    </article>
  );
}

export function DashboardEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

export function DashboardSkeleton({ label = "Chargement des indicateurs" }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="h-16 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />)}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
    </div>
  );
}
