// Treasury dashboard — Agency: local accounts, cash position, recent movements, pending expenses.
import React, { useEffect, useState } from "react";
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

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "Carburant",
  maintenance: "Maintenance",
  salary: "Salaires",
  toll: "Péage",
  operational: "Opérationnel",
  supplier_payment: "Fournisseur",
  other: "Autre",
};

export default function AgencyTreasuryPage() {
  const { user, company } = useAuth();
  const money = useFormatCurrency();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [accounts, setAccounts] = useState<{ id: string; accountName: string; currentBalance: number; currency: string; accountType: string }[]>([]);
  const [movements, setMovements] = useState<{ id: string; amount: number; movementType: string; performedAt: unknown }[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<{ id: string; amount: number; category: string; status: ExpenseStatus }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
    ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as { nom?: string })?.nom)
      .then(() => listAccounts(companyId, { agencyId }))
      .then(setAccounts)
      .catch(() => {
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger la trésorerie."
            : "Erreur lors du chargement de la trésorerie."
        );
      })
      .finally(() => setLoading(false));
  }, [companyId, agencyId, company, isOnline, reloadKey]);

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
      collection(db, `companies/${companyId}/financialMovements`),
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
            movementType: data.movementType ?? "",
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

  if (!companyId || !agencyId) {
    return (
      <StandardLayoutWrapper>
        <p className="text-gray-500">Contexte agence introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  if (loading && accounts.length === 0) {
    return <PageLoadingState />;
  }

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-4xl">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certaines données peuvent être incomplètes." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <PageHeader
        title="Trésorerie agence"
        subtitle={formatDateLongFr(new Date())}
        icon={Wallet}
        right={
          <div className="flex items-center gap-2">
            <ActionButton onClick={() => navigate("/agence/treasury/new-operation")}>
              Soumettre dépense
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => navigate("/agence/treasury/transfer")}>
              Versement banque compagnie
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => navigate("/agence/treasury/new-payable")}>
              Paiement fournisseur
            </ActionButton>
          </div>
        }
      />

      <SectionCard title="Position caisse agence" icon={Wallet}>
        <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{money(totalAgencyCash)}</div>
        <ul className="mt-3 space-y-2 text-sm">
          {agencyCashAccounts.map((a) => (
            <li key={a.id} className="flex justify-between">
              <span>Caisse agence</span>
              <span className="font-medium">{formatCurrency(a.currentBalance, a.currency)}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Derniers mouvements" icon={ArrowRightLeft}>
        <div className={table.wrapper + " max-h-64 overflow-y-auto"}>
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
                    <td className={table.td}>{m.movementType}</td>
                    <td className={table.tdRight}>{m.amount > 0 ? `+${money(m.amount)}` : money(m.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

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

      <SectionCard title="Demandes en attente de validation" icon={FileText}>
        {pendingExpenses.length === 0 ? (
          <EmptyState message="Aucune dépense en attente." />
        ) : (
          <ul className="space-y-2 text-sm">
            {pendingExpenses.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>{e.category}</span>
                <span>{money(e.amount)} — {e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
