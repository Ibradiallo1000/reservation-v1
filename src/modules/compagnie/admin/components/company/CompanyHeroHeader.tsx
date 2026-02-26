import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

export default function CompanyHeroHeader({ title, subtitle, right }: Props) {
  return (
    <div
      className="rounded-xl p-6 md:p-8 mb-6"
      style={{ backgroundColor: "var(--brand-primary)" }}
    >
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--brand-secondary)" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm md:text-base opacity-90" style={{ color: "#fff" }}>
              {subtitle}
            </p>
          )}
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </div>
  );
}
