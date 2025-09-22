// src/components/ResumeLastReservation.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Ticket } from "lucide-react";

interface ResumeLastReservationProps {
  /** Filtrer pour une compagnie spécifique */
  onlyForSlug?: string;
  /** Couleur primaire du thème */
  primaryColor?: string;
  /** Couleur secondaire du thème */
  secondaryColor?: string;
}

const ResumeLastReservation: React.FC<ResumeLastReservationProps> = ({
  onlyForSlug,
  primaryColor = "#ea580c",   // fallback orange
  secondaryColor = "#f97316",  // fallback orange clair
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onlyForSlug) {
      navigate(`/${onlyForSlug}/mes-reservations`);
    } else {
      navigate(`/mes-reservations`);
    }
  };

  return (
    <div className="w-full text-center">
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white shadow-md transition"
        style={{
          background: `linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
          boxShadow: `0 6px 14px -4px ${primaryColor}55`,
        }}
      >
        <Ticket className="w-5 h-5" />
        Voir mes réservations
      </button>
    </div>
  );
};

export default ResumeLastReservation;
