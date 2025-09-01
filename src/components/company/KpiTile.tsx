import React from "react";

type Props = {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
};

export default function KpiTile({ icon, label, value, hint }: Props) {
  return (
    <div className="card card-hover p-4 flex items-center gap-4">
      <div
        className="h-10 w-10 rounded-xl grid place-items-center"
        style={{ backgroundColor: "color-mix(in srgb, var(--brand-primary) 12%, white)" }}
      >
        <div className="text-white" style={{ color: "var(--brand-primary)" }}>{icon}</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </div>
        <div className="text-xl font-bold" style={{ color: "var(--text-strong)" }}>
          {value}
        </div>
        {hint && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>}
      </div>
    </div>
  );
}
