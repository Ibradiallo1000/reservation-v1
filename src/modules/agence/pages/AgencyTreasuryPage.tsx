// Treasury dashboard — Agency: local accounts, cash position, recent movements, pending expenses.
import React, { useEffect, useMemo, useState } from "react";
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
import { getAgencyOperationalAvailableCash } from "@/modules/agence/comptabilite/agencyCashAuditService";
import {
  listExpenses,
  createExpense,
  type ExpenseStatus,
  EXPENSE_CATEGORIES,
  PENDING_STATUSES,
} from "@/modules/compagnie/treasury/expenses";
import { listExpenseCategories, listSuppliers, type ExpenseCategoryDoc, type SupplierDoc } from "@/modules/compagnie/finance/expenseMetadataService";
import { ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { Wallet, ArrowRightLeft, FileText, Plus, Loader2 } from "lucide-react";
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

export type AgencyTreasuryPageProps = { embedded?: boolean };

export default function AgencyTreasuryPage({ embedded = false }: AgencyTreasuryPageProps = {}) {
  const { user, company } = useAuth();
  const money = useFormatCurrency();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [accounts, setAccounts] = useState<{ id: string; accountName: string; currentBalance: number; currency: string; accountType: string }[]>([]);
  const [operationalCash, setOperationalCash] = useState<{
    accountingCash: number;
    adjustmentTotal: number;
    availableCash: number;
  } | null>(null);
  const [movements, setMovements] = useState<{ id: string; amount: number; movementType: string; performedAt: unknown }[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<{ id: string; amount: number; category: string; status: ExpenseStatus }[]>([]);
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
    const runEnsure = () =>
      ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as { nom?: string })?.nom)
        .then(async () => {
          const [acc, ledger] = await Promise.all([
            listAccounts(companyId, { agencyId }),
            getAgencyOperationalAvailableCash(companyId, agencyId).catch(() => null),
          ]);
          setAccounts(acc);
          setOperationalCash(ledger);
        });
    runEnsure()
      .catch((err: any) => {
        const isPerm = err?.code === "permission-denied" || err?.message?.includes("permission");
        if (isPerm) setTimeout(() => runEnsure().catch(() => setError("Erreur lors du chargement de la trésorerie.")), 1500);
        else setError(!isOnline ? "Connexion indisponible. Impossible de charger la trésorerie." : "Erreur lors du chargement de la trésorerie.");
      })
      .finally(() => setLoading(false));
  }, [companyId, agencyId, company, isOnline, reloadKey]);

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
      toast.success("Dépense soumise. Elle sera validée selon le montant (chef agence, chef comptable ou CEO).");
      setFormDescription("");
      setFormAmount("");
      setFormReceiptUrl("");
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

  useEffect(() => {
    if (!companyId) return;
    const q = query(
      collection(db, `companies/${companyId}/financialTransactions`),
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
    }, () => {
      setError(
        !isOnline
          ? "Connexion indisponible. Mouvements non synchronisés."
          : "Erreur lors du chargement des mouvements."
      );
    });
    return () => unsub();
  }, [companyId, agencyId, isOnline]);

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

  const totalAgencyCash = agencyCashAccounts.reduce((s, a) => s + a.currentBalance, 0);
  const displayedCash = operationalCash?.availableCash ?? totalAgencyCash;
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

  const treasuryBody = (
    <>
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certaines données peuvent être incomplètes." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Trésorerie</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pilotage chef d&apos;agence : position caisse, demandes en attente et actions rapides.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton size="sm" onClick={() => navigate("/agence/treasury/new-operation")}>
              Soumettre dépense
            </ActionButton>
            <ActionButton size="sm" variant="secondary" onClick={() => navigate("/agence/treasury/transfer")}>
              Versement compagnie
            </ActionButton>
            <ActionButton size="sm" variant="secondary" onClick={() => navigate("/agence/treasury/new-payable")}>
              Payable fournisseur
            </ActionButton>
          </div>
        </div>
      ) : (
      <PageHeader
        title="Trésorerie agence"
        subtitle={formatDateLongFr(new Date())}
        icon={Wallet}
        right={
          <div className="flex min-w-0 flex-wrap items-stretch justify-end gap-2">
            <ActionButton className="w-full sm:w-auto" onClick={() => navigate("/agence/treasury/new-operation")}>
              Soumettre dépense
            </ActionButton>
            <ActionButton
              className="w-full sm:w-auto"
              variant="secondary"
              onClick={() => navigate("/agence/treasury/transfer")}
            >
              Versement banque compagnie
            </ActionButton>
            <ActionButton
              className="w-full sm:w-auto"
              variant="secondary"
              onClick={() => navigate("/agence/treasury/new-payable")}
            >
              Paiement fournisseur
            </ActionButton>
          </div>
        }
      />
      )}

      <SectionCard title="Vue rapide" icon={Wallet}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
            <div className="text-xs text-indigo-700">Caisse disponible</div>
            <div className="text-lg font-semibold text-indigo-800">{money(displayedCash)}</div>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
            <div className="text-xs text-amber-700">Demandes en attente</div>
            <div className="text-lg font-semibold text-amber-800">{pendingExpenses.length}</div>
          </div>
          <div className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
            <div className="text-xs text-rose-700">Montant en attente</div>
            <div className="text-lg font-semibold text-rose-800">{money(pendingExpensesTotal)}</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Position caisse agence" icon={Wallet}>
        <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{money(displayedCash)}</div>
        {operationalCash !== null && Math.abs((operationalCash.accountingCash + operationalCash.adjustmentTotal) - totalAgencyCash) > 0.01 ? (
          <p className="mt-2 text-xs text-amber-700">
            Le disponible inclut les écarts de validation comptable (manquants/surplus).
          </p>
        ) : null}
        {agencyCashAccounts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Aucun compte caisse agence n'est encore disponible.</p>
        ) : agencyCashAccounts.length === 1 && !(operationalCash !== null && Math.abs((operationalCash.accountingCash + operationalCash.adjustmentTotal) - totalAgencyCash) > 0.01) ? (
          <p className="mt-3 text-sm text-gray-600">
            Compte actif:{" "}
            <span className="font-medium">
              {agencyCashAccounts[0].accountName || "Caisse agence"} ({formatCurrency(agencyCashAccounts[0].currentBalance, agencyCashAccounts[0].currency)})
            </span>
          </p>
        ) : agencyCashAccounts.length > 1 && !(operationalCash !== null && Math.abs((operationalCash.accountingCash + operationalCash.adjustmentTotal) - totalAgencyCash) > 0.01) ? (
          <ul className="mt-3 space-y-2 text-sm">
            {agencyCashAccounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">{a.accountName || "Caisse agence"}</span>
                <span className="font-medium tabular-nums">{formatCurrency(a.currentBalance, a.currency)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {operationalCash !== null && Math.abs((operationalCash.accountingCash + operationalCash.adjustmentTotal) - totalAgencyCash) > 0.01 ? (
          <p className="mt-2 text-xs text-gray-500">
            Compte opérationnel: {agencyCashAccounts[0]?.accountName || "Caisse agence"} ({formatCurrency(agencyCashAccounts[0]?.currentBalance ?? 0, agencyCashAccounts[0]?.currency ?? "XOF")}).
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Derniers mouvements" icon={ArrowRightLeft}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {movements.length === 0
              ? "Aucun mouvement enregistré."
              : `${Math.min(25, movements.length)} mouvement(s) récent(s) — affichage optionnel.`}
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

      {embedded ? (
        <details className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
            Nouvelle demande de dépense (caisse)
          </summary>
          <div className="border-t border-gray-100 p-4 dark:border-gray-800">
            <p className="text-sm text-gray-600 mb-4">
              Cette demande débite uniquement la caisse agence. Aucun débit banque n'est autorisé à ce niveau.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Compte à débiter</label>
                <select
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {agencyCashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>Caisse agence — {formatCurrency(a.currentBalance, a.currency)}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ex. Carburant bus 12, Péage A1..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur (optionnel)</label>
                <select
                  value={formSupplierId}
                  onChange={(e) => setFormSupplierId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Aucun —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant</label>
                <input
                  type="text"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">URL justificatif (optionnel)</label>
                <input
                  type="url"
                  value={formReceiptUrl}
                  onChange={(e) => setFormReceiptUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <ActionButton
                  variant="primary"
                  onClick={handleSubmitExpense}
                  disabled={submitting || !formDescription.trim() || !formAmount.trim() || !formAccountId}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {" "}Soumettre la dépense
                </ActionButton>
              </div>
            </div>
          </div>
        </details>
      ) : (
      <SectionCard title="Nouvelle demande de dépense (caisse)" icon={Plus}>
        <p className="text-sm text-gray-600 mb-4">
          Cette demande débite uniquement la caisse agence. Aucun débit banque n'est autorisé à ce niveau.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Compte à débiter</label>
            <select
              value={formAccountId}
              onChange={(e) => setFormAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {agencyCashAccounts.map((a) => (
                <option key={a.id} value={a.id}>Caisse agence — {formatCurrency(a.currentBalance, a.currency)}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Ex. Carburant bus 12, Péage A1..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur (optionnel)</label>
            <select
              value={formSupplierId}
              onChange={(e) => setFormSupplierId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Aucun —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant</label>
            <input
              type="text"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">URL justificatif (optionnel)</label>
            <input
              type="url"
              value={formReceiptUrl}
              onChange={(e) => setFormReceiptUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <ActionButton
              variant="primary"
              onClick={handleSubmitExpense}
              disabled={submitting || !formDescription.trim() || !formAmount.trim() || !formAccountId}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {" "}Soumettre la dépense
            </ActionButton>
          </div>
        </div>
      </SectionCard>
      )}

      <SectionCard title="Demandes en attente de validation" icon={FileText}>
        {pendingExpenses.length === 0 ? (
          <EmptyState message="Aucune dépense en attente." />
        ) : (
          <ul className="space-y-2 text-sm">
            {pendingExpenses.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium">{e.category}</span>
                <span className="text-gray-600">
                  {money(e.amount)} — {e.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );

  return embedded ? (
    <div className="max-w-4xl min-w-0 space-y-4">{treasuryBody}</div>
  ) : (
    <StandardLayoutWrapper className="min-w-0" maxWidthClass="max-w-4xl">
      {treasuryBody}
    </StandardLayoutWrapper>
  );
}
