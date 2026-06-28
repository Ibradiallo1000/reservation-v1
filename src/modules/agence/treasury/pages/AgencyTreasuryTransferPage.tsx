import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, SectionCard, ActionButton } from "@/ui";
import {
  agencyCashAccountDocId,
  ledgerAccountDocRef,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import {
  companyBankAccountId,
} from "@/modules/compagnie/treasury/types";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  approveTransferRequest,
  createTransferRequest,
  listTransferRequests,
  rejectTransferRequest,
  type TransferRequestDoc,
} from "@/modules/agence/treasury/transferRequestsService";

type AccountRow = {
  id: string;
  accountName: string;
  currency: string;
};

type TransferRequestRow = TransferRequestDoc & { id: string };

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending_manager: "En attente chef d'agence",
  approved: "Validée",
  rejected: "Refusée",
  executed: "Exécutée",
};

export default function AgencyTreasuryTransferPage() {
  const { pathname } = useLocation();
  const isStandaloneComptaTreasury = pathname.startsWith("/agence/comptabilite/treasury");
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const fallbackAgencyName = user?.agencyNom ?? user?.agencyName ?? "Agence";
  const roles: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const hasRole = (role: string) => roles.includes(role);

  const [companyBankAccounts, setCompanyBankAccounts] = useState<AccountRow[]>([]);
  const [agencyCashAccount, setAgencyCashAccount] = useState<{
    id: string;
    currentBalance: number;
    currency: string;
  } | null>(null);
  const [availableAgencyCash, setAvailableAgencyCash] = useState<number>(0);
  const [agencyDisplayName, setAgencyDisplayName] = useState(fallbackAgencyName);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [companyBankNameById, setCompanyBankNameById] = useState<Record<string, string>>({});
  const [requests, setRequests] = useState<TransferRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [cashAccountDoc, banksSnapshot, agencyDoc] = await Promise.all([
          getDoc(ledgerAccountDocRef(companyId, agencyCashAccountDocId(agencyId))),
          getDocs(
            query(
              collection(db, "companies", companyId, "companyBanks"),
              where("isActive", "==", true)
            )
          ),
          getDoc(doc(db, "companies", companyId, "agences", agencyId)).catch(() => null),
        ]);
        const banks = banksSnapshot.docs.map((bankDoc) => {
          const data = bankDoc.data() as { name?: string; currency?: string };
          return {
            id: companyBankAccountId(bankDoc.id),
            accountName: data.name?.trim() || "Banque compagnie",
            currency: data.currency?.trim() || "XOF",
          };
        });
        const cashData = cashAccountDoc.exists()
          ? (cashAccountDoc.data() as { balance?: number; currency?: string })
          : null;
        const cashAccount = cashData
          ? {
              id: agencyCashAccountDocId(agencyId),
              currentBalance: Number(cashData.balance ?? 0) || 0,
              currency: cashData.currency?.trim() || "XOF",
            }
          : null;
        const bankNames = Object.fromEntries(
          banksSnapshot.docs.map((bankDoc) => [
            bankDoc.id,
            (bankDoc.data() as { name?: string }).name?.trim() || bankDoc.id,
          ])
        );
        if (!cancelled) {
          setAgencyCashAccount(cashAccount);
          setCompanyBankAccounts(banks);
          setAvailableAgencyCash(cashAccount?.currentBalance ?? 0);
          setCompanyBankNameById(bankNames);
          if (agencyDoc?.exists()) {
            const agencyData = agencyDoc.data() as { nom?: string; nomAgence?: string; name?: string };
            const officialName = agencyData.nom ?? agencyData.nomAgence ?? agencyData.name;
            if (officialName?.trim()) setAgencyDisplayName(officialName.trim());
          }
        }
      } catch (e) {
        console.error("[AgencyTreasuryTransferPage] chargement comptes", e);
        if (!cancelled) {
          setAgencyCashAccount(null);
          setCompanyBankAccounts([]);
          const msg =
            e && typeof e === "object" && "code" in e
              ? String(
                  (e as { code?: string; message?: string }).code ??
                    (e as { message?: string }).message
                )
              : e instanceof Error
                ? e.message
                : "Erreur inconnue";
          toast.error(
            `Impossible de charger la caisse ou les banques. Vérifiez la connexion et les règles Firestore (comptable agence). Détail : ${msg}`
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    setAgencyDisplayName(fallbackAgencyName);
  }, [fallbackAgencyName]);

  const canInitiateTransfer = hasRole("agency_accountant") || hasRole("admin_compagnie");
  const canValidateTransfer = hasRole("chefAgence") || hasRole("superviseur") || hasRole("admin_compagnie");

  useEffect(() => {
    if (!toAccountId && companyBankAccounts.length > 0) {
      setToAccountId(companyBankAccounts[0].id);
    }
  }, [toAccountId, companyBankAccounts]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    let cancelled = false;

    const load = async () => {
      setRequestsLoading(true);
      try {
        const list = await listTransferRequests(companyId, { agencyId, limitCount: 50 });
        if (!cancelled) setRequests(list);
      } catch {
        if (!cancelled) setRequests([]);
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    };

    void load();
    const interval = setInterval(() => void load(), 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [companyId, agencyId]);

  const handleSubmit = async () => {
    if (!companyId || !user?.uid) {
      toast.error("Session invalide : reconnectez-vous.");
      return;
    }
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
      await createTransferRequest({
        companyId,
        agencyId,
        fromAccountId: agencyCashAccount.id,
        toAccountId,
        amount: numericAmount,
        currency,
        initiatedBy: user.uid,
        initiatedByRoles: roles,
        description: description.trim() || "Transfert caisse agence vers banque",
      });
      toast.success("Demande de transfert créée. En attente de validation chef d'agence.");
      setAmount("");
      setDescription("");
      const list = await listTransferRequests(companyId, { agencyId, limitCount: 50 });
      setRequests(list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la création de la demande.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!companyId || !user?.uid) return;
    setBusyRequestId(requestId);
    try {
      await approveTransferRequest({
        companyId,
        requestId,
        managerId: user.uid,
        managerRoles: roles,
      });
      toast.success("Versement validé et exécuté.");
      const list = await listTransferRequests(companyId, { agencyId, limitCount: 50 });
      setRequests(list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la validation.");
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!companyId || !user?.uid) return;
    const reason = window.prompt("Motif du refus (optionnel) :") ?? "";
    setBusyRequestId(requestId);
    try {
      await rejectTransferRequest({
        companyId,
        requestId,
        managerId: user.uid,
        managerRoles: roles,
        reason,
      });
      toast.success("Demande de versement refusée.");
      const list = await listTransferRequests(companyId, { agencyId, limitCount: 50 });
      setRequests(list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du refus.");
    } finally {
      setBusyRequestId(null);
    }
  };

  const pendingForValidation = useMemo(
    () => requests.filter((r) => r.status === "pending_manager"),
    [requests]
  );
  const recentRequests = useMemo(() => requests.slice(0, 12), [requests]);

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
      <SectionCard title="Transfert caisse agence vers banque" icon={ArrowRightLeft}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement des comptes...</div>
        ) : (
          <div className="space-y-4">
            {!canInitiateTransfer && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Mode consultation : seul le comptable agence peut initier ce transfert.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source agence</label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                  {agencyCashAccount
                    ? `${agencyDisplayName} — Caisse agence : ${formatCurrency(availableAgencyCash, agencyCashAccount.currency)}`
                    : "Caisse agence introuvable"}
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
                      {a.accountName}
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
                  Disponible (ledger) : {formatCurrency(availableAgencyCash, agencyCashAccount?.currency ?? "XOF")}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif facultatif</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Motif du transfert"
                />
              </div>
            </div>

            {canInitiateTransfer ? (
              <ActionButton type="button" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? "Traitement..." : "Enregistrer le transfert"}
              </ActionButton>
            ) : null}
          </div>
        )}
      </SectionCard>

      {canValidateTransfer && (
        <SectionCard title="Demandes en attente de validation">
          {requestsLoading ? (
            <div className="py-4 text-sm text-gray-500">Chargement des demandes...</div>
          ) : pendingForValidation.length === 0 ? (
            <div className="py-4 text-sm text-gray-500">Aucune demande en attente.</div>
          ) : (
            <div className="space-y-2">
              {pendingForValidation.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{formatCurrency(r.amount, r.currency)}</span>
                      {" · "}
                      <span>{companyBankNameById[r.toAccountId.replace("company_bank_", "")] ?? "Banque compagnie"}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.createdAt?.toDate?.()?.toLocaleString?.("fr-FR") ?? "—"}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Initié par: {r.initiatedBy} {r.description ? `· ${r.description}` : ""}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <ActionButton
                      size="sm"
                      onClick={() => handleApprove(r.id)}
                      disabled={busyRequestId === r.id}
                    >
                      Valider
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      onClick={() => handleReject(r.id)}
                      disabled={busyRequestId === r.id}
                    >
                      Refuser
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="Historique des demandes de versement">
        {requestsLoading ? (
          <div className="py-4 text-sm text-gray-500">Chargement...</div>
        ) : recentRequests.length === 0 ? (
          <div className="py-4 text-sm text-gray-500">Aucune demande enregistrée.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 px-3 py-2">
                <span>
                  {formatCurrency(r.amount, r.currency)} · {TRANSFER_STATUS_LABELS[r.status] ?? r.status}
                </span>
                <span className="text-xs text-gray-500">
                  {r.createdAt?.toDate?.()?.toLocaleString?.("fr-FR") ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );

  return isStandaloneComptaTreasury ? (
    <StandardLayoutWrapper className="min-w-0">{body}</StandardLayoutWrapper>
  ) : (
    body
  );
}
