import { COURIER_COMBINED_PRINT_CSS } from "./courierPrintStyles";

function collectDocumentAssets(): { links: string; inlineStyles: string } {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((l) => l.href && !l.href.startsWith("data:"))
    .map((l) => {
      const href = l.href.replace(/"/g, "&quot;");
      return `<link rel="stylesheet" href="${href}">`;
    })
    .join("");

  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((s) => s.outerHTML)
    .join("");

  return { links, inlineStyles };
}

/**
 * Ouvre une fenêtre avec le clone #print-root puis window.print() (ticket + étiquette, page-break dans le CSS).
 */
export function printCourierRootInNewWindow(
  element: HTMLElement,
  options: { onAfterPrint: () => void }
): boolean {
  /* Pas de noopener : certains navigateurs bloquent print/close sur la fenêtre fille. */
  const win = window.open("", "_blank");
  if (!win) return false;

  const { links, inlineStyles } = collectDocumentAssets();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    try {
      win.close();
    } catch {
      /* ignore */
    }
    options.onAfterPrint();
  };

  const failSafe = window.setTimeout(() => finish(), 12000);
  const done = () => {
    window.clearTimeout(failSafe);
    finish();
  };

  win.addEventListener("afterprint", done, { once: true });

  try {
    win.document.open();
    win.document.write(
      `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Impression</title>${links}${inlineStyles}<style>${COURIER_COMBINED_PRINT_CSS}</style></head><body style="margin:0;background:#fff">${element.outerHTML}</body></html>`
    );
    win.document.close();
  } catch {
    done();
    return false;
  }

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      done();
    }
    window.setTimeout(() => {
      if (!finished) done();
    }, 4000);
  };

  if (win.document.readyState === "complete") {
    window.setTimeout(runPrint, 150);
  } else {
    win.addEventListener("load", () => window.setTimeout(runPrint, 150), { once: true });
  }

  return true;
}

/**
 * Imprime le nœud dans une iframe dédiée (document presque vide).
 * Améliore l’aperçu avant impression sur Edge/Windows par rapport à window.print() sur la SPA lourde.
 */
export function printCourierRootInIframe(
  element: HTMLElement,
  options: { onAfterPrint: () => void }
): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Impression");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return false;
  }

  let finished = false;
  let failSafe = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(failSafe);
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
    options.onAfterPrint();
  };

  failSafe = window.setTimeout(finish, 8000);
  win.addEventListener("afterprint", finish, { once: true });

  const { links, inlineStyles } = collectDocumentAssets();

  doc.open();
  doc.write(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Impression</title>${links}${inlineStyles}<style>${COURIER_COMBINED_PRINT_CSS}</style></head><body style="margin:0;background:#fff">${element.outerHTML}</body></html>`
  );
  doc.close();

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      finish();
    }
  };

  if (doc.readyState === "complete") {
    window.setTimeout(runPrint, 200);
  } else {
    win.addEventListener("load", () => window.setTimeout(runPrint, 200), { once: true });
  }

  return true;
}
