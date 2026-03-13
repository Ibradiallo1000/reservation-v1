import { describe, it, expect } from "vitest";
import { canonicalStatut, isValidTransition } from "@/utils/reservationStatusUtils";

describe("reservationStatusUtils", () => {
  describe("canonicalStatut", () => {
    it("returns normalized statut without accents", () => {
      expect(canonicalStatut("payé")).toBe("paye");
      expect(canonicalStatut("embarqué")).toBe("embarque");
      expect(canonicalStatut("annulé")).toBe("annule");
      expect(canonicalStatut("refusé")).toBe("refuse");
      expect(canonicalStatut("validé")).toBe("confirme");
    });

    it("returns lowercase trimmed value for known statuts", () => {
      expect(canonicalStatut("confirme")).toBe("confirme");
      expect(canonicalStatut("paye")).toBe("paye");
      expect(canonicalStatut("  embarque  ")).toBe("embarque");
    });

    it("handles empty or undefined", () => {
      expect(canonicalStatut(undefined)).toBe("");
      expect(canonicalStatut("")).toBe("");
    });
  });

  describe("isValidTransition", () => {
    it("allows confirme -> embarque", () => {
      expect(isValidTransition("confirme", "embarque")).toBe(true);
    });

    it("allows paye -> annulation_en_attente", () => {
      expect(isValidTransition("paye", "annulation_en_attente")).toBe(true);
    });

    it("rejects invalid transition confirme -> rembourse", () => {
      expect(isValidTransition("confirme", "rembourse")).toBe(false);
    });

    it("allows same statut (no-op)", () => {
      expect(isValidTransition("paye", "paye")).toBe(true);
    });

    it("returns false for empty or unknown statuts", () => {
      expect(isValidTransition("", "paye")).toBe(false);
      expect(isValidTransition("paye", "")).toBe(false);
    });
  });
});
