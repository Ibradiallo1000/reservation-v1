import React, { useMemo } from "react";
import { X, Printer, CheckCircle2, Clock, Ticket, Banknote } from "lucide-react";

interface SaleRow {
  depart: string;
  arrivee: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  statutEmbarquement?: string;
}

interface Props {
  open: boolean;
  tickets: SaleRow[];
  sessionStart: Date | null;
  sessionEnd: Date | null;
  userName: string;
  userCode: string;
  formatMoney: (n: number) => string;
  primaryColor: string;
  secondaryColor: string;
  onPrint: () => void;
  onClose: () => void;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m} min`;
}

export const SessionSummaryModal: React.FC<Props> = ({
  open, tickets, sessionStart, sessionEnd,
  userName, userCode, formatMoney,
  primaryColor, secondaryColor, onPrint, onClose,
}) => {
  const summary = useMemo(() => {
    const active = tickets.filter((t) => t.statutEmbarquement !== "annulé" && t.montant > 0);
    const canceled = tickets.filter((t) => t.statutEmbarquement === "annulé" || t.montant === 0);
    const totalSeats = active.reduce((a, t) => a + (t.seatsGo || 0) + (t.seatsReturn || 0), 0);
    const totalRevenue = active.reduce((a, t) => a + (t.montant || 0), 0);

    const byRoute: Record<string, { route: string; billets: number; montant: number }> = {};
    for (const t of active) {
      const key = `${t.depart}→${t.arrivee}`;
      if (!byRoute[key]) byRoute[key] = { route: key, billets: 0, montant: 0 };
      byRoute[key].billets += (t.seatsGo || 0) + (t.seatsReturn || 0);
      byRoute[key].montant += t.montant || 0;
    }
    return { totalSeats, totalRevenue, canceledCount: canceled.length, routes: Object.values(byRoute) };
  }, [tickets]);

  const duration = sessionStart && sessionEnd
    ? fmtDuration(sessionEnd.getTime() - sessionStart.getTime())
    : sessionStart
      ? fmtDuration(Date.now() - sessionStart.getTime())
      : "—";

  if (!open) return null;

  const gradient = `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between" style={{ background: `${primaryColor}08` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full grid place-items-center text-white" style={{ background: gradient }}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Session clôturée</h2>
              <p className="text-xs text-gray-500">{userName} ({userCode})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <Ticket className="w-5 h-5 mx-auto text-gray-400 mb-1" />
              <p className="text-2xl font-black" style={{ color: primaryColor }}>{summary.totalSeats}</p>
              <p className="text-[11px] text-gray-500">Billets vendus</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <Banknote className="w-5 h-5 mx-auto text-gray-400 mb-1" />
              <p className="text-2xl font-black" style={{ color: primaryColor }}>{formatMoney(summary.totalRevenue)}</p>
              <p className="text-[11px] text-gray-500">Recette totale</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <Clock className="w-5 h-5 mx-auto text-gray-400 mb-1" />
              <p className="text-2xl font-black text-gray-900">{duration}</p>
              <p className="text-[11px] text-gray-500">Durée</p>
            </div>
          </div>

          {summary.canceledCount > 0 && (
            <div className="text-xs text-center text-red-600 bg-red-50 rounded-lg py-1.5">
              {summary.canceledCount} annulation{summary.canceledCount > 1 ? "s" : ""}
            </div>
          )}

          {/* Breakdown by route */}
          {summary.routes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Répartition par trajet</h3>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/60 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Trajet</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Billets</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.routes.map((r) => (
                      <tr key={r.route}>
                        <td className="px-4 py-2 text-gray-700">{r.route}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{r.billets}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMoney(r.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Time info */}
          <div className="flex items-center justify-between text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2">
            <span>Début : {sessionStart ? sessionStart.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            <span>Fin : {sessionEnd ? sessionEnd.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onPrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            <Printer className="w-4 h-4" /> Imprimer le résumé
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90"
            style={{ background: gradient }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
