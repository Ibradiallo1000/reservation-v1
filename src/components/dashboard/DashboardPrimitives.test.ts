import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Activity } from "lucide-react";
import { describe, expect, it } from "vitest";
import { DashboardEmptyState, DashboardKpi, DashboardSection, DashboardSkeleton } from "./DashboardPrimitives";

describe("dashboard presentation primitives", () => {
  it("renders an accessible KPI without replacing unavailable data by zero", () => {
    const html = renderToStaticMarkup(React.createElement(DashboardKpi, {
      label: "Activité", value: "Donnée indisponible", context: "Source non disponible", icon: Activity, unavailable: true,
    }));
    expect(html).toContain("Donnée indisponible");
    expect(html).not.toContain(">0<");
  });

  it("announces loading and respects reduced motion", () => {
    const html = renderToStaticMarkup(React.createElement(DashboardSkeleton));
    expect(html).toContain('role="status"');
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("uses a section heading and distinguishes an empty state", () => {
    const empty = React.createElement(DashboardEmptyState, { title: "Aucune donnée", description: "La source est vide." });
    const html = renderToStaticMarkup(React.createElement(DashboardSection, { title: "Compagnies", children: empty }));
    expect(html).toContain("<h2");
    expect(html).toContain("Aucune donnée");
  });
});
