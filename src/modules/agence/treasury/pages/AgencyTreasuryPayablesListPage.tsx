// src/modules/agence/treasury/pages/AgencyTreasuryPayablesListPage.tsx

import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, SectionCard, ActionButton, StatusBadge } from "@/ui";
import { db } from "@/firebaseConfig";
import { collection, query, where, getDocs, doc, updateDoc, runTransaction, Timestamp } from "firebase/firestore";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { createExpense, EXPENSE_CATEGORIES } from "@/modules/compagnie/treasury/expenses";
import { getAccount } from "@/modules/compagnie/treasury/financialAccounts";
import { agencyCashAccountId } from "@/modules/compagnie/treasury/types";
import { getAgencyTreasuryLedgerCashDisplay } from "@/modules/agence/comptabilite/agencyCashAuditService";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, AlertTriangle, RefreshCw, FileText } from "lucide-react";

type PayableDoc = {
  id: string;
  supplierId: string;
  supplierName: string;
  agencyId: string;
  category: string;
  description: string;
  totalAmount: number;
  paidAmount?: number;
  vehicleId?: string | null;
  status: "pending" | "paid" | "cancelled";
  dueDate?: Timestamp;
  createdAt: Timestamp;
  createdBy: string;
  paidAt?: Timestamp;
  paidBy?: string;
};

export default function AgencyTreasuryPayablesListPage() {
  const { pathname } = useLocation();
  const isStandaloneComptaTreasury = pathname.startsWith("/agence/comptabilite/treasury");
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const money = useFormatCurrency();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [payables, setPayables] = useState<PayableDoc[]>([]);
  const [availableCash, setAvailableCash] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("XOF");

  const loadData = async () => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Charger les payables en attente
      const payablesRef = collection(db, `companies/${companyId}/payables`);
      const q = query(
        payablesRef,
        where("agencyId", "==", agencyId),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      const list: PayableDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as PayableDoc));

      // Trier par date de création (plus ancien d'abord)
      list.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return aTime - bTime;
      });

      setPayables(list);

      // 2. Charger le solde de la caisse
      const cashAccount = await getAccount(companyId, agencyCashAccountId(agencyId));
      const primary = await getAgencyTreasuryLedgerCashDisplay(companyId, agencyId).catch(() => null);
      setAvailableCash(primary != null ? primary.ledgerCash : 0);
      setCurrency(cashAccount?.currency ?? "XOF");
    } catch (error) {
      console.error("[PayablesList] Erreur de chargement:", error);
      toast.error("Impossible de charger les payables.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId, agencyId]);

  const handlePay = async (payable: PayableDoc) => {
    if (!companyId || !user?.uid) {
      toast.error("Session invalide.");
      return;
    }

    if (payable.totalAmount > availableCash) {
      toast.error(`Solde insuffisant. Disponible: ${money(availableCash)}`);
      return;
    }

    // Confirmation
    if (!confirm(`Payer ${money(payable.totalAmount)} à ${payable.supplierName} ?`)) {
      return;
    }

    setSubmitting(payable.id);

    try {
      await runTransaction(db, async (tx) => {
        // 1. Récupérer le payable
        const payableRef = doc(db, `companies/${companyId}/payables`, payable.id);
        const payableSnap = await tx.get(payableRef);
        if (!payableSnap.exists()) {
          throw new Error("Payable introuvable.");
        }
        const payableData = payableSnap.data() as PayableDoc;
        if (payableData.status === "paid") {
          throw new Error("Ce payable a déjà été payé.");
        }

        // 2. Mettre à jour le statut du payable
        tx.update(payableRef, {
          status: "paid",
          paidAt: Timestamp.now(),
          paidBy: user.uid,
          updatedAt: Timestamp.now(),
        });

        // 3. Créer la dépense associée
        const expenseCategory = payableData.category || "supplier_payment";
        const expenseDescription = `Paiement fournisseur: ${payableData.supplierName} - ${payableData.description}`;

        // ✅ CORRECTION : Supprimer 'metadata' et utiliser 'expenseCategory'
        await createExpense({
          companyId,
          agencyId,
          category: expenseCategory,
          description: expenseDescription,
          amount: payableData.totalAmount,
          accountId: agencyCashAccountId(agencyId),
          createdBy: user.uid,
          expenseCategory: expenseCategory,
        });
      });

      toast.success(`Paiement de ${money(payable.totalAmount)} effectué.`);
      await loadData(); // Recharger la liste

    } catch (error) {
      console.error("[PayablesList] Erreur paiement:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors du paiement.");
    } finally {
      setSubmitting(null);
    }
  };

  const totalPending = payables.reduce((sum, p) => sum + p.totalAmount, 0);

  if (!companyId || !agencyId) {
    return (
      <div className="p-6 text-gray-500">
        Aucune agence associée à ce compte.
      </div>
    );
  }

  const body = (
    <div className="min-w-0 space-y-6">
      <SectionCard
        title="Payables fournisseurs"
        icon={CreditCard}
        right={
          <ActionButton variant="secondary" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </ActionButton>
        }
      >
        {/* Résumé */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
            <div className="text-sm text-gray-500">Payables en attente</div>
            <div className="text-2xl font-bold text-gray-900">{payables.length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
            <div className="text-sm text-gray-500">Montant total dû</div>
            <div className="text-2xl font-bold text-amber-600">{money(totalPending)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
            <div className="text-sm text-gray-500">Solde disponible</div>
            <div className="text-2xl font-bold text-emerald-600">{money(availableCash)}</div>
            {totalPending > availableCash && (
              <div className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Fonds insuffisants pour tout payer
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement des payables...</div>
        ) : payables.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Aucun payable en attente pour cette agence.</p>
            <p className="text-sm text-gray-400 mt-1">Tous les payables ont été réglés.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payables.map((payable) => {
              const canPay = payable.totalAmount <= availableCash;
              return (
                <div
                  key={payable.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    canPay ? "border-gray-200 hover:border-gray-300" : "border-rose-200 bg-rose-50/30"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {payable.supplierName}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">
                          {payable.category}
                        </span>
                        <span>{payable.description}</span>
                        {payable.dueDate && (
                          <span className="text-xs text-gray-400">
                            Échéance: {new Date(payable.dueDate.toMillis()).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </div>
                      {payable.vehicleId && (
                        <div className="mt-1 text-xs text-gray-400">
                          Véhicule: {payable.vehicleId.slice(0, 8)}...
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-lg font-bold text-gray-900">
                        {money(payable.totalAmount)}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status="neutral">En attente</StatusBadge>
                        <ActionButton
                          size="sm"
                          onClick={() => handlePay(payable)}
                          disabled={!canPay || submitting === payable.id}
                          className="whitespace-nowrap"
                        >
                          {submitting === payable.id ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Paiement...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Payer
                            </>
                          )}
                        </ActionButton>
                      </div>
                      {!canPay && (
                        <div className="text-xs text-rose-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Solde insuffisant
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-gray-400">
                    Créé le {new Date(payable.createdAt.toMillis()).toLocaleString("fr-FR")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Historique des payables payés */}
      <SectionCard title="Historique des paiements" icon={FileText}>
        <div className="text-sm text-gray-500">
          Les payables payés apparaîtront dans l'historique des dépenses.
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Pour voir l'historique complet, consultez l'onglet "Historique" de la caisse.
        </div>
      </SectionCard>
    </div>
  );

  return isStandaloneComptaTreasury ? (
    <StandardLayoutWrapper className="min-w-0">{body}</StandardLayoutWrapper>
  ) : (
    body
  );
}