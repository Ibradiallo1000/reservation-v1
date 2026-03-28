import React from "react";
import { Clock } from "lucide-react";

function formatDateLongFR(dateStr: string): string {
  // dateStr attendu: YYYY-MM-DD
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

export interface TripSlot {
  id: string;
  date: string;
  time: string;
  departure: string;
  arrival: string;
  price: number;
  places: number;
  remainingSeats?: number;
}

interface Props {
  slots: TripSlot[];
  selectedId: string | null;
  onSelect: (slot: TripSlot) => void;
  formatMoney: (n: number) => string;
  primaryColor: string;
  layout?: "grid" | "horizontal";
}

export const TimeSlotGrid: React.FC<Props> = ({
  slots,
  selectedId,
  onSelect,
  formatMoney,
  primaryColor,
  layout = "grid",
}) => {
  if (slots.length === 0) {
    return (
      <div className="py-4 text-center">
        <Clock className="w-5 h-5 text-gray-300 mx-auto mb-1" />
        <p className="text-xs text-gray-400">Aucun horaire disponible.</p>
      </div>
    );
  }

  const horizontal = layout === "horizontal";

  return (
    <div className={horizontal ? "overflow-x-auto overflow-y-hidden pr-1 [-ms-overflow-style:none] [scrollbar-width:none]" : "max-h-[min(50vh,28rem)] overflow-y-auto overflow-x-hidden pr-1"}>
      <div className={horizontal ? "flex gap-3" : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"}>
      {slots.map((slot) => {
        const active = selectedId === slot.id;
        const full = slot.remainingSeats !== undefined && slot.remainingSeats <= 0;
        const remainingText =
          slot.remainingSeats === undefined
            ? "Places à vérifier"
            : slot.remainingSeats <= 0
              ? "Complet"
              : `${slot.remainingSeats} place${slot.remainingSeats > 1 ? "s" : ""}`;

        return (
          <button
            key={slot.id}
            onClick={() => !full && onSelect(slot)}
            disabled={full}
            className={`relative overflow-hidden text-left p-3 rounded-xl border transition-all duration-200 ${
              full
                ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                : active
                  ? "border-2 border-current shadow"
                  : "border-gray-200 bg-white hover:border-gray-300"
            } ${horizontal ? "flex-shrink-0 min-w-[120px] sm:min-w-[170px]" : ""}`}
            style={active ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` } : undefined}
          >
            <p
              className="text-lg font-bold leading-none"
              style={active || !full ? { color: primaryColor } : undefined}
              title={`${formatDateLongFR(slot.date)} • ${slot.time}`}
            >
              {slot.time}
            </p>
            <p className="text-[11px] text-gray-600 truncate mt-1">{slot.departure} → {slot.arrival}</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">{formatMoney(slot.price)}</p>
            <p className={`text-xs mt-1 ${full ? "text-red-600" : "text-gray-500"}`}>{remainingText}</p>
          </button>
        );
      })}
      </div>
      {!horizontal && slots.length > 12 && (
        <p className="text-[10px] text-gray-400 text-center mt-1.5 pb-0.5">
          {slots.length} départs — faites défiler pour voir tout
        </p>
      )}
    </div>
  );
};
