import React from "react";
import { BRAND_ORANGE } from "@/theme/brand";

type Props = {
  height?: number;
  color?: string;
  className?: string;
  onClick?: () => void;
};

const BrandLogo: React.FC<Props> = ({
  height = 28,
  color = BRAND_ORANGE,
  className,
  onClick
}) => {
  return (
    <div
      role="button"
      aria-label="Teliya – Accueil"
      onClick={onClick}
      className={`flex items-center gap-2 select-none cursor-pointer ${className || ""}`}
      style={{ lineHeight: 0 }}
    >
      {/* ⚠️ Remplace par ton SVG officiel si tu l’as */}
      <svg width={height} height={height} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 7l12-4-4 6 12 4-18 4 6-6z" fill={color} />
      </svg>

      {/* Wordmark (remplacer par le tracé officiel si disponible) */}
      <svg height={Math.round(height * 0.9)} viewBox="0 0 120 24" aria-label="Teliya">
        <text
          x="0" y="18"
          fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
          fontWeight="700" fontSize="18"
          fill={color}
        >
          Teliya
        </text>
      </svg>
    </div>
  );
};

export default BrandLogo;
