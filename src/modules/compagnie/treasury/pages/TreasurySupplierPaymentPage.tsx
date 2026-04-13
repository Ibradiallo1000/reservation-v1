import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SectionCard, ActionButton } from "@/ui";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { getFinancialAccountDisplayName } from "@/modules/compagnie/treasury/accountDisplay";
import { listUnpaidPayables } from "@/modules/compagnie/finance/payablesService";
import { payPayable } from "@/modules/compagnie/finance/paymentsService";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { formatCurrency } from "@/shared/utils/formatCurrency";

type AccountRow = {
  id: string;
  agencyId: string | null;
  accountName: string;
  accountType: string;
  currentBalance: number;
  currency: string;
};

type PayableRow = {
  id: string;
  supplierName: string;
  description: string;
  remainingAmount: number;
  approvalStatus: string;
};

const makeIdempotencyKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export default function TreasurySupplierPaymentPage() {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const params = useParams<{ companyId: string }>();
  const [searchParams] = useSearchParams();
  const companyId = params.companyId ?? searchParams.get("companyId") ?? user?.companyId ?? "";

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [agencyNameById, setAgencyNameById] = useState<Record<string, string>>({});
  const [companyBanksById, setCompanyBanksById] = useState<Record<string, string>>({});
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payableId, setPayableId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      listAccounts(companyId),
      listUnpaidPayables(companyId),
      getDocs(collection(db, "companies", companyId, "agences")),
      getDocs(collection(db, "companies", companyId, "companyBanks")),
    ])
      .then(([accountRows, payableRows, agencySnap, banksSnap]) => {
        setAccounts(accountRows);
        const agenciesMap: Record<string, string> = {};
        agencySnap.docs.forEach((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string; name?: string };
          agenciesMap[d.id] = data.nom ?? data.nomAgence ?? data.name ?? d.id;
        });
        setAgencyNameById(agenciesMap);
        const banksMap: Record<string, string> = {};
        banksSnap.docs.forEach((d) => {
          const data = d.data() as { name?: string; isActive?: boolean };
          if (data.isActive === false) return;
          banksMap[d.id] = data.name ?? d.id;
        });
        setCompanyBanksById(banksMap);
        const approved = payableRows
          .filter((p) => String((p as any).approvalStatus ?? "") === "approved")
          .map((p) => ({
            id: p.id,
            supplierName: p.supplierName,
            description: p.description,
            remainingAmount: Number(p.remainingAmount ?? 0),
            approvalStatus: String((p as any).approvalStatus ?? ""),
          }));
        setPayables(approved);
        if (accountRows.length > 0) setFromAccountId(accountRows[0].id);
        if (approved.length > 0) {
          setPayableId(approved[0].id);
          setAmount(String(approved[0].remainingAmount));
        }
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const selectedPayable = useMemo(
    () => payables.find((p) => p.id === payableId) ?? null,
    [payables, payableId]
  );
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === fromAccountId) ?? null,
    [accounts, fromAccountId]
  );
  const currency = selectedAccount?.currency ?? "XOF";

  const handlePay = async () => {
    if (!companyId || !user?.uid || !payableId || !fromAccountId) {
      toast.error("Informations manquantes.");
      return;
    }
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Montant invalide.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await payPayable({
        companyId,
        payableId,
        fromAccountId,
        amount: numericAmount,
        currency,
        performedBy: user.uid,
        performedByRole: user.role ?? null,
        idempotencyKey: makeIdempotencyKey(),
      });
      if (result.status === "pending_ceo_approval") {
        toast.success("Demande de paiement créée (validation CEO requise).");
      } else {
        toast.success("Paiement fournisseur exécuté.");
      }
      setAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du paiement.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Paiement fournisseur" icon={Receipt}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement...</div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => navigate(`/compagnie/${companyId}/accounting/documents`)}
              >
                Documents & archives
              </ActionButton>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facture fournisseur (payable)</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={payableId}
                onChange={(e) => {
                  const id = e.target.value;
                  setPayableId(id);
                  const p = payables.find((x) => x.id === id);
                  if (p) setAmount(String(p.remainingAmount));
                }}
              >
                <option value="">Sélectionner</option>
                {payables.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.supplierName} - {p.description} (reste: {formatCurrency(p.remainingAmount, currency)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Compte à débiter</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
              >
                <option value="">Sélectionner</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById: companyBanksById })} ({a.accountType}) - {formatCurrency(a.currentBalance, a.currency)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant à payer</label>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              {selectedPayable && (
                <p className="text-xs text-gray-500 mt-1">
                  Solde restant: {formatCurrency(selectedPayable.remainingAmount, currency)}
                </p>
              )}
            </div>

            <ActionButton onClick={handlePay} disabled={submitting}>
              {submitting ? "Traitement..." : "Payer le fournisseur"}
            </ActionButton>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
