import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams, useParams } from "react-router-dom";
import { SectionCard, ActionButton } from "@/ui";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { getFinancialAccountDisplayName } from "@/modules/compagnie/treasury/accountDisplay";
import {
  transferBetweenAccounts,
  agencyDepositToBank,
  mobileToBankTransfer,
} from "@/modules/compagnie/treasury/treasuryTransferService";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/shared/utils/formatCurrency";

type TransferMode = "internal_transfer" | "agency_deposit" | "mobile_to_bank";

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

export default function TreasuryTransferPage() {
  const { user } = useAuth() as any;
  const params = useParams<{ companyId: string }>();
  const [searchParams] = useSearchParams();
  const companyId = params.companyId ?? searchParams.get("companyId") ?? user?.companyId ?? "";

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [agencyNameById, setAgencyNameById] = useState<Record<string, string>>({});
  const [companyBanksById, setCompanyBanksById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<TransferMode>("internal_transfer");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    Promise.all([
      listAccounts(companyId),
      getDocs(collection(db, "companies", companyId, "agences")),
      getDocs(collection(db, "companies", companyId, "companyBanks")),
    ])
      .then(([rows, agencySnap, banksSnap]) => {
        setAccounts(rows);
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
        if (rows.length > 1) {
          setFromAccountId(rows[0].id);
          setToAccountId(rows[1].id);
        } else if (rows.length === 1) {
          setFromAccountId(rows[0].id);
          setToAccountId(rows[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const selectedFrom = useMemo(
    () => accounts.find((a) => a.id === fromAccountId) ?? null,
    [accounts, fromAccountId]
  );
  const selectedTo = useMemo(
    () => accounts.find((a) => a.id === toAccountId) ?? null,
    [accounts, toAccountId]
  );
  const currency = selectedFrom?.currency || selectedTo?.currency || "XOF";

  const agencyCashAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "agency_cash"),
    [accounts]
  );
  const companyBankAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "company_bank"),
    [accounts]
  );
  const mobileAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "company_mobile_money" || a.accountType === "mobile_money"),
    [accounts]
  );

  const handleSubmit = async () => {
    if (!companyId || !user?.uid) return;
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Montant invalide.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "internal_transfer") {
        if (!fromAccountId || !toAccountId) {
          toast.error("Sélectionnez les comptes source et destination.");
          return;
        }
        await transferBetweenAccounts({
          companyId,
          fromAccountId,
          toAccountId,
          amount: numericAmount,
          currency,
          performedBy: user.uid,
          performedByRole: user.role ?? null,
          idempotencyKey: makeIdempotencyKey(),
          description: description.trim() || "Transfert interne",
        });
      } else if (mode === "agency_deposit") {
        if (!fromAccountId || !toAccountId) {
          toast.error("Sélectionnez la caisse agence et la banque compagnie.");
          return;
        }
        await agencyDepositToBank({
          companyId,
          agencyCashAccountId: fromAccountId,
          companyBankAccountId: toAccountId,
          amount: numericAmount,
          currency,
          performedBy: user.uid,
          performedByRole: user.role ?? null,
          idempotencyKey: makeIdempotencyKey(),
          description: description.trim() || "Dépôt caisse vers banque",
        });
      } else {
        if (!fromAccountId || !toAccountId) {
          toast.error("Sélectionnez le compte mobile money et la banque compagnie.");
          return;
        }
        await mobileToBankTransfer({
          companyId,
          mobileMoneyAccountId: fromAccountId,
          companyBankAccountId: toAccountId,
          amount: numericAmount,
          currency,
          performedBy: user.uid,
          performedByRole: user.role ?? null,
          idempotencyKey: makeIdempotencyKey(),
          description: description.trim() || "Transfert mobile money vers banque",
        });
      }
      toast.success("Transfert enregistré.");
      setAmount("");
      setDescription("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du transfert.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Transfert de trésorerie" icon={ArrowRightLeft}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement des comptes...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${mode === "internal_transfer" ? "border-indigo-500 bg-indigo-50" : "border-gray-300"}`}
                onClick={() => {
                  setMode("internal_transfer");
                  setFromAccountId(accounts[0]?.id ?? "");
                  setToAccountId(accounts[1]?.id ?? "");
                }}
              >
                Virement interne
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${mode === "agency_deposit" ? "border-indigo-500 bg-indigo-50" : "border-gray-300"}`}
                onClick={() => {
                  setMode("agency_deposit");
                  setFromAccountId(agencyCashAccounts[0]?.id ?? "");
                  setToAccountId(companyBankAccounts[0]?.id ?? "");
                }}
              >
                Dépôt agence vers banque
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${mode === "mobile_to_bank" ? "border-indigo-500 bg-indigo-50" : "border-gray-300"}`}
                onClick={() => {
                  setMode("mobile_to_bank");
                  setFromAccountId(mobileAccounts[0]?.id ?? "");
                  setToAccountId(companyBankAccounts[0]?.id ?? "");
                }}
              >
                Mobile money vers banque
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Compte source</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {(mode === "agency_deposit" ? agencyCashAccounts : mode === "mobile_to_bank" ? mobileAccounts : accounts).map((a) => (
                    <option key={a.id} value={a.id}>
                      {getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById: companyBanksById })} ({a.accountType}) - {formatCurrency(a.currentBalance, a.currency)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Compte destination</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {(mode === "internal_transfer" ? accounts : companyBankAccounts).map((a) => (
                    <option key={a.id} value={a.id}>
                      {getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById: companyBanksById })} ({a.accountType})
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

            <ActionButton onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Traitement..." : "Valider le transfert"}
            </ActionButton>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

