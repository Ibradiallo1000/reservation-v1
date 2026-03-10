import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { listExpenses, approveExpense, rejectExpense, type ExpenseDoc } from "@/modules/compagnie/treasury/expenses";
import { SectionCard, ActionButton, StatusBadge, EmptyState, table, tableRowClassName } from "@/ui";
import { CheckCircle2, XCircle, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

type ExpenseRow = ExpenseDoc & { id: string };

export default function ManagerExpensesPage() {
  const { user } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !agencyId) return;
    setLoading(true);
    try {
      const list = await listExpenses(companyId, {
        agencyId,
        status: "pending_manager",
        limitCount: 100,
      });
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [companyId, agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  const doApprove = async (id: string) => {
    if (!companyId || !user?.uid) return;
    setBusyId(id);
    try {
      await approveExpense(companyId, id, user.uid, user.role);
      toast.success("Dépense validée.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur approbation.");
    } finally {
      setBusyId(null);
    }
  };

  const doReject = async (id: string) => {
    if (!companyId || !user?.uid) return;
    const reason = window.prompt("Motif du refus :")?.trim();
    if (!reason) return;
    setBusyId(id);
    try {
      await rejectExpense(companyId, id, user.uid, reason, user.role);
      toast.success("Dépense refusée.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur refus.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Validation des demandes de dépenses" icon={Receipt}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement...</div>
        ) : rows.length === 0 ? (
          <EmptyState message="Aucune demande en attente côté chef d'agence." />
        ) : (
          <div className="overflow-x-auto">
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Date</th>
                  <th className={table.th}>Catégorie</th>
                  <th className={table.th}>Description</th>
                  <th className={table.thRight}>Montant</th>
                  <th className={table.th}>Statut</th>
                  <th className={table.th}>Actions</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {rows.map((r) => (
                  <tr key={r.id} className={tableRowClassName()}>
                    <td className={table.td}>
                      {(r.createdAt as { toDate?: () => Date })?.toDate?.().toLocaleDateString("fr-FR") ?? "—"}
                    </td>
                    <td className={table.td}>{r.expenseCategory ?? r.category}</td>
                    <td className={table.td}>{r.description}</td>
                    <td className={table.tdRight}>{money(Number(r.amount))}</td>
                    <td className={table.td}>
                      <StatusBadge status="warning">Attente chef agence</StatusBadge>
                    </td>
                    <td className={table.td}>
                      <div className="flex items-center gap-2">
                        <ActionButton size="sm" onClick={() => doApprove(r.id)} disabled={busyId === r.id}>
                          {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Approuver
                        </ActionButton>
                        <ActionButton size="sm" variant="secondary" onClick={() => doReject(r.id)} disabled={busyId === r.id}>
                          <XCircle className="h-4 w-4" />
                          Refuser
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
