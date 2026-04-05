import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, SectionCard, ActionButton } from "@/ui";
import {
  ensureCompanyBankAccount,
  getAccount,
  listAccounts,
} from "@/modules/compagnie/treasury/financialAccounts";
import { getAgencyTreasuryLedgerCashDisplay } from "@/modules/agence/comptabilite/agencyCashAuditService";
import { listCompanyBanks } from "@/modules/compagnie/treasury/companyBanks";
import { agencyCashAccountId } from "@/modules/compagnie/treasury/types";
import { getFinancialAccountDisplayName } from "@/modules/compagnie/treasury/accountDisplay";
import { collection, getDocs } from "firebase/firestore";
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
  agencyId: string | null;
  accountType: string;
  accountName: string;
  currentBalance: number;
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
  const roles: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const hasRole = (role: string) => roles.includes(role);

  const [companyBankAccounts, setCompanyBankAccounts] = useState<AccountRow[]>([]);
  const [agencyCashAccount, setAgencyCashAccount] = useState<{
    id: string;
    currentBalance: number;
    currency: string;
  } | null>(null);
  const [availableAgencyCash, setAvailableAgencyCash] = useState<number>(0);
  const [mirrorCashSecondary, setMirrorCashSecondary] = useState<number | null>(null);
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
        /** Banques configurées dans companyBanks : garantir le compte miroir financialAccounts (id company_bank_<id>). */
        const metaBanks = await listCompanyBanks(companyId);
        await Promise.all(
          metaBanks.map((b) =>
            ensureCompanyBankAccount(
              companyId,
              b.id,
              b.name,
              b.currency?.trim() ? b.currency : "XOF"
            )
          )
        );
        const [cashAccount, banks, primary] = await Promise.all([
          getAccount(companyId, agencyCashAccountId(agencyId)),
          listAccounts(companyId, { agencyId: null, accountType: "company_bank" }),
          getAgencyTreasuryLedgerCashDisplay(companyId, agencyId).catch(() => null),
        ]);
        if (!cancelled) {
          setAgencyCashAccount(cashAccount);
          setCompanyBankAccounts(banks);
          setAvailableAgencyCash(primary != null ? primary.ledgerCash : 0);
          setMirrorCashSecondary(primary?.mirrorCash ?? null);
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
        description: description.trim() || "Versement caisse agence vers banque compagnie",
      });
      toast.success("Demande de versement créée. En attente de validation chef d'agence.");
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
                    ? `Caisse agence (ledger) : ${formatCurrency(availableAgencyCash, agencyCashAccount.currency)}`
                    : "Aucune caisse agence configurée"}
                </div>
                {mirrorCashSecondary != null && agencyCashAccount ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Compte miroir (référence) : {formatCurrency(mirrorCashSecondary, agencyCashAccount.currency)}
                  </p>
                ) : null}
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
                  Disponible (ledger) : {formatCurrency(availableAgencyCash, agencyCashAccount?.currency ?? "XOF")}
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

            {canInitiateTransfer ? (
              <ActionButton type="button" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? "Traitement..." : "Initier le versement"}
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
