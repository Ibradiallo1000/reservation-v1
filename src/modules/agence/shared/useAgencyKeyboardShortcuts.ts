import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { NavSection } from "@/shared/layout/InternalLayout";

/** True if pathname belongs to this top-level section (parent path or any child). */
function pathnameMatchesSection(section: NavSection, pathname: string): boolean {
  if (pathname === section.path) return true;
  if (section.end && pathname === section.path) return true;
  if (!section.end && pathname.startsWith(section.path + "/")) return true;
  if (section.children?.length) {
    return section.children.some((c) => {
      if (c.end) return pathname === c.path;
      return pathname === c.path || pathname.startsWith(c.path + "/");
    });
  }
  return false;
}

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
        const idx = sections.findIndex((s) => pathnameMatchesSection(s, current));
        const nextIdx = idx < 0 ? 0 : (idx + 1) % sections.length;
        const next = sections[nextIdx];
        if (next) navigate(next.path);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sections, location.pathname, navigate]);
}
