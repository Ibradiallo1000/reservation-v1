import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { NavSection } from "@/shared/layout/InternalLayout";

/**
 * Raccourcis clavier alignés avec le guichet : F2 = cycle sections.
 * À utiliser dans les layouts agence (Manager, Boarding, Fleet).
 */
export function useAgencyKeyboardShortcuts(sections: NavSection[]) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        const current = location.pathname;
        const idx = sections.findIndex(
          (s) => s.path === current || (s.end && current === s.path) || (!s.end && current.startsWith(s.path + "/"))
        );
        const nextIdx = idx < 0 ? 0 : (idx + 1) % sections.length;
        const next = sections[nextIdx];
        if (next) navigate(next.path);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sections, location.pathname, navigate]);
}
