import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, SectionCard, ActionButton } from "@/ui";
import {
  EXPENSE_CATEGORIES,
  recordAgencyCashExpense,
} from "@/modules/compagnie/treasury/expenses";
import {
  agencyCashAccountDocId,
  ledgerAccountDocRef,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import { db } from "@/firebaseConfig";
import { collection, doc, getDoc } from "firebase/firestore";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/shared/utils/formatCurrency";

const DIRECT_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter(
  (category) => category !== "supplier_payment"
);
const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  fuel: "Carburant",
  maintenance: "Entretien",
  salary: "Salaire",
  toll: "Péage",
  operational: "Opérationnel",
  other: "Autre",
};

export default function AgencyTreasuryNewOperationPage() {
  const { user } = useAuth() as any;
  const { pathname } = useLocation();
  const companyId = user?.companyId ?? "";
  const defaultAgencyId = user?.agencyId ?? "";
  const fallbackAgencyName = user?.agencyNom ?? user?.agencyName ?? "Agence";
  const isStandaloneComptaTreasury = pathname.startsWith("/agence/comptabilite/treasury");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const pendingExpenseIdRef = useRef<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(DIRECT_EXPENSE_CATEGORIES[0]);
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
    const cashAccountId = agencyCashAccountDocId(defaultAgencyId);
    getDoc(ledgerAccountDocRef(companyId, cashAccountId))
      .then((cashAccountDoc) => {
        if (!cashAccountDoc.exists()) {
          setAgencyCashAccount(null);
          setAvailableCash(0);
          return;
        }
        const data = cashAccountDoc.data() as { balance?: number; currency?: string };
        const currency =
          typeof data.currency === "string" && data.currency.trim() ? data.currency.trim() : "XOF";
        const balance = Number(data.balance ?? 0) || 0;
        setAgencyCashAccount({
          id: cashAccountId,
          currentBalance: balance,
          currency,
        });
        setAvailableCash(balance);
      })
      .catch(() => {
        setAgencyCashAccount(null);
        setAvailableCash(0);
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

  const submitExpense = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      if (!companyId || !user?.uid) {
        toast.error("Utilisateur ou compagnie introuvable.");
        return;
      }
      if (!defaultAgencyId) {
        toast.error("Aucune agence associée à ce compte.");
        return;
      }
      if (!agencyCashAccount) {
        toast.error("Caisse agence indisponible.");
        return;
      }
      const numericAmount = Number(amount.replace(",", "."));
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        toast.error("Montant valide requis.");
        return;
      }

      const expenseId =
        pendingExpenseIdRef.current
        ?? doc(collection(db, "companies", companyId, "expenses")).id;
      pendingExpenseIdRef.current = expenseId;

      const result = await recordAgencyCashExpense({
        companyId,
        agencyId: defaultAgencyId,
        category,
        description: description.trim(),
        amount: numericAmount,
        accountId: agencyCashAccount.id,
        createdBy: user.uid,
        currency: agencyCashAccount.currency,
        expenseId,
      });
      toast.success(
        result.status === "paid"
          ? "Dépense enregistrée et caisse débitée"
          : "Dépense envoyée au chef pour validation"
      );
      if (result.status === "paid" && !result.idempotent) {
        setAvailableCash((current) => Math.max(0, current - numericAmount));
      }
      pendingExpenseIdRef.current = null;
      setDescription("");
      setAmount("");
    } catch (error) {
      console.error("[AgencyExpense] submit failed", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de la soumission.");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const resetPendingExpenseId = () => {
    pendingExpenseIdRef.current = null;
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
      {loading ? (
        <SectionCard title="Chargement">
          <div className="py-8 text-center text-gray-500">Chargement des données...</div>
        </SectionCard>
      ) : null}

      {!loading && (
        <SectionCard title="Nouvelle dépense" icon={PlusCircle}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Caisse agence</label>
              <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                {agencyCashAccount
                  ? `${agencyDisplayName} : ${formatCurrency(availableCash, agencyCashAccount.currency)}`
                  : "Caisse agence indisponible"}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => {
                    resetPendingExpenseId();
                    setCategory(e.target.value);
                  }}
                >
                  {DIRECT_EXPENSE_CATEGORIES.map((c) => (
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
                  onChange={(e) => {
                    resetPendingExpenseId();
                    setAmount(e.target.value);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Solde disponible : {formatCurrency(availableCash, agencyCashAccount?.currency ?? "XOF")}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => {
                  resetPendingExpenseId();
                  setDescription(e.target.value);
                }}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Description facultative"
              />
            </div>

            <ActionButton onClick={submitExpense} disabled={submitting}>
              {submitting ? "Enregistrement..." : "Enregistrer la dépense"}
            </ActionButton>
          </div>
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
