// Phase C1.2 — CEO Payment Approvals Dashboard. admin_compagnie only.
import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import RequireRole from "@/shared/auth/RequireRole";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { listPendingPaymentProposals } from "@/modules/compagnie/finance/paymentProposalsService";
import { getFinancialSettings } from "@/modules/compagnie/finance/financialSettingsService";
import {
  approvePaymentProposal,
  rejectPaymentProposal,
} from "@/modules/compagnie/finance/paymentsService";
import { payableRef } from "@/modules/compagnie/finance/payablesService";
import type { PaymentProposalDoc } from "@/modules/compagnie/finance/paymentProposalsTypes";
import type { PayableDoc } from "@/modules/compagnie/finance/payablesTypes";
import { Check, X, Loader2, ShieldAlert, ArrowLeft } from "lucide-react";

type ProposalRow = {
  id: string;
  proposal: PaymentProposalDoc & { id: string };
  supplierName: string;
  cumulativeAmountLast24h: number;
  threshold: number;
  statusIndicator: "Normal" | "Threshold exceeded";
};

function CEOPaymentApprovalsContent() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const { setHeader, resetHeader } = usePageHeader();

  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<{ [id: string]: string }>({});

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [proposals, settings] = await Promise.all([
        listPendingPaymentProposals(companyId, { limitCount: 200 }),
        getFinancialSettings(companyId),
      ]);
      const threshold = settings.paymentApprovalThreshold;
      const nowMs = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      const payablesMap = new Map<string, PayableDoc>();
      for (const p of proposals) {
        if (!payablesMap.has(p.payableId)) {
          const snap = await getDoc(payableRef(companyId, p.payableId));
          payablesMap.set(p.payableId, snap.exists() ? (snap.data() as PayableDoc) : ({} as PayableDoc));
        }
      }

      const cumulativeByPayable = new Map<string, number>();
      for (const p of proposals) {
        const proposedAtMs = (p.proposedAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        if (nowMs - proposedAtMs <= twentyFourHoursMs) {
          const amt = Number(p.amount) ?? 0;
          cumulativeByPayable.set(p.payableId, (cumulativeByPayable.get(p.payableId) ?? 0) + amt);
        }
      }

      const nextRows: ProposalRow[] = proposals.map((proposal) => {
        const payable = payablesMap.get(proposal.payableId);
        const supplierName = payable?.supplierName ?? "—";
        const cumulativeAmountLast24h = cumulativeByPayable.get(proposal.payableId) ?? Number(proposal.amount);
        const amount = Number(proposal.amount) ?? 0;
        const statusIndicator: "Normal" | "Threshold exceeded" =
          amount > threshold || cumulativeAmountLast24h > threshold ? "Threshold exceeded" : "Normal";
        return {
          id: proposal.id,
          proposal: { ...proposal, id: proposal.id },
          supplierName,
          cumulativeAmountLast24h,
          threshold,
          statusIndicator,
        };
      });
      setRows(nextRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setHeader({ title: "Approbations de paiement" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (proposalId: string) => {
    if (!companyId || !user?.uid) return;
    setActioningId(proposalId);
    setError(null);
    try {
      await approvePaymentProposal({
        companyId,
        proposalId,
        approvedBy: user.uid,
        approvedByRole: (user as { role?: string }).role ?? "admin_compagnie",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'approuver.");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    if (!companyId || !user?.uid) return;
    setActioningId(proposalId);
    setError(null);
    try {
      await rejectPaymentProposal({
        companyId,
        proposalId,
        approvedBy: user.uid,
        approvedByRole: (user as { role?: string }).role ?? "admin_compagnie",
        rejectionReason: rejectReason[proposalId] || null,
      });
      setRejectReason((prev) => {
        const next = { ...prev };
        delete next[proposalId];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de rejeter.");
    } finally {
      setActioningId(null);
    }
  };

  if (!companyId) {
    return (
      <div className="p-4 text-slate-600">
        Aucune compagnie sélectionnée.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to={`/compagnie/${companyId}/command-center`}
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4" /> Retour au centre de commande
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          Aucune demande de paiement en attente d&apos;approbation.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-3 font-medium text-slate-700">Fournisseur</th>
                  <th className="p-3 font-medium text-slate-700">Agence</th>
                  <th className="p-3 font-medium text-slate-700">Montant</th>
                  <th className="p-3 font-medium text-slate-700">Devise</th>
                  <th className="p-3 font-medium text-slate-700">Proposé par</th>
                  <th className="p-3 font-medium text-slate-700">Date</th>
                  <th className="p-3 font-medium text-slate-700">Payable ID</th>
                  <th className="p-3 font-medium text-slate-700">Cumul 24h</th>
                  <th className="p-3 font-medium text-slate-700">Seuil</th>
                  <th className="p-3 font-medium text-slate-700">Indicateur</th>
                  <th className="p-3 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const p = row.proposal;
                  const proposedAt = (p.proposedAt as { toMillis?: () => number })?.toMillis?.();
                  const isActioning = actioningId === row.id;
                  return (
                    <tr key={row.id} className="border-b hover:bg-slate-50/50">
                      <td className="p-3">{row.supplierName}</td>
                      <td className="p-3 font-mono text-xs">{p.agencyId}</td>
                      <td className="p-3 font-medium">{Number(p.amount).toLocaleString("fr-FR")}</td>
                      <td className="p-3">{p.currency}</td>
                      <td className="p-3">{p.proposedBy}</td>
                      <td className="p-3">
                        {proposedAt ? format(proposedAt, "dd MMM yyyy HH:mm", { locale: fr }) : "—"}
                      </td>
                      <td className="p-3 font-mono text-xs truncate max-w-[120px]" title={p.payableId}>
                        {p.payableId}
                      </td>
                      <td className="p-3">{row.cumulativeAmountLast24h.toLocaleString("fr-FR")}</td>
                      <td className="p-3">{row.threshold.toLocaleString("fr-FR")}</td>
                      <td className="p-3">
                        <span
                          className={
                            row.statusIndicator === "Threshold exceeded"
                              ? "text-amber-700 font-medium flex items-center gap-1"
                              : "text-slate-600"
                          }
                        >
                          {row.statusIndicator === "Threshold exceeded" && (
                            <ShieldAlert className="w-4 h-4 inline" />
                          )}
                          {row.statusIndicator}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(row.id)}
                            disabled={isActioning}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Approuver
                          </button>
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              placeholder="Motif rejet (optionnel)"
                              value={rejectReason[row.id] ?? ""}
                              onChange={(e) =>
                                setRejectReason((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              className="border border-slate-200 rounded px-2 py-1 text-xs w-32"
                            />
                            <button
                              type="button"
                              onClick={() => handleReject(row.id)}
                              disabled={isActioning}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                            >
                              {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                              Rejeter
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CEOPaymentApprovalsPage() {
  return (
    <RequireRole anyOf={["admin_compagnie", "admin_platforme"]}>
      <CEOPaymentApprovalsContent />
    </RequireRole>
  );
}
