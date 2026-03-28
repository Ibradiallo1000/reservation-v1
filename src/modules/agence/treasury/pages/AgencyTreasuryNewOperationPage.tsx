import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, SectionCard, ActionButton } from "@/ui";
import { createExpense, EXPENSE_CATEGORIES } from "@/modules/compagnie/treasury/expenses";
import { getAccount } from "@/modules/compagnie/treasury/financialAccounts";
import { getAgencyOperationalAvailableCash } from "@/modules/agence/comptabilite/agencyCashAuditService";
import { agencyCashAccountId } from "@/modules/compagnie/treasury/types";
import { db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/shared/utils/formatCurrency";

type OperationKind = "expense" | "transfer" | "supplier_payment";
const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  fuel: "Carburant",
  maintenance: "Entretien",
  salary: "Salaire",
  toll: "Péage",
  operational: "Opérationnel",
  supplier_payment: "Paiement fournisseur",
  other: "Autre",
};

export default function AgencyTreasuryNewOperationPage() {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const companyId = user?.companyId ?? "";
  const defaultAgencyId = user?.agencyId ?? "";
  const fallbackAgencyName = user?.agencyNom ?? user?.agencyName ?? "Agence";
  const treasuryBasePath = pathname.startsWith("/agence/comptabilite/treasury")
    ? "/agence/comptabilite/treasury"
    : "/agence/treasury";
  const isStandaloneComptaTreasury = pathname.startsWith("/agence/comptabilite/treasury");

  const [operation, setOperation] = useState<OperationKind>("expense");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [agencyDisplayName, setAgencyDisplayName] = useState<string>(fallbackAgencyName);
  const [agencyCashAccount, setAgencyCashAccount] = useState<{
    id: string;
    currentBalance: number;
    currency: string;
  } | null>(null);
  const [availableCash, setAvailableCash] = useState<number>(0);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!defaultAgencyId) {
      setAgencyCashAccount(null);
      setLoading(false);
      return;
    }
    Promise.all([
      getAccount(companyId, agencyCashAccountId(defaultAgencyId)),
      getAgencyOperationalAvailableCash(companyId, defaultAgencyId).catch(() => null),
    ])
      .then(([cashAccount, ops]) => {
        setAgencyCashAccount(cashAccount);
        const mirror = Number(cashAccount?.currentBalance ?? 0);
        const fromLedger = Number(ops?.availableCash ?? 0);
        /** Même source que createExpense (financialAccounts) ; le solde ledger seul peut rester à 0 si miroir désynchronisé. */
        setAvailableCash(cashAccount != null ? mirror : fromLedger);
      })
      .finally(() => setLoading(false));
  }, [companyId, defaultAgencyId]);

  useEffect(() => {
    setAgencyDisplayName(fallbackAgencyName);
    if (!companyId || !defaultAgencyId) return;

    getDoc(doc(db, "companies", companyId, "agences", defaultAgencyId))
      .then((agencyDoc) => {
        if (!agencyDoc.exists()) return;
        const data = agencyDoc.data() as {
          nom?: string;
          nomAgence?: string;
          name?: string;
        };
        const officialName = data.nom ?? data.nomAgence ?? data.name;
        if (officialName && officialName.trim()) {
          setAgencyDisplayName(officialName.trim());
        }
      })
      .catch(() => {});
  }, [companyId, defaultAgencyId, fallbackAgencyName]);

  const openTransferPage = () => {
    navigate(`${treasuryBasePath}/transfer`);
  };

  const openSupplierPayablePage = () => {
    navigate(`${treasuryBasePath}/new-payable`);
  };

  const submitExpense = async () => {
    if (!companyId || !user?.uid) return;
    if (!defaultAgencyId) {
      toast.error("Aucune agence associée à ce compte.");
      return;
    }
    if (!agencyCashAccount) {
      toast.error("Aucune caisse agence configurée.");
      return;
    }
    const numericAmount = Number(amount.replace(",", "."));
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Description et montant valides requis.");
      return;
    }
    if (numericAmount > availableCash) {
      toast.error("Montant supérieur au cash disponible en caisse.");
      return;
    }
    setSubmitting(true);
    try {
      await createExpense({
        companyId,
        agencyId: defaultAgencyId,
        category,
        description: description.trim(),
        amount: numericAmount,
        accountId: agencyCashAccount.id,
        createdBy: user.uid,
        expenseCategory: category,
      });
      toast.success("Demande de dépense soumise.");
      setDescription("");
      setAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la soumission.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!companyId) {
    const missing = <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
    return isStandaloneComptaTreasury ? (
      <StandardLayoutWrapper className="min-w-0">{missing}</StandardLayoutWrapper>
    ) : (
      missing
    );
  }

  const body = (
    <div className="min-w-0 space-y-6">
      <SectionCard title="Nouvelle opération de trésorerie agence" icon={PlusCircle}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setOperation("expense")}
            className={`rounded-lg border px-3 py-2 text-sm ${operation === "expense" ? "border-indigo-500 bg-indigo-50" : "border-gray-300"}`}
          >
            Dépense
          </button>
          <button
            type="button"
            onClick={() => setOperation("transfer")}
            className={`rounded-lg border px-3 py-2 text-sm ${operation === "transfer" ? "border-indigo-500 bg-indigo-50" : "border-gray-300"}`}
          >
            Transfert
          </button>
          <button
            type="button"
            onClick={() => setOperation("supplier_payment")}
            className={`rounded-lg border px-3 py-2 text-sm ${operation === "supplier_payment" ? "border-indigo-500 bg-indigo-50" : "border-gray-300"}`}
          >
            Nouveau payable
          </button>
        </div>
      </SectionCard>

      {loading ? (
        <SectionCard title="Chargement">
          <div className="py-8 text-center text-gray-500">Chargement des données...</div>
        </SectionCard>
      ) : null}

      {!loading && operation === "expense" && (
        <SectionCard title="Soumettre une dépense">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agence</label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                  {agencyDisplayName}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source (caisse agence)</label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                  {agencyCashAccount
                    ? `Caisse agence : ${formatCurrency(availableCash, agencyCashAccount.currency)}`
                    : "Aucune caisse agence configurée"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant</label>
                <input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Disponible en caisse: {formatCurrency(availableCash, agencyCashAccount?.currency ?? "XOF")}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Motif de la dépense"
              />
            </div>

            <ActionButton onClick={submitExpense} disabled={submitting}>
              {submitting ? "Soumission..." : "Soumettre la dépense"}
            </ActionButton>
          </div>
        </SectionCard>
      )}

      {!loading && operation === "transfer" && (
        <SectionCard title="Transferts">
          <p className="text-sm text-gray-600 mb-3">
            Cette opération réutilise les services de trésorerie existants.
          </p>
          <ActionButton onClick={openTransferPage}>Ouvrir la page de transfert</ActionButton>
        </SectionCard>
      )}

      {!loading && operation === "supplier_payment" && (
        <SectionCard title="Comptes fournisseurs">
          <p className="text-sm text-gray-600 mb-3">
            Créer un payable fournisseur avant paiement.
          </p>
          <ActionButton onClick={openSupplierPayablePage}>Ouvrir la page nouveau payable</ActionButton>
        </SectionCard>
      )}
    </div>
  );

  return isStandaloneComptaTreasury ? (
    <StandardLayoutWrapper className="min-w-0">{body}</StandardLayoutWrapper>
  ) : (
    body
  );
}
