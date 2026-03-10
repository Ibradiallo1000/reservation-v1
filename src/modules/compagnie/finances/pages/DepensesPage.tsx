/**
 * Workflow dépenses multi-niveaux : validation (chef agence / chef comptable / CEO) et paiement.
 */

import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  listExpenses,
  approveExpense,
  rejectExpense,
  payExpense,
  ensureExpenseReserveAccount,
  PENDING_STATUSES,
  type ExpenseStatus,
  type ExpenseDoc,
} from "@/modules/compagnie/treasury/expenses";
import {
  Receipt,
  CheckCircle,
  Wallet,
  RefreshCw,
  AlertTriangle,
  Building2,
  Loader2,
  XCircle,
} from "lucide-react";
import { SectionCard, StatusBadge, ActionButton, table, tableRowClassName } from "@/ui";
import { toast } from "sonner";

const EFFECTIVE_PENDING = ["pending", "pending_manager", "pending_accountant", "pending_ceo"] as const;
function isPending(s: ExpenseStatus): boolean {
  return EFFECTIVE_PENDING.includes(s as (typeof EFFECTIVE_PENDING)[number]);
}

function stepLabel(status: ExpenseStatus): string {
  const s = status === "pending" ? "pending_manager" : status;
  if (s === "pending_manager") return "Attente chef agence";
  if (s === "pending_accountant") return "Attente chef comptable";
  if (s === "pending_ceo") return "Attente CEO";
  if (s === "approved") return "Approuvée";
  if (s === "rejected") return "Refusée";
  if (s === "paid") return "Payée";
  return status;
}

function canApprove(status: ExpenseStatus, role: string): boolean {
  const s = status === "pending" ? "pending_manager" : status;
  if (s === "pending_manager") return ["chefAgence", "admin_compagnie"].includes(role);
  if (s === "pending_accountant") return ["company_accountant", "financial_director", "admin_compagnie"].includes(role);
  if (s === "pending_ceo") return role === "admin_compagnie";
  return false;
}

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "Carburant",
  maintenance: "Maintenance",
  salary: "Salaires",
  toll: "Péage",
  operational: "Opérationnel",
  supplier_payment: "Fournisseur",
  other: "Autre",
};

type ExpenseRow = ExpenseDoc & { id: string };

export default function DepensesPage() {
  const { user, company } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const currency = (company as { devise?: string })?.devise ?? "XOF";

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ExpenseStatus | "pending" | "all">("pending");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [agencesSnap, pendingList, approvedList, rejectedList] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "agences")),
        listExpenses(companyId, { statusIn: [...PENDING_STATUSES], limitCount: 100 }),
        listExpenses(companyId, { status: "approved", limitCount: 100 }),
        listExpenses(companyId, { status: "rejected", limitCount: 50 }),
      ]);
      setAgencies(
        agencesSnap.docs.map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string };
          return { id: d.id, nom: data.nom ?? data.nomAgence ?? d.id };
        })
      );
      const all = [...pendingList, ...approvedList, ...rejectedList].sort(
        (a, b) => ((b as ExpenseRow).createdAt?.toMillis?.() ?? 0) - ((a as ExpenseRow).createdAt?.toMillis?.() ?? 0)
      );
      setExpenses(all);
      await ensureExpenseReserveAccount(companyId, currency);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement");
      toast.error("Impossible de charger les dépenses.");
    } finally {
      setLoading(false);
    }
  }, [companyId, currency]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (expenseId: string) => {
    if (!companyId || !user?.uid) return;
    setBusyId(expenseId);
    try {
      await approveExpense(companyId, expenseId, user.uid, user.role ?? "company_accountant");
      toast.success("Dépense approuvée.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'approbation.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePay = async (expenseId: string) => {
    if (!companyId || !user?.uid) return;
    setBusyId(expenseId);
    try {
      await payExpense(companyId, expenseId, user.uid, currency);
      toast.success("Dépense payée.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du paiement.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (expenseId: string) => {
    if (!companyId || !user?.uid) return;
    const reason = rejectReason.trim() || "Non précisé";
    setRejectingId(expenseId);
    try {
      await rejectExpense(companyId, expenseId, user.uid, reason, user.role);
      toast.success("Dépense refusée.");
      setRejectModalId(null);
      setRejectReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du refus.");
    } finally {
      setRejectingId(null);
    }
  };

  const getAgencyName = (agencyId: string | null) => {
    if (!agencyId) return "Siège";
    return agencies.find((a) => a.id === agencyId)?.nom ?? agencyId;
  };

  const filtered =
    filterStatus === "all"
      ? expenses
      : filterStatus === "pending"
        ? expenses.filter((e) => isPending(e.status))
        : expenses.filter((e) => e.status === filterStatus);

  if (!companyId) {
    return (
      <div className="p-6 text-gray-500">Contexte compagnie introuvable.</div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Dépenses — validation et paiement"
        icon={Receipt}
        help="Dépenses soumises par les agences. Approuvez puis payez pour enregistrer le mouvement en trésorerie."
        right={
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ExpenseStatus | "all")}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="pending">En attente</option>
              <option value="approved">Approuvées</option>
              <option value="rejected">Refusées</option>
              <option value="all">Toutes</option>
            </select>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" /> Actualiser
            </button>
          </div>
        }
      >
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm mb-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 py-8 text-center">Aucune dépense {filterStatus === "all" ? "" : "dans cette catégorie"}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Date</th>
                  <th className={table.th}>Agence</th>
                  <th className={table.th}>Catégorie</th>
                  <th className={table.th}>Fournisseur</th>
                  <th className={table.th}>Description</th>
                  <th className={table.th}>Justificatif</th>
                  <th className={table.thRight}>Montant</th>
                  <th className={table.th}>Étape / Statut</th>
                  <th className={table.th}>Actions</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {filtered.map((e) => (
                  <tr key={e.id} className={tableRowClassName()}>
                    <td className={table.td}>
                      {(e.createdAt as { toDate?: () => Date })?.toDate?.()
                        ?.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) ?? "—"}
                    </td>
                    <td className={table.td}>
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        {getAgencyName(e.agencyId)}
                      </span>
                    </td>
                    <td className={table.td}>{CATEGORY_LABELS[e.expenseCategory ?? e.category] ?? e.category}</td>
                    <td className={table.td}>{(e as ExpenseRow).supplierName ?? "—"}</td>
                    <td className={table.td}>{e.description?.slice(0, 50)}{e.description?.length > 50 ? "…" : ""}</td>
                    <td className={table.td}>
                      {(e as ExpenseRow).receiptUrls?.[0] ? (
                        <a
                          href={(e as ExpenseRow).receiptUrls?.[0]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Ouvrir
                        </a>
                      ) : "—"}
                    </td>
                    <td className={table.tdRight + " font-medium"}>{money(e.amount)}</td>
                    <td className={table.td}>
                      {isPending(e.status) && <StatusBadge status="warning">{stepLabel(e.status)}</StatusBadge>}
                      {e.status === "approved" && <StatusBadge status="success">Approuvée</StatusBadge>}
                      {e.status === "rejected" && (
                        <StatusBadge status="danger">Refusée</StatusBadge>
                      )}
                      {e.status === "paid" && <StatusBadge status="success">Payée</StatusBadge>}
                    </td>
                    <td className={table.td}>
                      {isPending(e.status) && canApprove(e.status, user?.role ?? "") && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <ActionButton
                            variant="primary"
                            size="sm"
                            onClick={() => handleApprove(e.id)}
                            disabled={busyId === e.id}
                          >
                            {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            {" "}Approuver
                          </ActionButton>
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            onClick={() => setRejectModalId(e.id)}
                            disabled={busyId === e.id}
                          >
                            <XCircle className="h-4 w-4" /> Refuser
                          </ActionButton>
                        </div>
                      )}
                      {e.status === "approved" && (
                        <ActionButton
                          variant="primary"
                          size="sm"
                          onClick={() => handlePay(e.id)}
                          disabled={busyId === e.id}
                        >
                          {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                          {" "}Payer
                        </ActionButton>
                      )}
                      {e.status === "rejected" && (e as ExpenseRow).rejectionReason && (
                        <span className="text-xs text-gray-500" title={(e as ExpenseRow).rejectionReason ?? ""}>
                          {(e as ExpenseRow).rejectionReason?.slice(0, 30)}…
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRejectModalId(null)}>
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">Refuser la dépense</h3>
            <p className="text-sm text-gray-600 mb-3">Indiquez le motif du refus (obligatoire pour traçabilité).</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex. Budget dépassé, justificatif manquant..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[80px]"
              maxLength={500}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
                onClick={() => { setRejectModalId(null); setRejectReason(""); }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                onClick={() => rejectModalId && handleReject(rejectModalId)}
                disabled={rejectingId === rejectModalId}
              >
                {rejectingId === rejectModalId ? "Envoi…" : "Refuser"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
