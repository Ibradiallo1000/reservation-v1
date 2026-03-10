import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SectionCard, ActionButton } from "@/ui";
import { createExpense, EXPENSE_CATEGORIES } from "@/modules/compagnie/treasury/expenses";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { getFinancialAccountDisplayName } from "@/modules/compagnie/treasury/accountDisplay";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";

type OperationKind = "expense" | "transfer" | "supplier_payment";

type AccountRow = {
  id: string;
  agencyId: string | null;
  accountName: string;
  accountType: string;
  currency: string;
};

export default function TreasuryNewOperationPage() {
  const { user } = useAuth() as any;
  const params = useParams<{ companyId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyId = params.companyId ?? searchParams.get("companyId") ?? user?.companyId ?? "";

  const [operation, setOperation] = useState<OperationKind>("expense");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([]);
  const [companyBanksById, setCompanyBanksById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [accountId, setAccountId] = useState("");
  const [agencyId, setAgencyId] = useState<string>("");

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      listAccounts(companyId),
      getDocs(collection(db, "companies", companyId, "agences")),
      getDocs(collection(db, "companies", companyId, "companyBanks")),
    ])
      .then(([accountRows, agencySnap, banksSnap]) => {
        setAccounts(accountRows);
        if (accountRows.length > 0) setAccountId(accountRows[0].id);
        const agencyRows = agencySnap.docs.map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string; name?: string };
          return {
            id: d.id,
            name: data.nom ?? data.nomAgence ?? data.name ?? d.id,
          };
        });
        setAgencies(agencyRows);
        const banksMap: Record<string, string> = {};
        banksSnap.docs.forEach((d) => {
          const data = d.data() as { name?: string; isActive?: boolean };
          if (data.isActive === false) return;
          banksMap[d.id] = data.name ?? d.id;
        });
        setCompanyBanksById(banksMap);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const agencyNameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    agencies.forEach((a) => {
      map[a.id] = a.name;
    });
    return map;
  }, [agencies]);

  const openTransferPage = () => {
    navigate(`/compagnie/${companyId}/accounting/treasury/transfer`);
  };

  const openSupplierPaymentPage = () => {
    navigate(`/compagnie/${companyId}/accounting/supplier-payments`);
  };

  const submitExpense = async () => {
    if (!companyId || !user?.uid || !accountId) return;
    const numericAmount = Number(amount.replace(",", "."));
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Description et montant valides requis.");
      return;
    }
    setSubmitting(true);
    try {
      await createExpense({
        companyId,
        agencyId: agencyId || null,
        category,
        description: description.trim(),
        amount: numericAmount,
        accountId,
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
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Nouvelle opération de trésorerie" icon={PlusCircle}>
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
            Paiement fournisseur
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Agence (optionnel)</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={agencyId}
                  onChange={(e) => setAgencyId(e.target.value)}
                >
                  <option value="">Niveau compagnie</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Compte de dépense</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById: companyBanksById })} ({a.accountType})
                    </option>
                  ))}
                </select>
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
                      {c}
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
            Cette opération réutilise les services de trésorerie existants : transfert interne, dépôt agence vers banque, mobile money vers banque.
          </p>
          <ActionButton onClick={openTransferPage}>Ouvrir la page de transfert</ActionButton>
        </SectionCard>
      )}

      {!loading && operation === "supplier_payment" && (
        <SectionCard title="Paiements fournisseurs">
          <p className="text-sm text-gray-600 mb-3">
            Cette opération réutilise le domaine existant `payables` / `paymentProposals` / `payPayable`.
          </p>
          <ActionButton onClick={openSupplierPaymentPage}>Ouvrir la page de paiement fournisseur</ActionButton>
        </SectionCard>
      )}
    </div>
  );
}

