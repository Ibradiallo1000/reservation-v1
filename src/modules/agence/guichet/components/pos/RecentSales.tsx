import React from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, Printer, ShoppingBag, RotateCcw } from "lucide-react";

export interface SaleRow {
  id: string;
  referenceCode?: string;
  nomClient: string;
  telephone?: string;
  depart: string;
  arrivee: string;
  date?: string;
  heure: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  statutEmbarquement?: string;
}

interface Props {
  sales: SaleRow[];
  formatMoney: (n: number) => string;
  primaryColor: string;
  onResell?: (sale: SaleRow) => void;
}

export const RecentSales: React.FC<Props> = ({ sales, formatMoney, primaryColor, onResell }) => {
  const navigate = useNavigate();
  const recent = sales.filter((s) => s.montant > 0 && s.statutEmbarquement !== "annulé").slice(-8).reverse();

  if (recent.length === 0) {
    return (
      <div className="py-6 text-center">
        <ShoppingBag className="w-6 h-6 text-gray-300 mx-auto mb-1" />
        <p className="text-sm text-gray-400">Aucune vente pour cette session.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2.5 pb-1 min-w-0">
        {recent.map((s) => (
          <div
            key={s.id}
            className="shrink-0 w-[260px] bg-white rounded-xl border border-gray-200 p-3.5 hover:shadow-sm transition group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{s.nomClient}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.depart} → {s.arrivee} • {s.heure}
                </p>
              </div>
              <span className="text-sm font-bold shrink-0" style={{ color: primaryColor }}>
                {formatMoney(s.montant)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
              <code className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                {s.referenceCode || s.id.slice(0, 8)}
              </code>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400">{s.seatsGo + (s.seatsReturn || 0)} billet(s)</span>
                {onResell && (
                  <button
                    onClick={() => onResell(s)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 transition opacity-0 group-hover:opacity-100"
                    title="Revendre le même trajet"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                  </button>
                )}
                <button
                  onClick={() => navigate(`/agence/receipt/${s.referenceCode || s.id}`)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition opacity-0 group-hover:opacity-100"
                  title="Réimprimer le reçu"
                >
                  <Printer className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
