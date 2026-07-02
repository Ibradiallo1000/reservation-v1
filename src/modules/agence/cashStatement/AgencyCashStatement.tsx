import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ActionButton, SectionCard } from "@/ui";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  buildAgencyCashStatementSummary,
  loadAgencyCashStatementCached,
} from "./agencyCashStatementService";
import type {
  AgencyCashStatementFilter,
  AgencyCashStatementResult,
} from "./agencyCashStatementTypes";

type DatePreset = "today" | "7d" | "30d" | "month" | "custom";

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "today", label: "Aujourd’hui" },
  { value: "7d", label: "7 jours" },
  { value: "30d", label: "30 jours" },
  { value: "month", label: "Ce mois" },
  { value: "custom", label: "Personnalisé" },
];

const TYPE_FILTERS: Array<{ value: AgencyCashStatementFilter; label: string }> = [
  { value: "all", label: "Tous les mouvements" },
  { value: "entries", label: "Entrées" },
  { value: "exits", label: "Sorties" },
  { value: "expenses", label: "Dépenses" },
  { value: "transfers", label: "Transferts" },
  { value: "validations", label: "Validations de postes" },
];

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function parseDateInput(value: string, end = false): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return end ? endOfDay(date) : startOfDay(date);
}

function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "custom") {
    return {
      from: parseDateInput(customFrom) ?? startOfDay(now),
      to: parseDateInput(customTo, true) ?? endOfDay(now),
    };
  }
  if (preset === "month") {
    return {
      from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: endOfDay(now),
    };
  }
  if (preset === "7d" || preset === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - (preset === "7d" ? 6 : 29));
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statusLabel(status: string): string {
  if (status === "confirmed" || status === "posted" || status === "received") return "Comptabilisé";
  if (status === "verified") return "Vérifié";
  if (status === "refunded") return "Remboursé";
  return status || "—";
}

type AgencyCashStatementProps = {
  initialRange?: {
    from: Date;
    to: Date;
  };
  mode?: "accountant" | "manager";
  includeLegacyLedger?: boolean;
  tolerateSecondarySourceErrors?: boolean;
};

export default function AgencyCashStatement({
  initialRange,
  mode = "accountant",
  includeLegacyLedger,
  tolerateSecondarySourceErrors,
}: AgencyCashStatementProps = {}) {
  const { user, company } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const companyName = company?.nom ?? company?.name ?? "Compagnie";
  const agencyName = user?.agencyNom ?? user?.agencyName ?? "Agence";

  const [preset, setPreset] = useState<DatePreset>(() => (initialRange ? "custom" : "month"));
  const [customFrom, setCustomFrom] = useState(() =>
    initialRange ? formatInputDate(initialRange.from) : formatInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  );
  const [customTo, setCustomTo] = useState(() => formatInputDate(initialRange?.to ?? new Date()));
  const [typeFilter, setTypeFilter] = useState<AgencyCashStatementFilter>("all");
  const [result, setResult] = useState<AgencyCashStatementResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const load = useCallback(async (force = false) => {
    if (!companyId || !agencyId) {
      setError("Compagnie ou agence introuvable.");
      setLoading(false);
      return;
    }
    if (range.from > range.to) {
      setError("La date de début doit précéder la date de fin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadAgencyCashStatementCached(
        {
          companyId,
          agencyId,
          from: range.from,
          to: range.to,
        },
        {
          force,
          mode,
          includeLegacyLedger,
          tolerateSecondarySourceErrors,
        }
      );
      setResult(next);
    } catch (loadError) {
      console.error("[AgencyCashStatement] load failed", loadError);
      setResult(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger le relevé de caisse."
      );
    } finally {
      setLoading(false);
    }
  }, [agencyId, companyId, includeLegacyLedger, mode, range.from, range.to, tolerateSecondarySourceErrors]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => (result ? buildAgencyCashStatementSummary(result, typeFilter) : null),
    [result, typeFilter]
  );
  const filteredRows = summary?.rows ?? [];

  const periodLabel = `${range.from.toLocaleDateString("fr-FR")} au ${range.to.toLocaleDateString("fr-FR")}`;
  const currency = result?.currency ?? "XOF";

  const exportCsv = () => {
    if (!filteredRows.length) return;
    const header = ["Date", "Référence", "Type", "Libellé", "Entrée", "Sortie", "Statut", "Source"];
    const rows = filteredRows.map((row) => [
      row.date.toLocaleString("fr-FR"),
      row.reference,
      row.typeLabel,
      row.label,
      row.entry || "",
      row.exit || "",
      statusLabel(row.status),
      row.source === "comptaEncaissements"
        ? "Encaissement comptable"
        : row.source === "legacyLedger"
          ? "Ledger validation"
          : "Journal financier",
    ]);
    rows.push([]);
    rows.push(["Total entrées", "", "", "", summary?.totalEntries ?? 0, "", "", ""]);
    rows.push(["Total sorties", "", "", "", "", summary?.totalExits ?? 0, "", ""]);
    rows.push(["Net période", "", "", "", summary?.net ?? 0, "", "", ""]);
    rows.push(["Solde caisse actuel", "", "", "", summary?.currentBalance ?? 0, "", "", ""]);

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `releve_caisse_${agencyId}_${formatInputDate(range.from)}_${formatInputDate(range.to)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #agency-cash-statement-print, #agency-cash-statement-print * { visibility: visible !important; }
          #agency-cash-statement-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            color: #111827 !important;
            background: #fff !important;
          }
          #agency-cash-statement-print .statement-screen-only { display: none !important; }
          #agency-cash-statement-print .statement-print-only { display: block !important; }
          #agency-cash-statement-print table { width: 100% !important; border-collapse: collapse !important; }
          #agency-cash-statement-print th,
          #agency-cash-statement-print td { border: 1px solid #d1d5db !important; padding: 6px !important; color: #111827 !important; }
          #agency-cash-statement-print tr { break-inside: avoid; }
        }
      `}</style>

      <div className="statement-screen-only flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Période
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as DatePreset)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {DATE_PRESETS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {preset === "custom" && (
              <>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Du
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Au
                  <input
                    type="date"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
              </>
            )}
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as AgencyCashStatementFilter)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {TYPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" onClick={() => void load(true)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </ActionButton>
            <ActionButton variant="secondary" onClick={exportCsv} disabled={!filteredRows.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </ActionButton>
            <ActionButton onClick={() => window.print()} disabled={!filteredRows.length}>
              <Printer className="h-4 w-4" />
              Imprimer
            </ActionButton>
          </div>
        </div>
      </div>

      <div id="agency-cash-statement-print" className="space-y-4">
        <div className="statement-print-only hidden border-b border-slate-300 pb-4">
          <h1 className="text-2xl font-bold">Relevé de caisse agence</h1>
          <p className="mt-1">{companyName} — {agencyName}</p>
          <p>Période : {periodLabel}</p>
          <p>Date d’édition : {new Date().toLocaleString("fr-FR")}</p>
        </div>

        <SectionCard title="Relevé de caisse">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          {(summary?.transactionsCapped || summary?.legacyCapped) && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Le relevé atteint la limite de 5 000 lignes sur au moins une source. Les données peuvent être partielles.
            </div>
          )}

          {summary?.unavailableSources?.length ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Certaines opérations détaillées ne sont pas disponibles.
            </div>
          ) : null}

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Total entrées</p>
              <p className="mt-1 text-lg font-bold text-emerald-800 dark:text-emerald-100">{formatCurrency(summary?.totalEntries ?? 0, currency)}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
              <p className="text-xs font-semibold uppercase text-rose-700 dark:text-rose-300">Total sorties</p>
              <p className="mt-1 text-lg font-bold text-rose-800 dark:text-rose-100">{formatCurrency(summary?.totalExits ?? 0, currency)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Net période</p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(summary?.net ?? 0, currency)}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
              <p className="text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-300">Solde caisse actuel</p>
              <p className="mt-1 text-lg font-bold text-indigo-900 dark:text-indigo-100">{formatCurrency(summary?.currentBalance ?? 0, currency)}</p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Chargement du relevé…</div>
          ) : !error && filteredRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Aucun mouvement pour cette sélection.</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Référence</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Libellé</th>
                      <th className="px-3 py-3 text-right">Entrée</th>
                      <th className="px-3 py-3 text-right">Sortie</th>
                      <th className="px-3 py-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200">
                        <td className="whitespace-nowrap px-3 py-3">{row.date.toLocaleString("fr-FR")}</td>
                        <td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs" title={row.reference}>{row.reference}</td>
                        <td className="px-3 py-3">{row.typeLabel}</td>
                        <td className="px-3 py-3">{row.label}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                          {row.entry ? `+ ${formatCurrency(row.entry, currency)}` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-rose-700 dark:text-rose-300">
                          {row.exit ? `− ${formatCurrency(row.exit, currency)}` : "—"}
                        </td>
                        <td className="px-3 py-3">{statusLabel(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="statement-screen-only space-y-2 md:hidden">
                {filteredRows.map((row) => (
                  <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white">{row.typeLabel}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.date.toLocaleString("fr-FR")}</p>
                      </div>
                      <p className={`shrink-0 text-right font-bold ${row.entry ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                        {row.entry ? `+ ${formatCurrency(row.entry, currency)}` : `− ${formatCurrency(row.exit, currency)}`}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{row.label}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate font-mono">{row.reference}</span>
                      <span>{statusLabel(row.status)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
