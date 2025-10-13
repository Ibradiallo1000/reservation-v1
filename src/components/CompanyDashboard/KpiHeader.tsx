import React from "react";
import { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

interface KpiItem {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  to?: string;
}

interface KpiHeaderProps {
  items: KpiItem[];
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  loading?: boolean;
}

/**
 * Affiche une rangée de KPI (indicateurs chiffrés)
 * avec icônes, valeur et sous-texte.
 * Utilisé dans le Dashboard Compagnie.
 */
export const KpiHeader: React.FC<KpiHeaderProps> = ({
  items,
  couleurPrimaire = "#f97316", // orange
  couleurSecondaire = "#fb923c", // orange clair
  loading = false,
}) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {items.map(({ icon: Icon, label, value, sub, to }, i) => {
        const card = (
          <div
            key={i}
            className="p-4 rounded-xl shadow-sm bg-white border border-gray-100 flex flex-col gap-2 transition hover:shadow-md hover:-translate-y-0.5"
            style={{
              borderTop: `3px solid ${couleurPrimaire}`,
            }}
          >
            <div className="flex items-center gap-2 text-gray-700">
              <Icon
                size={20}
                style={{ color: couleurPrimaire }}
                className="flex-shrink-0"
              />
              <span className="font-medium text-sm">{label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: couleurPrimaire }}>
              {value}
            </div>
            {sub && (
              <div className="text-xs text-gray-500" style={{ color: couleurSecondaire }}>
                {sub}
              </div>
            )}
          </div>
        );

        return to ? (
          <button
            key={i}
            onClick={() => navigate(to)}
            className="text-left focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-xl transition"
            style={{
              boxShadow: "none",
            }}
          >
            {card}
          </button>
        ) : (
          card
        );
      })}
    </div>
  );
};
