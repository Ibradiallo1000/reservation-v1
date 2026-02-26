import React, { useRef, useEffect } from "react";

interface Props {
  dates: string[];
  selected: string;
  hasTrips: (date: string) => boolean;
  onSelect: (date: string) => void;
  primaryColor: string;
}

const DAY_SHORT: Record<string, string> = {
  Mon: "Lun", Tue: "Mar", Wed: "Mer", Thu: "Jeu", Fri: "Ven", Sat: "Sam", Sun: "Dim",
};

export const DateStrip: React.FC<Props> = ({ dates, selected, hasTrips, onSelect, primaryColor }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current || !selected) return;
    const active = scrollRef.current.querySelector("[data-active=true]") as HTMLElement | null;
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  return (
    <div ref={scrollRef} className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-0.5 px-0.5">
      {dates.map((d) => {
        const dt = new Date(d + "T00:00:00");
        const has = hasTrips(d);
        const act = selected === d;
        const dayEN = dt.toLocaleDateString("en-US", { weekday: "short" });
        const dayLabel = DAY_SHORT[dayEN] || dayEN;
        const isToday = d === new Date().toISOString().split("T")[0];

        return (
          <button
            key={d}
            data-active={act || undefined}
            disabled={!has}
            onClick={() => has && onSelect(d)}
            className={`shrink-0 w-11 py-1.5 rounded-lg border text-center transition-all duration-200
              ${act
                ? "text-white shadow border-current"
                : has
                  ? "border-gray-200 bg-white hover:border-gray-300"
                  : "border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed"
              }`}
            style={act ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
          >
            <p className={`text-[10px] font-medium leading-tight ${act ? "text-white/90" : "text-gray-500"}`}>
              {dayLabel}
            </p>
            <p className={`text-sm font-bold leading-tight ${act ? "" : "text-gray-900"}`}>
              {dt.getDate()}
            </p>
            {isToday && (
              <div className={`mx-auto mt-0.5 w-0.5 h-0.5 rounded-full ${act ? "bg-white" : ""}`}
                style={!act ? { backgroundColor: primaryColor } : undefined} />
            )}
          </button>
        );
      })}
    </div>
  );
};
