import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { History } from "lucide-react";
import type { Timestamp } from "firebase/firestore";
import type { AgentHistoryStatus } from "@/modules/agence/services/agentHistoryService";

export const AGENT_HISTORY_EVENT_TYPES = [
  "SESSION_OPENED",
  "SESSION_CLOSED",
  "REMISSION_DONE",
  "SESSION_VALIDATED",
  "SESSION_REJECTED",
  "PAYMENT_RECEIVED",
  "COLIS_CREATED",
  "COLIS_REMIS",
  "BOARDING_SCANNED",
] as const;

export type AgentHistoryDoc = {
  id: string;
  agentId: string;
  agentName?: string;
  role: string;
  type: string;
  referenceId: string;
  amount?: number;
  status: AgentHistoryStatus;
  metadata?: Record<string, unknown>;
  createdAt?: Timestamp | null;
  createdBy: string;
  companyId: string;
  agencyId: string;
};

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== "function") return "—";
  try {
    return ts.toDate().toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function sameLocalDay(d: Date, isoDay: string): boolean {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}` === isoDay;
}

/**
 * Liste chronologique du journal agents + filtres (client sur les N derniers événements).
 */
export default function AgencyAgentHistoryPage() {
  const { pathname } = useLocation();
  const { user } = useAuth() as {
    user?: { companyId?: string; agencyId?: string };
  };
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const fromComptabilite = pathname.includes("/comptabilite/journal-agents");

  const [rows, setRows] = useState<AgentHistoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAgentId, setFilterAgentId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDate, setFilterDate] = useState("");

  useEffect(() => {
    if (!companyId || !agencyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, `companies/${companyId}/agences/${agencyId}/agentHistory`),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AgentHistoryDoc[] = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            agentId: String(x.agentId ?? ""),
            agentName: x.agentName != null ? String(x.agentName) : undefined,
            role: String(x.role ?? ""),
            type: String(x.type ?? ""),
            referenceId: String(x.referenceId ?? ""),
            amount: x.amount != null ? Number(x.amount) : undefined,
            status: (x.status as AgentHistoryStatus) ?? "EN_COURS",
            metadata: x.metadata as Record<string, unknown> | undefined,
            createdAt: (x.createdAt as Timestamp) ?? null,
            createdBy: String(x.createdBy ?? ""),
            companyId: String(x.companyId ?? companyId),
            agencyId: String(x.agencyId ?? agencyId),
          };
        });
        setRows(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("[AgencyAgentHistoryPage]", err);
        setError(err.message || "Erreur de chargement");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [companyId, agencyId]);

  const agentOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (!r.agentId) continue;
      const label = r.agentName?.trim() ? `${r.agentName} (${r.agentId.slice(0, 8)}…)` : r.agentId;
      m.set(r.agentId, label);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterAgentId && r.agentId !== filterAgentId) return false;
      if (filterType && r.type !== filterType) return false;
      if (filterDate && r.createdAt && typeof r.createdAt.toDate === "function") {
        if (!sameLocalDay(r.createdAt.toDate(), filterDate)) return false;
      }
      return true;
    });
  }, [rows, filterAgentId, filterType, filterDate]);

  if (!companyId || !agencyId) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Agence ou compagnie non disponible.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="space-y-3">
        <div className="text-sm">
          <Link
            to={fromComptabilite ? "/agence/comptabilite" : "/agence/activite"}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ← {fromComptabilite ? "Comptabilité" : "Tableau de bord"}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Journal des agents
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Dernières actions (500 événements max.) — guichet, courrier, embarquement, comptabilité.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:flex-wrap">
        <label className="flex min-w-[180px] flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          Agent
          <select
            value={filterAgentId}
            onChange={(e) => setFilterAgentId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
          >
            <option value="">Tous</option>
            {agentOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[180px] flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          Type
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
          >
            <option value="">Tous</option>
            {AGENT_HISTORY_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          Date
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-500 dark:border-gray-700">
          Aucun événement pour ces filtres.
        </div>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm [-webkit-overflow-scrolling:touch] dark:border-gray-700 dark:bg-gray-900">
          <table className="w-full min-w-[42rem] divide-y divide-gray-100 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Rôle</th>
                <th className="px-3 py-2">Réf.</th>
                <th className="px-3 py-2 text-right">Montant</th>
                <th className="px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-200">
                    {formatTs(r.createdAt ?? undefined)}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                    {r.type}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-gray-700 dark:text-gray-300" title={r.agentId}>
                    {r.agentName?.trim() || r.agentId.slice(0, 12)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-400">
                    {r.role}
                  </td>
                  <td className="max-w-[120px] truncate font-mono text-xs text-gray-600 dark:text-gray-400" title={r.referenceId}>
                    {r.referenceId}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">
                    {r.amount != null ? r.amount.toLocaleString("fr-FR") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {r.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
