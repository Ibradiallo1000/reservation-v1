import { useState, useEffect } from "react";

const STORAGE_KEY = "theme";

/** Mode sombre partagé pour tous les espaces agence. Persisté en localStorage (key: "theme"). Default = light. */
export function useAgencyDarkMode(storageKey = STORAGE_KEY): [boolean, () => void] {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      let v = localStorage.getItem(storageKey);
      if (v === null) {
        const legacy = localStorage.getItem("agency-dark-mode");
        v = legacy === "1" ? "dark" : "light";
      }
      setDark(v === "dark");
    } catch {
      setDark(false);
    }
  }, [storageKey]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setDark(event.newValue === "dark");
    };
    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; theme?: string }>).detail;
      if (detail?.key !== storageKey) return;
      setDark(detail.theme === "dark");
    };

    window.addEventListener?.("storage", onStorage);
    window.addEventListener?.("teliya:theme-change", onThemeChange);
    return () => {
      window.removeEventListener?.("storage", onStorage);
      window.removeEventListener?.("teliya:theme-change", onThemeChange);
    };
  }, [storageKey]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "dark" : "light");
        window.dispatchEvent(new CustomEvent("teliya:theme-change", { detail: { key: storageKey, theme: next ? "dark" : "light" } }));
      } catch {}
      return next;
    });
  };

  return [dark, toggle];
}
