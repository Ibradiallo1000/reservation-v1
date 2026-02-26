import { useState, useEffect } from "react";

const STORAGE_KEY = "theme";

/** Mode sombre partagé pour tous les espaces agence. Persisté en localStorage (key: "theme"). Default = light. */
export function useAgencyDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      let v = localStorage.getItem(STORAGE_KEY);
      if (v === null) {
        const legacy = localStorage.getItem("agency-dark-mode");
        v = legacy === "1" ? "dark" : "light";
      }
      setDark(v === "dark");
    } catch {
      setDark(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      } catch {}
      return next;
    });
  };

  return [dark, toggle];
}
