import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, ActionButton } from "@/ui";
import { getAccount, listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { agencyDepositToBank } from "@/modules/compagnie/treasury/treasuryTransferService";
import { agencyCashAccountId } from "@/modules/compagnie/treasury/types";
import { getFinancialAccountDisplayName } from "@/modules/compagnie/treasury/accountDisplay";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/shared/utils/formatCurrency";

type AccountRow = {
  id: string;
  agencyId: string | null;
  accountType: string;
  accountName: string;
  currentBalance: number;
  currency: string;
};

const makeIdempotencyKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export default function AgencyTreasuryTransferPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [companyBankAccounts, setCompanyBankAccounts] = useState<AccountRow[]>([]);
  const [agencyCashAccount, setAgencyCashAccount] = useState<{
    id: string;
    currentBalance: number;
    currency: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [companyBankNameById, setCompanyBankNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }
    Promise.all([
      getAccount(companyId, agencyCashAccountId(agencyId)),
      listAccounts(companyId, { agencyId: null, accountType: "company_bank" }),
    ])
      .then(([cashAccount, banks]) => {
        setAgencyCashAccount(cashAccount);
        setCompanyBankAccounts(banks);
      })
      .finally(() => setLoading(false));
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, "companies", companyId, "companyBanks"))
      .then((snap) => {
        const names: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { name?: string; isActive?: boolean };
          if (data.isActive === false) return;
          names[d.id] = data.name ?? d.id;
        });
        setCompanyBankNameById(names);
      })
      .catch(() => setCompanyBankNameById({}));
  }, [companyId]);

  const availableAgencyCash = useMemo(
    () => agencyCashAccount?.currentBalance ?? 0,
    [agencyCashAccount],
  );
  const canInitiateTransfer =
    user?.role === "agency_accountant" ||
    user?.role === "admin_compagnie";

  useEffect(() => {
    if (!toAccountId && companyBankAccounts.length > 0) {
      setToAccountId(companyBankAccounts[0].id);
    }
  }, [toAccountId, companyBankAccounts]);

  const handleSubmit = async () => {
    if (!companyId || !user?.uid) return;
    if (!agencyId) {
      toast.error("Aucune agence associée à ce compte.");
      return;
    }
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Montant invalide.");
      return;
    }
    if (!agencyCashAccount) {
      toast.error("Aucune caisse agence configurée.");
      return;
    }
    if (!toAccountId) {
      toast.error("Sélectionnez la banque compagnie de destination.");
      return;
    }
    if (numericAmount > availableAgencyCash) {
      toast.error("Montant supérieur au cash disponible en caisse.");
      return;
    }
    const selectedTo = companyBankAccounts.find((a) => a.id === toAccountId);
    const currency = agencyCashAccount.currency || selectedTo?.currency || "XOF";

    setSubmitting(true);
    try {
      await agencyDepositToBank({
        companyId,
        agencyCashAccountId: agencyCashAccount.id,
        companyBankAccountId: toAccountId,
        amount: numericAmount,
        currency,
        performedBy: user.uid,
        performedByRole: user.role ?? null,
        idempotencyKey: makeIdempotencyKey(),
        description: description.trim() || "Dépôt caisse agence vers banque compagnie",
      });
      toast.success("Versement vers la banque compagnie enregistré.");
      setAmount("");
      setDescription("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du versement.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Versement caisse agence vers banque compagnie" icon={ArrowRightLeft}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement des comptes...</div>
        ) : (
          <div className="space-y-4">
            {!canInitiateTransfer && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Mode consultation: seul le comptable agence peut initier ce versement.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Caisse agence (automatique)</label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                  {agencyCashAccount
                    ? `Caisse agence - ${formatCurrency(agencyCashAccount.currentBalance, agencyCashAccount.currency)}`
                    : "Aucune caisse agence configurée"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination (banque compagnie)</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {companyBankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {getFinancialAccountDisplayName(a, { companyBankNameById })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  Disponible en caisse: {formatCurrency(availableAgencyCash, agencyCashAccount?.currency ?? "XOF")}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Motif du transfert"
                />
              </div>
            </div>

            <ActionButton onClick={handleSubmit} disabled={submitting || !canInitiateTransfer}>
              {submitting ? "Traitement..." : "Initier le versement"}
            </ActionButton>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
