import React, { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  logo: string;
  minMs?: number;
  maxMs?: number;
  extraHoldMs?: number;
  sizePx?: number;            // diamètre du médaillon logo
  ringWidthPx?: number;       // épaisseur de l’anneau qui tourne
  ringOpacity?: number;       // opacité de l’anneau (0–1)
  spinnerSpeedMs?: number;    // vitesse de rotation
  preload?: string[];
};

function preloadImages(urls: string[] = [], timeoutMs = 2500): Promise<void> {
  if (!urls.length) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(); }
    }, timeoutMs);
    let loaded = 0, total = urls.length;
    const finish = () => { if (!done && ++loaded >= total) { done = true; clearTimeout(timer); resolve(); } };
    urls.forEach((src) => { const img = new Image(); img.onload = finish; img.onerror = finish; img.src = src; });
  });
}

const SplashScreen: React.FC<Props> = ({
  children,
  logo,
  minMs = 900,
  maxMs = 1800,
  extraHoldMs = 600,
  sizePx = 140,
  ringWidthPx = 2,          // anneau très fin par défaut
  ringOpacity = 0.55,       // plus discret
  spinnerSpeedMs = 900,     // vitesse de rotation
  preload = [],
}) => {
  const [hidden, setHidden] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const startedAt = useRef<number>(performance.now());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const elapsed = performance.now() - startedAt.current;
      const waitMin = Math.max(0, minMs - elapsed);
      const waitMax = Math.max(0, maxMs - elapsed);

      await new Promise((r) => setTimeout(r, waitMin));
      await preloadImages(preload);
      if (extraHoldMs > 0) await new Promise((r) => setTimeout(r, extraHoldMs));

      const elapsed2 = performance.now() - startedAt.current;
      const rest = Math.max(0, maxMs - elapsed2);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));

      if (cancelled) return;
      setFadeOut(true);
      setTimeout(() => { if (!cancelled) setHidden(true); }, 260);
    };
    run();
    return () => { cancelled = true; };
  }, [minMs, maxMs, extraHoldMs, preload]);

  const spinnerSize = sizePx + 18; // léger dépassement autour du logo

  return (
    <>
      {children}

      {!hidden && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "#f97316",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2147483000,
            transition: "opacity 240ms ease",
            opacity: fadeOut ? 0 : 1,
            pointerEvents: "none",
          }}
        >
          {/* Conteneur relatif pour caler le logo + spinner */}
          <div style={{ position: "relative", width: spinnerSize, height: spinnerSize }}>
            {/* Anneau qui tourne */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "9999px",
                border: `${ringWidthPx}px solid rgba(255,255,255,${ringOpacity})`,
                borderTopColor: "#ffffff",                        // « pointe » plus visible
                animation: `teliya-spin ${spinnerSpeedMs}ms linear infinite`,
              }}
            />
            {/* Médaillon logo (discret, sans grosse bordure) */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: sizePx,
                height: sizePx,
                borderRadius: "9999px",
                background: "white",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 4px 18px rgba(0,0,0,.12)",
              }}
            >
              <img
                src={logo}
                alt="Teliya"
                style={{
                  width: "70%",
                  height: "70%",
                  objectFit: "contain",
                  borderRadius: "50%",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
                decoding="async"
                loading="eager"
              />
            </div>
          </div>

          {/* keyframes */}
          <style>{`
            @keyframes teliya-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default SplashScreen;
