import React from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CompanySettingsSection<Key extends string = string> = {
  key: Key;
  label: string;
  icon: LucideIcon;
};

type CompanySettingsLayoutProps<Key extends string> = {
  sections: readonly CompanySettingsSection<Key>[];
  activeSection: Key;
  onSectionChange: (section: Key) => void;
  accentColor: string;
  children: React.ReactNode;
};

export default function CompanySettingsLayout<Key extends string>({
  sections,
  activeSection,
  onSectionChange,
  accentColor,
  children,
}: CompanySettingsLayoutProps<Key>) {
  const active = sections.find((section) => section.key === activeSection) ?? sections[0];
  const ActiveIcon = active?.icon;

  return (
    <div className="min-w-0">
      <div className="mb-4 lg:hidden">
        <label htmlFor="company-settings-section" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Sections
        </label>
        <div className="relative">
          {ActiveIcon ? (
            <ActiveIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-300" />
          ) : null}
          <select
            id="company-settings-section"
            value={activeSection}
            onChange={(event) => onSectionChange(event.target.value as Key)}
            className="min-h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            style={{ "--tw-ring-color": `${accentColor}55` } as React.CSSProperties}
          >
            {sections.map((section) => (
              <option key={section.key} value={section.key}>
                {section.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-300" />
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav
            aria-label="Sections de configuration"
            className="sticky top-4 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {sections.map((section) => {
              const Icon = section.icon;
              const selected = section.key === activeSection;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => onSectionChange(section.key)}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    selected
                      ? "border-transparent text-slate-950 shadow-sm dark:text-white"
                      : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white",
                  )}
                  style={selected ? { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}55` } : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" style={selected ? { color: accentColor } : undefined} />
                  <span className="min-w-0 truncate">{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section
          aria-label={active?.label}
          className="min-w-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1"
        >
          {children}
        </section>
      </div>
    </div>
  );
}
