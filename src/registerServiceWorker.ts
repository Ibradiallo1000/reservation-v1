// src/registerServiceWorker.ts
export async function registerServiceWorker(swPath = "/sw.js") {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(swPath, {
      scope: "/",
    });

    // expose some helpful logs in dev
    if (process.env.NODE_ENV !== "production") {
      console.info("[SW] registered:", registration.scope);
    }

    return registration;
  } catch (err) {
    console.warn("[SW] registration failed:", err);
    return null;
  }
}
