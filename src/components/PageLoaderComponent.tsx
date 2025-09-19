import React from "react";

/** Loader plein écran cohérent avec le splash */
export default function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    fullScreen ? (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#f97316",        // 🟧 même fond que le splash
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
      >
        {children}
      </div>
    ) : (
      <div style={{ padding: "2rem" }}>{children}</div>
    );

  return (
    <Wrapper>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", color: "white" }}>
        <img
          src="/images/teliya-logo.jpg"   // 🔁 même image (depuis /public/images)
          alt="Teliya"
          width={72}
          height={72}
          style={{
            borderRadius: "50%",
            animation: "pulse 1.2s ease-in-out infinite",
          }}
        />
        <div style={{ marginTop: 10, opacity: 0.95 }}>Chargement…</div>
      </div>

      {/* petite animation inline (évite CSS global) */}
      <style>{`
        @keyframes pulse {
          0%{transform:scale(1);opacity:1}
          50%{transform:scale(1.12);opacity:.92}
          100%{transform:scale(1);opacity:1}
        }
      `}</style>
    </Wrapper>
  );
}
