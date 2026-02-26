// src/components/common/MyBookingsCTA.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Ticket } from "lucide-react";

interface Props {
  slug?: string; // si fourni → page compagnie, sinon → plateforme globale
}

const MyBookingsCTA: React.FC<Props> = ({ slug }) => {
  const navigate = useNavigate();

  const goToMyBookings = () => {
    if (slug) {
      navigate(`/${slug}/mes-reservations`);
    } else {
      navigate(`/mes-reservations`);
    }
  };

  return (
    <div className="w-full flex justify-center">
      <button
        onClick={goToMyBookings}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold bg-orange-600 text-white shadow-md hover:bg-orange-700 transition"
      >
        <Ticket className="h-5 w-5" />
        Voir mes réservations
      </button>
    </div>
  );
};

export default MyBookingsCTA;
