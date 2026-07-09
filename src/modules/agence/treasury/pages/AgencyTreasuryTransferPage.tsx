import React, { useEffect, useMemo, useRef, useState } from "react";
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
  createTransferRequest,
  listTransferRequests,
  type TransferRequestDoc,
} from "@/modules/agence/treasury/transferRequestsService";

type AccountRow = {
  id: string;
  accountName: string;
  currency: string;
};

type TransferRequestRow = TransferRequestDoc & { id: string };

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
  const [requests, setRequests] = useState<TransferRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitLockRef = useRef(false);

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
        if (!cancelled) {
          setAgencyCashAccount(cashAccount);
          setCompanyBankAccounts(banks);
          setAvailableAgencyCash(cashAccount?.currentBalance ?? 0);
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

  const canInitiateTransfer =
    hasRole("agency_accountant") || hasRole("comptable") || hasRole("Comptable");

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
        const list = await listTransferRequests(companyId, {
          agencyId,
          limitCount: 50,
        });
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
    setSubmitError(null);
    console.log("[Transfer] Click - Début de la soumission");

    if (submitLockRef.current) {
      console.log("[Transfer] Click - Verrou actif, abandon");
      return;
    }

    if (!companyId || !user?.uid) {
      console.log("[Transfer] Click - Session invalide: companyId ou uid manquant");
      toast.error("Session invalide : reconnectez-vous.");
      return;
    }

    if (!agencyId) {
      console.log("[Transfer] Click - AgencyId manquant");
      toast.error("Aucune agence associée à ce compte.");
      return;
    }

    const numericAmount = Number(amount.replace(",", "."));
    console.log("[Transfer] Montant parsé:", { input: amount, numericAmount });

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      console.log("[Transfer] Montant invalide:", numericAmount);
      toast.error("Montant invalide.");
      return;
    }

    if (!agencyCashAccount) {
      console.log("[Transfer] Caisse agence non configurée");
      toast.error("Aucune caisse agence configurée.");
      return;
    }

    if (!toAccountId) {
      console.log("[Transfer] Compte de destination non sélectionné");
      toast.error("Sélectionnez la banque compagnie de destination.");
      return;
    }

    if (numericAmount > availableAgencyCash) {
      console.log("[Transfer] Montant supérieur au disponible:", {
        montant: numericAmount,
        disponible: availableAgencyCash
      });
      toast.error("Montant supérieur au cash disponible en caisse.");
      return;
    }

    const selectedTo = companyBankAccounts.find((a) => a.id === toAccountId);
    const currency = agencyCashAccount.currency || selectedTo?.currency || "XOF";

    const payload = {
      companyId,
      agencyId,
      fromAccountId: agencyCashAccount.id,
      toAccountId,
      amount: numericAmount,
      currency,
      initiatedBy: user.uid,
      initiatedByRoles: roles,
      description: description.trim() || "Transfert caisse agence vers banque",
    };
    console.log("[Transfer] Payload complet:", JSON.stringify(payload, null, 2));

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      console.log("[Transfer] Appel à createTransferRequest...");
      const requestId = await createTransferRequest(payload);
      console.log("[Transfer] Success - ID de la demande:", requestId);

      toast.success("Versement enregistré et exécuté.");
      setAmount("");
      setDescription("");

      console.log("[Transfer] Rafraîchissement des données...");
      try {
        const refreshedCash = await getDoc(ledgerAccountDocRef(companyId, agencyCashAccount.id));
        if (refreshedCash.exists()) {
          const refreshedData = refreshedCash.data() as { balance?: number };
          setAvailableAgencyCash(Number(refreshedData.balance ?? 0) || 0);
          console.log("[Transfer] Cash rafraîchi:", refreshedData.balance);
        } else {
          setAvailableAgencyCash((current) => Math.max(0, current - numericAmount));
        }
      } catch {
        setAvailableAgencyCash((current) => Math.max(0, current - numericAmount));
      }

      try {
        const list = await listTransferRequests(companyId, {
          agencyId,
          limitCount: 50,
        });
        setRequests(list);
      } catch (historyError) {
        const code =
          historyError && typeof historyError === "object" && "code" in historyError
            ? String((historyError as { code?: string }).code ?? "")
            : "";
        console.warn("[Transfer] Historique indisponible après versement réussi", { code });
      }
      console.log("[Transfer] Fin du processus - succès");

    } catch (error) {
      console.error("[Transfer] Error - Détail complet:", error);
      const detail =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: string }).message)
          : "Erreur inconnue";
      console.error("[Transfer] Error - Message:", detail);
      setSubmitError(detail);
      toast.error(`Le transfert n'a pas été enregistré. ${detail}`);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
      console.log("[Transfer] Verrou relâché");
    }
  };

  const recentRequests = useMemo(
    () => requests.filter((request) => request.status === "executed").slice(0, 12),
    [requests]
  );

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
              <div className="space-y-2">
                <ActionButton type="button" onClick={() => void handleSubmit()} disabled={submitting}>
                  {submitting ? "Traitement..." : "Enregistrer le transfert"}
                </ActionButton>
                {submitError && (
                  <p role="alert" className="text-sm font-medium text-red-700">
                    Le transfert n&apos;a pas été enregistré : {submitError}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Historique des transferts enregistrés">
        {requestsLoading ? (
          <div className="py-4 text-sm text-gray-500">Chargement...</div>
        ) : recentRequests.length === 0 ? (
          <div className="py-4 text-sm text-gray-500">Aucun transfert enregistré.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 px-3 py-2">
                <span>
                  <span className="font-medium">{formatCurrency(r.amount, r.currency)}</span>
                  {" · "}
                  {companyBankAccounts.find((account) => account.id === r.toAccountId)?.accountName
                    ?? "Banque compagnie"}
                  {r.description ? ` · ${r.description}` : ""}
                </span>
                <span className="text-right text-xs text-gray-500">
                  <span className="block">
                    {r.executedAt?.toDate?.()?.toLocaleString?.("fr-FR")
                      ?? r.createdAt?.toDate?.()?.toLocaleString?.("fr-FR")
                      ?? "—"}
                  </span>
                  <span className="block font-mono">{r.id}</span>
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
