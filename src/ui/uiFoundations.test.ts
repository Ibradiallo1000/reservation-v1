import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionButton } from "./controls/ActionButton";
import { IconButton } from "./controls/IconButton";
import { StatusBadge } from "./feedback/StatusBadge";
import { EnvironmentIndicator } from "@/shared/ui/EnvironmentIndicator";

describe("UI foundations", () => {
  it("rend les variantes Button sans casser l’API", () => {
    for (const variant of ["primary", "secondary", "outline", "ghost", "danger"] as const) {
      expect(renderToStaticMarkup(React.createElement(ActionButton, { variant }, variant))).toContain("button");
    }
  });

  it("désactive et nomme l’état loading", () => {
    const html = renderToStaticMarkup(React.createElement(ActionButton, { loading: true }, "Enregistrer"));
    expect(html).toContain("disabled");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("Chargement");
  });

  it("exige et rend le nom accessible IconButton", () => {
    expect(renderToStaticMarkup(React.createElement(IconButton, { "aria-label": "Ajouter" }, "+"))).toContain("aria-label=\"Ajouter\"");
  });

  it("conserve un texte visible dans StatusBadge", () => {
    expect(renderToStaticMarkup(React.createElement(StatusBadge, { status: "success", children: "Validé" }))).toContain("Validé");
  });

  it("affiche staging et masque la production", () => {
    const staging = renderToStaticMarkup(React.createElement(EnvironmentIndicator, { info: { environment: "staging", projectId: "teliya-staging", transport: "cloud", isLocalHost: true, isProductionProject: false } }));
    const production = renderToStaticMarkup(React.createElement(EnvironmentIndicator, { info: { environment: "production", projectId: "monbillet-95b77", transport: "cloud", isLocalHost: false, isProductionProject: true } }));
    expect(staging).toContain("STAGING");
    expect(staging).toContain("teliya-staging");
    expect(production).toBe("");
  });
});
