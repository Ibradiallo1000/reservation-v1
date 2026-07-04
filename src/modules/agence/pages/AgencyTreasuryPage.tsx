// Treasury dashboard — Agency: local accounts, cash position, recent movements, pending expenses.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { formatDateLongFr } from "@/utils/dateFmt";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { getAgencyTreasuryLedgerCashDisplay } from "@/modules/agence/comptabilite/agencyCashAuditService";
import {
  listExpenses,
  createExpense,
  payExpense,
  type ExpenseStatus,
  type ExpenseDoc,
  EXPENSE_CATEGORIES,
  PENDING_STATUSES,
} from "@/modules/compagnie/treasury/expenses";
import { listExpenseCategories, listSuppliers, type ExpenseCategoryDoc, type SupplierDoc } from "@/modules/compagnie/finance/expenseMetadataService";
import { ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { Wallet, ArrowRightLeft, FileText, Plus, Loader2, ArrowLeft, Building2, CreditCard } from "lucide-react";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import { StandardLayoutWrapper, PageHeader, SectionCard, EmptyState, table, tableRowClassName, ActionButton } from "@/ui";
import { toast } from "sonner";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { AGENCY_CASH_UI_REFRESH_EVENT } from "@/modules/agence/constants/agencyCashUiRefresh";

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "Carburant",
  maintenance: "Maintenance",
  salary: "Salaires",
  toll: "Péage",
  operational: "Opérationnel",
  supplier_payment: "Fournisseur",
  other: "Autre",
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  payment_received: "Encaissement",
  expense: "Dépense",
  transfer: "Transfert",
  transfer_to_bank: "Versement compagnie",
  refund: "Remboursement",
};

type TreasuryActionView = "overview" | "expense" | "transfer" | "supplier";
type ExpenseRow = ExpenseDoc & { id: string };

export type AgencyTreasuryPageProps = { embedded?: boolean };

export default function AgencyTreasuryPage({ embedded = false }: AgencyTreasuryPageProps = {}) {
  const { user, company } = useAuth();
  const money = useFormatCurrency();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const roles = useMemo(
    () => Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [],
    [user?.role]
  );
  const isAgencyManager = roles.some((role) => ["chefAgence", "chefagence", "superviseur"].includes(role));
  const isAgencyAccountant = roles.some((role) => ["agency_accountant", "comptable", "Comptable"].includes(role));
  const canCreateAgencyExpense = isAgencyAccountant && !isAgencyManager;
  const canDisburseApprovedExpenses = isAgencyAccountant && !isAgencyManager;

  // 🔥 État de navigation interne
  const [actionView, setActionView] = useState<TreasuryActionView>("overview");

  const [accounts, setAccounts] = useState<{ id: string; accountName: string; currentBalance: number; currency: string; accountType: string }[]>([]);
  const [operationalCash, setOperationalCash] = useState<{
    accountingCash: number;
    adjustmentTotal: number;
    availableCash: number;
  } | null>(null);
  const [mirrorCashSecondary, setMirrorCashSecondary] = useState<number | null>(null);
  const [movements, setMovements] = useState<{ id: string; amount: number; movementType: string; performedAt: unknown }[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<{ id: string; amount: number; category: string; status: ExpenseStatus }[]>([]);
  const [approvedExpenses, setApprovedExpenses] = useState<ExpenseRow[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(false);
  const [disbursingExpenseId, setDisbursingExpenseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showLastMovementsDetail, setShowLastMovementsDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formCategory, setFormCategory] = useState<string>("other");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formAccountId, setFormAccountId] = useState("");
  const [formReceiptUrl, setFormReceiptUrl] = useState("");
  const [formSupplierId, setFormSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>([]);
  const [customCategories, setCustomCategories] = useState<ExpenseCategoryDoc[]>([]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }
    const currency = (company as { devise?: string })?.devise ?? "XOF";
    setError(null);
    const loadTreasury = async () => {
      if (!embedded) {
        await ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as { nom?: string })?.nom);
      }
      const [acc, primary] = await Promise.all([
        embedded ? Promise.resolve([]) : listAccounts(companyId, { agencyId }),
        getAgencyTreasuryLedgerCashDisplay(companyId, agencyId).catch((err) => {
          const code =
            err && typeof err === "object" && "code" in err
              ? String((err as { code?: unknown }).code ?? "unknown")
              : "unknown";
          console.warn("[AgencyTreasury] Lecture caisse indisponible.", { code });
          return { ledgerCash: 0, mirrorCash: null, currency };
        }),
      ]);
      setAccounts(acc);
      setOperationalCash({
        accountingCash: primary.ledgerCash,
        adjustmentTotal: 0,
        availableCash: primary.ledgerCash,
      });
      setMirrorCashSecondary(primary.mirrorCash);
    };
    loadTreasury()
      .catch((err: any) => {
        const isPerm = err?.code === "permission-denied" || err?.message?.includes("permission");
        if (isPerm) setTimeout(() => loadTreasury().catch(() => setError("Erreur lors du chargement de la trésorerie.")), 1500);
        else setError(!isOnline ? "Connexion indisponible. Impossible de charger la trésorerie." : "Erreur lors du chargement de la trésorerie.");
      })
      .finally(() => setLoading(false));
  }, [companyId, agencyId, company, embedded, isOnline, reloadKey, user?.role]);

  useEffect(() => {
    const onRefresh = () => setReloadKey((k) => k + 1);
    window.addEventListener(AGENCY_CASH_UI_REFRESH_EVENT, onRefresh as EventListener);
    return () => window.removeEventListener(AGENCY_CASH_UI_REFRESH_EVENT, onRefresh as EventListener);
  }, []);

  const agencyCashAccounts = accounts.filter((a) => a.accountType === "agency_cash");

  useEffect(() => {
    if (agencyCashAccounts.length > 0 && !formAccountId) setFormAccountId(agencyCashAccounts[0].id);
    if (formAccountId && !agencyCashAccounts.some((a) => a.id === formAccountId)) {
      setFormAccountId(agencyCashAccounts[0]?.id ?? "");
    }
  }, [agencyCashAccounts, formAccountId]);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([listSuppliers(companyId), listExpenseCategories(companyId)])
      .then(([s, c]) => {
        setSuppliers(s);
        setCustomCategories(c);
      })
      .catch(() => {
        // Optional metadata; keep default categories if unavailable.
      });
  }, [companyId]);

  const handleSubmitExpense = async () => {
    if (!companyId || !agencyId || !user?.uid) return;
    const amount = Number(formAmount?.replace(/\s/g, "").replace(",", "."));
    if (!formDescription.trim() || amount <= 0 || !formAccountId) {
      toast.error("Renseignez la description, le montant et le compte.");
      return;
    }
    if (operationalCash != null && amount > operationalCash.availableCash + 0.0001) {
      toast.error("Montant supérieur à la caisse disponible.");
      return;
    }
    setSubmitting(true);
    try {
      await createExpense({
        companyId,
        agencyId,
        category: formCategory,
        description: formDescription.trim(),
        amount,
        accountId: formAccountId,
        createdBy: user.uid,
        expenseCategory: formCategory,
        supplierId: formSupplierId || null,
        supplierName: suppliers.find((s) => s.id === formSupplierId)?.name ?? null,
        receiptUrls: formReceiptUrl.trim() ? [formReceiptUrl.trim()] : [],
      });
      toast.success("Dépense soumise. Elle sera validée selon le montant.");
      setFormDescription("");
      setFormAmount("");
      setFormReceiptUrl("");
      setActionView("overview");
      setReloadKey((k) => k + 1);
      listExpenses(companyId, { agencyId, statusIn: [...PENDING_STATUSES], limitCount: 20 }).then((list) =>
        setPendingExpenses(list.map((e) => ({ id: e.id, amount: e.amount, category: e.category, status: e.status })))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la soumission.");
    } finally {
      setSubmitting(false);
    }
  };

  const loadApprovedExpenses = useCallback(async () => {
    if (!companyId || !agencyId || !canDisburseApprovedExpenses) {
      setApprovedExpenses([]);
      return;
    }
    setApprovedLoading(true);
    try {
      const list = await listExpenses(companyId, {
        agencyId,
        status: "approved",
        limitCount: 50,
      });
      setApprovedExpenses(list);
    } catch {
      setError(
        !isOnline
          ? "Connexion indisponible. Dépenses approuvées non disponibles."
          : "Erreur lors du chargement des dépenses approuvées."
      );
    } finally {
      setApprovedLoading(false);
    }
  }, [agencyId, canDisburseApprovedExpenses, companyId, isOnline]);

  const handleDisburseExpense = async (expenseId: string) => {
    if (!companyId || !user?.uid || !canDisburseApprovedExpenses) return;
    if (disbursingExpenseId) return;
    const currency = (company as { devise?: string })?.devise ?? "XOF";
    setDisbursingExpenseId(expenseId);
    try {
      await payExpense(companyId, expenseId, user.uid, currency);
      toast.success("Dépense décaissée.");
      setApprovedExpenses((current) => current.filter((expense) => expense.id !== expenseId));
      setReloadKey((key) => key + 1);
      window.dispatchEvent(new Event(AGENCY_CASH_UI_REFRESH_EVENT));
      await loadApprovedExpenses();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du décaissement.");
    } finally {
      setDisbursingExpenseId(null);
    }
  };

  useEffect(() => {
  if (!companyId || !agencyId) return;
  const q = query(
    collection(db, `companies/${companyId}/financialTransactions`),
    where("companyId", "==", companyId),
    where("agencyId", "==", agencyId),
    orderBy("performedAt", "desc"),
    limit(50)
  );
  const unsub = onSnapshot(q, (snap) => {
    setMovements(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          amount: Number(data.amount ?? 0),
          movementType: data.type ?? "",
          performedAt: data.performedAt,
        };
      })
    );
    setError(null);
  }, (err) => {
    if (err.code === 'permission-denied') {
      console.warn("[AgencyTreasury] Permission denied pour financialTransactions, ignoré.");
      setMovements([]);
      setError(null);
    } else {
      setError(
        !isOnline
          ? "Connexion indisponible. Mouvements non synchronisés."
          : "Erreur lors du chargement des mouvements."
      );
    }
  });
  return () => unsub();
}, [companyId, agencyId, isOnline]);

  useEffect(() => {
    void loadApprovedExpenses();
  }, [loadApprovedExpenses, reloadKey]);

  useEffect(() => {
    if (!companyId) return;
    listExpenses(companyId, { agencyId, statusIn: [...PENDING_STATUSES], limitCount: 20 })
      .then((list) =>
        setPendingExpenses(list.map((e) => ({ id: e.id, amount: e.amount, category: e.category, status: e.status })))
      )
      .catch(() => {
        setError(
          !isOnline
            ? "Connexion indisponible. Dépenses non disponibles."
            : "Erreur lors du chargement des dépenses."
        );
      });
    const interval = setInterval(() => {
      listExpenses(companyId, { agencyId, statusIn: [...PENDING_STATUSES], limitCount: 20 }).then((list) =>
        setPendingExpenses(list.map((e) => ({ id: e.id, amount: e.amount, category: e.category, status: e.status })))
      ).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [companyId, agencyId, isOnline]);

  const caisseDevise =
    agencyCashAccounts[0]?.currency ?? (company as { devise?: string })?.devise ?? "XOF";
  const ledgerCashDisplay = operationalCash?.availableCash ?? 0;
  const pendingExpensesTotal = useMemo(
    () => pendingExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [pendingExpenses]
  );

  if (!companyId || !agencyId) {
    return embedded ? (
      <p className="text-gray-500 py-4">Contexte agence introuvable.</p>
    ) : (
      <StandardLayoutWrapper className="min-w-0">
        <p className="text-gray-500">Contexte agence introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  if (loading && accounts.length === 0) {
    return embedded ? <div className="py-8 text-gray-500">Chargement…</div> : <PageLoadingState />;
  }

  const formatExpenseDate = (expense: ExpenseRow): string => {
    const date = (expense.createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
    return date ? date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  };

  // 🔥 Vue "Nouvelle dépense"
  const renderExpenseForm = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActionView("overview")}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nouvelle dépense</h3>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Enregistrez une dépense à soumettre pour validation.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
          <select
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {customCategories.map((c) => (
              <option key={`custom-${c.id}`} value={c.code}>
                {c.label}
              </option>
            ))}
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Compte à débiter</label>
          <select
            value={formAccountId}
            onChange={(e) => setFormAccountId(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {agencyCashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                Caisse agence — {formatCurrency(ledgerCashDisplay, caisseDevise)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <input
            type="text"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Ex. Carburant bus 12, Péage A1..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fournisseur (optionnel)</label>
          <select
            value={formSupplierId}
            onChange={(e) => setFormSupplierId(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">— Aucun —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant</label>
          <input
            type="text"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL justificatif (optionnel)</label>
          <input
            type="url"
            value={formReceiptUrl}
            onChange={(e) => setFormReceiptUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex items-end gap-3">
          <ActionButton
            variant="primary"
            onClick={handleSubmitExpense}
            disabled={submitting || !formDescription.trim() || !formAmount.trim() || !formAccountId}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {" "}Soumettre la dépense
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => setActionView("overview")}
          >
            Annuler
          </ActionButton>
        </div>
      </div>
    </div>
  );

  // 🔥 Vue "Versement compagnie" (placeholder)
  const renderTransferView = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActionView("overview")}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Versement compagnie</h3>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-center">
        <Building2 className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Cette action sera disponible dans le module Finances.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Vous pourrez effectuer un versement depuis la caisse agence vers la banque compagnie.
        </p>
        <ActionButton
          variant="secondary"
          className="mt-4"
          onClick={() => setActionView("overview")}
        >
          Retour à la trésorerie
        </ActionButton>
      </div>
    </div>
  );

  // 🔥 Vue "Paiement fournisseur" (placeholder)
  const renderSupplierView = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActionView("overview")}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Paiement fournisseur</h3>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-center">
        <CreditCard className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Cette action sera disponible dans le module Finances.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Vous pourrez enregistrer un paiement fournisseur depuis la caisse agence.
        </p>
        <ActionButton
          variant="secondary"
          className="mt-4"
          onClick={() => setActionView("overview")}
        >
          Retour à la trésorerie
        </ActionButton>
      </div>
    </div>
  );

  // 🔥 Vue Overview (page principale)
  const renderOverview = () => (
    <>
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certaines données peuvent être incomplètes." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Trésorerie</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Suivi des fonds disponibles et des mouvements de l'agence.
          </p>
        </div>
        {canCreateAgencyExpense && (
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton size="sm" onClick={() => setActionView("expense")}>
              Nouvelle dépense
            </ActionButton>
          </div>
        )}
      </div>

      {/* Carte résumé compacte */}
      <SectionCard title="Résumé" icon={Wallet}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
            <div className="text-xs text-indigo-700 dark:text-indigo-300">Solde disponible</div>
            <div className="text-lg font-semibold text-indigo-800 dark:text-indigo-200">{money(ledgerCashDisplay)}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="text-xs text-amber-700 dark:text-amber-300">Demandes en attente</div>
            <div className="text-lg font-semibold text-amber-800 dark:text-amber-200">{pendingExpenses.length}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
            <div className="text-xs text-rose-700 dark:text-rose-300">Montant en attente</div>
            <div className="text-lg font-semibold text-rose-800 dark:text-rose-200">{money(pendingExpensesTotal)}</div>
          </div>
        </div>
      </SectionCard>

      {canDisburseApprovedExpenses && (
        <SectionCard title="Dépenses approuvées à décaisser" icon={FileText}>
          {approvedLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Chargement des dépenses approuvées…
            </div>
          ) : approvedExpenses.length === 0 ? (
            <EmptyState message="Aucune dépense approuvée à décaisser." />
          ) : (
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Date</th>
                    <th className={table.th}>Catégorie</th>
                    <th className={table.th}>Description</th>
                    <th className={table.thRight}>Montant</th>
                    <th className={table.th}>Statut</th>
                    <th className={table.thRight}>Action</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {approvedExpenses.map((expense) => (
                    <tr key={expense.id} className={tableRowClassName()}>
                      <td className={table.td}>{formatExpenseDate(expense)}</td>
                      <td className={table.td}>{CATEGORY_LABELS[expense.expenseCategory ?? expense.category] ?? expense.category}</td>
                      <td className={table.td}>{expense.description || "—"}</td>
                      <td className={table.tdRight}>{money(Number(expense.amount || 0))}</td>
                      <td className={table.td}>Approuvée</td>
                      <td className={table.tdRight}>
                        <ActionButton
                          size="sm"
                          onClick={() => void handleDisburseExpense(expense.id)}
                          disabled={disbursingExpenseId != null}
                        >
                          {disbursingExpenseId === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Décaisser
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* Derniers mouvements */}
      <SectionCard title="Derniers mouvements" icon={ArrowRightLeft}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {movements.length === 0
              ? "Aucun mouvement enregistré."
              : `${Math.min(25, movements.length)} mouvement(s) récent(s)`}
          </p>
          <ActionButton
            type="button"
            variant="secondary"
            className="shrink-0 text-sm py-1.5 px-3"
            onClick={() => setShowLastMovementsDetail((v) => !v)}
          >
            {showLastMovementsDetail ? "Masquer les détails" : "Voir détails"}
          </ActionButton>
        </div>
        {showLastMovementsDetail ? (
          <div
            className={
              table.wrapper + " max-h-64 min-w-0 overflow-x-auto overflow-y-auto [-webkit-overflow-scrolling:touch]"
            }
          >
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Type</th>
                  <th className={table.thRight}>Montant</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {movements.length === 0 ? (
                  <tr><td colSpan={2} className="py-4 text-gray-500 text-center">Aucun mouvement</td></tr>
                ) : (
                  movements.slice(0, 25).map((m) => (
                    <tr key={m.id} className={tableRowClassName()}>
                      <td className={table.td}>{MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType}</td>
                      <td className={table.tdRight}>{m.amount > 0 ? `+${money(m.amount)}` : money(m.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      {/* Demandes en attente */}
      <SectionCard title="Demandes en attente de validation" icon={FileText}>
        {pendingExpenses.length === 0 ? (
          <EmptyState message="Aucune dépense en attente." />
        ) : (
          <ul className="space-y-2 text-sm">
            {pendingExpenses.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900"
              >
                <span className="font-medium">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {money(e.amount)} — {e.status === "pending" ? "En attente" : e.status === "pending_manager" ? "Validation chef" : e.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );

  // 🔥 Sélection de la vue à afficher
  const renderContent = () => {
    if (!canCreateAgencyExpense && actionView !== "overview") {
      return renderOverview();
    }
    switch (actionView) {
      case "expense":
        return renderExpenseForm();
      case "transfer":
        return renderTransferView();
      case "supplier":
        return renderSupplierView();
      default:
        return renderOverview();
    }
  };

  const treasuryBody = (
    <div className="max-w-4xl min-w-0 space-y-4">
      {renderContent()}
    </div>
  );

  return embedded ? (
    treasuryBody
  ) : (
    <StandardLayoutWrapper className="min-w-0" maxWidthClass="max-w-4xl">
      {treasuryBody}
    </StandardLayoutWrapper>
  );
}
