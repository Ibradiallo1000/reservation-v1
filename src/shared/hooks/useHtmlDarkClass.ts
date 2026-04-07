import { useSyncExternalStore } from "react";

function subscribeDarkClass(cb: () => void) {
  const root = document.documentElement;
  const mo = new MutationObserver(cb);
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

function snapshotDarkClass() {
  return document.documentElement.classList.contains("dark");
}

/** Suit la classe `dark` sur `<html>` (thème Tailwind). */
export function useHtmlDarkClass(): boolean {
  return useSyncExternalStore(subscribeDarkClass, snapshotDarkClass, () => false);
}
