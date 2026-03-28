import React, { useRef, useEffect } from "react";

interface Props {
  dates: string[];
  selected: string;
  hasTrips: (date: string) => boolean;
  onSelect: (date: string) => void;
  primaryColor: string;
  compact?: boolean;
}

const DAY_SHORT: Record<string, string> = {
  Mon: "Lun", Tue: "Mar", Wed: "Mer", Thu: "Jeu", Fri: "Ven", Sat: "Sam", Sun: "Dim",
};

export const DateStrip: React.FC<Props> = ({ dates, selected, hasTrips, onSelect, primaryColor, compact = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current || !selected) return;
    const active = scrollRef.current.querySelector("[data-active=true]") as HTMLElement | null;
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  const btnW = compact ? "w-8 py-0.5" : "w-11 py-1.5";
  const dayCls = compact ? "text-[8px]" : "text-[10px]";
  const numCls = compact ? "text-[11px]" : "text-sm";

  return (
    <div ref={scrollRef} className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 scrollbar-none sm:gap-1.5">
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
            className={`shrink-0 rounded-lg border text-center transition-all duration-200 ${btnW}
              ${
                act
                  ? "border-current text-white shadow"
                  : has
                    ? "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-950"
                    : "cursor-not-allowed border-gray-100 bg-gray-50 opacity-40 dark:border-gray-800"
              }`}
            style={act ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
          >
            <p className={`font-medium leading-tight ${dayCls} ${act ? "text-white/90" : "text-gray-500"}`}>{dayLabel}</p>
            <p className={`font-bold leading-tight ${numCls} ${act ? "" : "text-gray-900 dark:text-gray-100"}`}>
              {dt.getDate()}
            </p>
            {isToday && (
              <div
                className={`mx-auto mt-0.5 h-0.5 w-0.5 rounded-full ${act ? "bg-white" : ""}`}
                style={!act ? { backgroundColor: primaryColor } : undefined}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
