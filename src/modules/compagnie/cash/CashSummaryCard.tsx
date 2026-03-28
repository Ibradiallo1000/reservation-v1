/**
 * Carte caisse locale : ventes du jour, montant en caisse, dernière clôture, bouton Clôturer la caisse.
 * Utilisée sur le dashboard agence et le tableau de bord escale.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  getCashTransactionsByLocation,
  getLastClosureByLocation,
  createCashClosure,
} from "./cashService";
import { getLedgerBalances } from "@/modules/compagnie/treasury/financialTransactions";
import type { CashTransactionDocWithId, CashClosureDocWithId } from "./cashTypes";
import { getTodayForTimezone, resolveAgencyTimezone } from "@/shared/date/dateUtilsTz";
import { SectionCard, ActionButton } from "@/ui";
import { Wallet, Receipt, Lock, Loader2 } from "lucide-react";

const LOCATION_TYPE_AGENCE = "agence";
const LOCATION_TYPE_ESCALE = "escale";

export interface CashSummaryCardProps {
  companyId: string;
  locationId: string;
  locationType: "agence" | "escale";
  /** Rôles autorisés à clôturer : guichetier, chefAgence, escale_agent */
  canClose: boolean;
  createdBy: string;
  formatCurrency: (n: number) => string;
  /** Date à afficher (YYYY-MM-DD). Par défaut : aujourd'hui. */
  date?: string;
  /** Fuseau IANA (`agency.timezone`). Défaut = Bamako si absent. */
  ianaTimezone?: string;
}

export function CashSummaryCard({
  companyId,
  locationId,
  locationType,
  canClose,
  createdBy,
  formatCurrency,
  date: dateProp,
  ianaTimezone,
}: CashSummaryCardProps) {
  const tz = resolveAgencyTimezone({ timezone: ianaTimezone });
  const today = getTodayForTimezone(tz);
  const date = dateProp ?? today;
  const [transactions, setTransactions] = useState<CashTransactionDocWithId[]>([]);
  const [total, setTotal] = useState(0);
  const [lastClosure, setLastClosure] = useState<CashClosureDocWithId | null>(null);
  const [loading, setLoading] = useState(true);
  const [closureModalOpen, setClosureModalOpen] = useState(false);
  const [declaredAmount, setDeclaredAmount] = useState("");
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !locationId) return;
    setLoading(true);
    try {
      const [txList, ledger, last] = await Promise.all([
        getCashTransactionsByLocation(companyId, locationId, date, tz),
        getLedgerBalances(companyId, locationId),
        getLastClosureByLocation(companyId, locationId),
      ]);
      setTransactions(txList);
      setTotal(ledger.cash);
      setLastClosure(last);
    } catch (e) {
      console.error("[CashSummaryCard] load:", e);
    } finally {
      setLoading(false);
    }
  }, [companyId, locationId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenClosure = () => {
    setDeclaredAmount(total.toString());
    setClosureError(null);
    setClosureModalOpen(true);
  };

  const handleSubmitClosure = async () => {
    if (!canClose || !companyId || !locationId) return;
    const declared = parseFloat(declaredAmount);
    if (Number.isNaN(declared) || declared < 0) {
      setClosureError("Montant déclaré invalide.");
      return;
    }
    setClosureSubmitting(true);
    setClosureError(null);
    try {
      await createCashClosure(companyId, {
        locationType,
        locationId,
        date: today,
        expectedAmount: total,
        declaredAmount: declared,
        createdBy,
      });
      setClosureModalOpen(false);
      setDeclaredAmount("");
      load();
    } catch (e: unknown) {
      setClosureError(e instanceof Error ? e.message : "Erreur lors de la clôture.");
    } finally {
      setClosureSubmitting(false);
    }
  };

  const cardTitle = date === today ? "Caisse aujourd'hui" : `Caisse du ${date}`;
  if (loading) {
    return (
      <SectionCard title={cardTitle}>
        <div className="flex items-center gap-2 text-gray-500 py-4">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement…
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title={cardTitle}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-gray-600 dark:text-gray-400">
            <Receipt className="w-4 h-4 shrink-0" />
            <span>
              Mouvements terrain (cashTransactions) : {transactions.length} ligne(s)
            </span>
            <span
              className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950"
              title="Donnée opérationnelle — ne remplace pas la comptabilité"
            >
              Donnée opérationnelle · non comptabilisée
            </span>
          </div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="w-5 h-5" />
            <span>Solde espèces (comptabilité / ledger) : {formatCurrency(total)}</span>
          </div>
          {lastClosure && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Dernière clôture : {lastClosure.date} — Déclaré {formatCurrency(lastClosure.declaredAmount)}
              {lastClosure.difference !== 0 && (
                <span className={lastClosure.difference > 0 ? " text-green-600" : " text-red-600"}>
                  {" "}(écart {lastClosure.difference > 0 ? "+" : ""}{formatCurrency(lastClosure.difference)})
                </span>
              )}
            </div>
          )}
          {canClose && date === today && (
            <ActionButton onClick={handleOpenClosure} title="Clôturer la caisse">
              <Lock className="w-4 h-4" />
              Clôturer la caisse
            </ActionButton>
          )}
        </div>
      </SectionCard>

      {closureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Clôture de caisse — {date}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Montant attendu (solde espèces ledger affiché) : <strong>{formatCurrency(total)}</strong>
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">Montant déclaré</label>
              <input
                type="number"
                min={0}
                step={1}
                value={declaredAmount}
                onChange={(e) => setDeclaredAmount(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700"
              />
            </div>
            <p className="text-xs text-gray-500">
              Différence : {formatCurrency(parseFloat(declaredAmount || "0") - total)}
            </p>
            {closureError && (
              <p className="text-sm text-red-600 dark:text-red-400">{closureError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setClosureModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmitClosure}
                disabled={closureSubmitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {closureSubmitting ? "Enregistrement…" : "Enregistrer la clôture"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
