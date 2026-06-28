/**
 * Agency cash control — simplified for Chef d'Agence.
 * Focus: cash balance, sessions to validate, open sessions, discrepancies.
 */
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, SectionCard, ActionButton, StatusBadge, EmptyState } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  Wallet,
  CheckCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  listCashSessions,
} from "./cashSessionService";
import {
  CASH_SESSION_STATUS,
  getTotalExpected,
  getTotalCounted,
  type CashSessionDocWithId,
} from "./cashSessionTypes";
// ✅ Utiliser la même fonction que la page Trésorerie
import { getAgencyTreasuryLedgerCashDisplay } from "@/modules/agence/comptabilite/agencyCashAuditService";
import { Timestamp } from "firebase/firestore";

export type CashSessionsPageProps = { embedded?: boolean };

export default function CashSessionsPage({ embedded = false }: CashSessionsPageProps = {}) {
  const { user } = useAuth();
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const userId = user?.uid ?? "";

  const [sessions, setSessions] = useState<CashSessionDocWithId[]>([]);
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Fonction utilitaire pour formater un Timestamp Firestore
  const formatTimestamp = (timestamp: Timestamp | Date | number | null | undefined): string => {
    if (!timestamp) return '—';
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate().toLocaleDateString('fr-FR');
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString('fr-FR');
    }
    if (typeof timestamp === 'number') {
      return new Date(timestamp).toLocaleDateString('fr-FR');
    }
    return '—';
  };

  const load = async () => {
    if (!companyId || !agencyId) return;
    setLoading(true);
    try {
      const list = await listCashSessions(companyId, agencyId, { limitCount: 100 });
      setSessions(list);
      
      // ✅ Charger le solde caisse avec gestion d'erreur (comme la page Trésorerie)
      const display = await getAgencyTreasuryLedgerCashDisplay(companyId, agencyId).catch((err) => {
        console.warn("[CashSessionsPage] Impossible de charger le solde caisse:", err);
        return { ledgerCash: 0, mirrorCash: null };
      });
      setCashBalance(display?.ledgerCash ?? 0);
    } catch (e) {
      toast.error("Erreur chargement sessions caisse");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [companyId, agencyId]);

  // Sessions à valider (clôturées, en attente de validation)
  const pendingSessions = sessions.filter(
    (s) => s.status === CASH_SESSION_STATUS.CLOSED
  );

  // Sessions ouvertes
  const openSessions = sessions.filter(
    (s) => s.status === CASH_SESSION_STATUS.OPEN
  );

  // Sessions avec écart
  const sessionsWithDiscrepancy = sessions.filter(
    (s) => s.discrepancy != null && Math.abs(Number(s.discrepancy)) > 0
  );

  if (loading) {
    return <div className="py-8 text-center text-gray-500 dark:text-slate-400">Chargement...</div>;
  }

  const body = (
    <div className="space-y-6">
      {/* 1. Solde caisse */}
      <SectionCard title="💰 Solde caisse" icon={Wallet}>
        <div className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">
          {money(cashBalance)}
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400">Solde réel du compte caisse agence</p>
      </SectionCard>

      {/* 2. Statistiques rapides */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
          <div className="text-sm text-gray-600 dark:text-slate-300">Sessions ouvertes</div>
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{openSessions.length}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="text-sm text-gray-600 dark:text-slate-300">À valider</div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{pendingSessions.length}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
          <div className="text-sm text-gray-600 dark:text-slate-300">Écarts détectés</div>
          <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">{sessionsWithDiscrepancy.length}</div>
        </div>
      </div>

      {/* 3. Sessions à valider (priorité) */}
      {pendingSessions.length > 0 && (
        <SectionCard title="📌 Sessions à valider" icon={CheckCircle}>
          <div className="space-y-3">
            {pendingSessions.map((s) => (
              <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {s.agentId || 'Agent inconnu'}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-slate-300">
                    {money(getTotalExpected(s))} · {s.type || 'Guichet'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Ouvert le {formatTimestamp(s.openedAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status="warning">En attente</StatusBadge>
                  <ActionButton size="sm" variant="primary">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Valider
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 4. Sessions ouvertes */}
      <SectionCard title="🟢 Sessions ouvertes" icon={Clock}>
        {openSessions.length === 0 ? (
          <EmptyState message="Aucune session ouverte" />
        ) : (
          <div className="space-y-3">
            {openSessions.map((s) => (
              <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {s.agentId || 'Agent inconnu'}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-slate-300">
                    {money(getTotalExpected(s))} · {s.type || 'Guichet'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Ouvert le {formatTimestamp(s.openedAt)}
                  </div>
                </div>
                <StatusBadge status="info">En cours</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 5. Écarts détectés (alerte) */}
      {sessionsWithDiscrepancy.length > 0 && (
        <SectionCard title="⚠️ Écarts détectés" icon={AlertTriangle}>
          <div className="space-y-3">
            {sessionsWithDiscrepancy.map((s) => (
              <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-rose-500/30 dark:bg-rose-500/10">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {s.agentId || 'Agent inconnu'}
                  </div>
                  <div className="text-sm font-medium text-rose-700 dark:text-rose-300">
                    Écart: {money(s.discrepancy)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Attendu: {money(getTotalExpected(s))} · Compté: {money(getTotalCounted(s))}
                  </div>
                </div>
                <StatusBadge status="danger">À vérifier</StatusBadge>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );

  return embedded ? (
    <div className="space-y-4">{body}</div>
  ) : (
    <StandardLayoutWrapper>{body}</StandardLayoutWrapper>
  );
}
