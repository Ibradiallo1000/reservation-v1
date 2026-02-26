import React from "react";
import { Clock } from "lucide-react";

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
}

function occupancyBar(remaining: number | undefined, total: number) {
  if (remaining === undefined) return { pct: 0, color: "bg-gray-200", text: "Calcul…", textColor: "text-gray-500" };
  const sold = Math.max(0, total - remaining);
  const pct = Math.min(100, Math.round((sold / Math.max(1, total)) * 100));
  if (remaining <= 0) return { pct: 100, color: "bg-red-500", text: "Complet", textColor: "text-red-600" };
  if (pct > 70) return { pct, color: "bg-amber-500", text: `${remaining} place${remaining > 1 ? "s" : ""}`, textColor: "text-amber-600" };
  return { pct, color: "bg-emerald-500", text: `${remaining} place${remaining > 1 ? "s" : ""}`, textColor: "text-emerald-600" };
}

export const TimeSlotGrid: React.FC<Props> = ({
  slots, selectedId, onSelect, formatMoney, primaryColor,
}) => {
  if (slots.length === 0) {
    return (
      <div className="py-4 text-center">
        <Clock className="w-5 h-5 text-gray-300 mx-auto mb-1" />
        <p className="text-xs text-gray-400">Aucun horaire pour cette date.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[min(50vh,28rem)] overflow-y-auto overflow-x-hidden pr-1">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
      {slots.map((slot) => {
        const active = selectedId === slot.id;
        const occ = occupancyBar(slot.remainingSeats, slot.places);
        const full = slot.remainingSeats !== undefined && slot.remainingSeats <= 0;

        return (
          <button
            key={slot.id}
            onClick={() => !full && onSelect(slot)}
            disabled={full}
            className={`relative text-left p-2 rounded-lg border transition-all duration-200 ${
              full
                ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                : active
                  ? "border-2 border-current shadow"
                  : "border-gray-200 bg-white hover:border-gray-300"
            }`}
            style={active ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` } : undefined}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-bold truncate" style={active || !full ? { color: primaryColor } : undefined}>
                {slot.time}
              </span>
              <span className="text-xs font-semibold text-gray-700 shrink-0">{formatMoney(slot.price)}</span>
            </div>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{slot.departure} → {slot.arrival}</p>
            <div className="mt-1 flex items-center justify-between gap-0.5">
              <span className={`text-[10px] font-medium ${occ.textColor}`}>{occ.text}</span>
              <div className="h-1 flex-1 min-w-[2rem] bg-gray-100 rounded-full overflow-hidden max-w-[3rem]">
                <div className={`h-full rounded-full ${occ.color}`} style={{ width: `${occ.pct}%` }} />
              </div>
            </div>
          </button>
        );
      })}
      </div>
      {slots.length > 12 && (
        <p className="text-[10px] text-gray-400 text-center mt-1.5 pb-0.5">
          {slots.length} départs — faites défiler pour voir tout
        </p>
      )}
    </div>
  );
};
