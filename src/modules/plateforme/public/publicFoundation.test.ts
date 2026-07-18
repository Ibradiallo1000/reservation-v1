import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("public marketplace foundation", () => {
  it("keeps the marketing landing and installs the marketplace on the main home", () => {
    const routes = read("../../../AppRoutes.tsx");
    expect(routes).toContain('path="/landing" element={<HomePage />}');
    expect(routes).toContain("isSub ? <RouteResolver /> : <MarketplaceHomePage />");
  });

  it("exposes the canonical result and reservation entries", () => {
    const routes = read("../../../AppRoutes.tsx");
    expect(routes).toContain('path="/compagnie/:slug/resultats"');
    expect(routes).toContain('path="/reservation"');
  });

  it("ships accessible, responsive marketplace landmarks and SEO discovery files", () => {
    const marketplace = read("./MarketplaceHomePage.tsx");
    const robots = read("../../../../public/robots.txt");
    const sitemap = read("../../../../public/sitemap.xml");
    expect(marketplace).toContain('aria-label="Rechercher un trajet"');
    expect(marketplace).toContain("md:grid-cols-");
    expect(marketplace.match(/<h1/g)).toHaveLength(1);
    expect(robots).toContain("Sitemap: https://teliya.app/sitemap.xml");
    expect(sitemap).toContain("https://teliya.app/landing");
  });
});
