// Treasury dashboard — Agency: local accounts, cash position, recent movements, pending expenses.
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { formatDateLongFr } from "@/utils/dateFmt";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { listExpenses, type ExpenseStatus } from "@/modules/compagnie/treasury/expenses";
import { ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { Wallet, ArrowRightLeft, FileText } from "lucide-react";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";

export default function AgencyTreasuryPage() {
  const { user, company } = useAuth();
  const isOnline = useOnlineStatus();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [accounts, setAccounts] = useState<{ id: string; accountName: string; currentBalance: number; currency: string; accountType: string }[]>([]);
  const [movements, setMovements] = useState<{ id: string; amount: number; movementType: string; performedAt: unknown }[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<{ id: string; amount: number; category: string; status: ExpenseStatus }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }
    const currency = (company as { devise?: string })?.devise ?? "XOF";
    setError(null);
    ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as { nom?: string })?.nom)
      .then(() => listAccounts(companyId, { agencyId }))
      .then(setAccounts)
      .catch(() => {
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger la trésorerie."
            : "Erreur lors du chargement de la trésorerie."
        );
      })
      .finally(() => setLoading(false));
  }, [companyId, agencyId, company, isOnline, reloadKey]);

  useEffect(() => {
    if (!companyId) return;
    const q = query(
      collection(db, `companies/${companyId}/financialMovements`),
      where("agencyId", "==", agencyId),
      orderBy("performedAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMovements(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            amount: Number(data.amount ?? 0),
            movementType: data.movementType ?? "",
            performedAt: data.performedAt,
          };
        })
      );
    }, () => {
      setError(
        !isOnline
          ? "Connexion indisponible. Mouvements non synchronisés."
          : "Erreur lors du chargement des mouvements."
      );
    });
    return () => unsub();
  }, [companyId, agencyId, isOnline]);

  useEffect(() => {
    if (!companyId) return;
    listExpenses(companyId, { agencyId, status: "pending", limitCount: 20 })
      .then((list) =>
        setPendingExpenses(list.map((e) => ({ id: e.id, amount: e.amount, category: e.category, status: e.status })))
      )
      .catch(() => {
        setError(
          !isOnline
            ? "Connexion indisponible. Dépenses non disponibles."
            : "Erreur lors du chargement des dépenses."
        );
      });
    const interval = setInterval(() => {
      listExpenses(companyId, { agencyId, status: "pending", limitCount: 20 }).then((list) =>
        setPendingExpenses(list.map((e) => ({ id: e.id, amount: e.amount, category: e.category, status: e.status })))
      ).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [companyId, agencyId, isOnline]);

  const totalCash = accounts.reduce((s, a) => s + a.currentBalance, 0);

  if (!companyId || !agencyId) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Contexte agence introuvable.</p>
      </div>
    );
  }

  if (loading && accounts.length === 0) {
    return <PageLoadingState />;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certaines données peuvent être incomplètes." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <p className="text-sm text-gray-600">{formatDateLongFr(new Date())}</p>

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Wallet className="w-5 h-5" /> Position caisse
        </h2>
        <div className="text-2xl font-bold text-indigo-700">{totalCash.toLocaleString("fr-FR")}</div>
        <ul className="mt-3 space-y-2 text-sm">
          {accounts.map((a) => (
            <li key={a.id} className="flex justify-between">
              <span>{a.accountName}</span>
              <span className="font-medium">{a.currentBalance.toLocaleString("fr-FR")} {a.currency}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5" /> Derniers mouvements
        </h2>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Type</th>
                <th className="text-right py-1">Montant</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr><td colSpan={2} className="py-4 text-gray-500 text-center">Aucun mouvement</td></tr>
              ) : (
                movements.slice(0, 25).map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-1">{m.movementType}</td>
                    <td className="py-1 text-right">+{m.amount.toLocaleString("fr-FR")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="w-5 h-5" /> Dépenses en attente
        </h2>
        {pendingExpenses.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune dépense en attente.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {pendingExpenses.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>{e.category}</span>
                <span>{e.amount.toLocaleString("fr-FR")} — {e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
