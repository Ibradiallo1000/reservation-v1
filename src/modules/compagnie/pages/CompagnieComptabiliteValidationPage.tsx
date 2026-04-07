/**
 * Validation finale chef d'agence : sessions validées par l'agence en attente du contrôle final.
 * Affiche la liste et boutons Valider / Rejeter.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { FileCheck, CheckCircle2, XCircle, RefreshCw, Building2, User } from "lucide-react";
import { StandardLayoutWrapper, PageHeader, SectionCard } from "@/ui";
import { Button } from "@/shared/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  listReportsValidatedByAgencyForCompany,
  type ShiftReportValidatedByAgency,
} from "@/modules/agence/services/shiftApi";
import {
  validateSessionByHeadAccountant,
  rejectSessionByHeadAccountant,
} from "@/modules/agence/services/sessionService";
import { dispatchAgencyCashUiRefresh } from "@/modules/agence/constants/agencyCashUiRefresh";

function formatTs(ts: unknown): string {
  if (!ts) return "—";
  const t = ts as { toDate?: () => Date };
  if (typeof t.toDate === "function") {
    return t.toDate().toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return String(ts);
}

export default function CompagnieComptabiliteValidationPage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const companyId = companyIdFromUrl ?? (user as { companyId?: string })?.companyId ?? "";
  const money = useFormatCurrency();

  const [sessions, setSessions] = useState<ShiftReportValidatedByAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const list = await listReportsValidatedByAgencyForCompany(companyId);
      setSessions(list);
    } catch (e) {
      console.error("listReportsValidatedByAgencyForCompany", e);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const currentUser = user as { id?: string; displayName?: string; name?: string } | null;
  const validatedBy = currentUser
    ? { id: currentUser.id ?? "", name: currentUser.displayName ?? currentUser.name ?? "" }
    : { id: "", name: "" };

  const handleValidate = async (report: ShiftReportValidatedByAgency) => {
    if (!companyId || !report.agencyId || !report.shiftId || !validatedBy.id) return;
    setActionId(report.shiftId);
    try {
      await validateSessionByHeadAccountant({
        companyId,
        agencyId: report.agencyId,
        shiftId: report.shiftId,
        validatedBy,
      });
      dispatchAgencyCashUiRefresh();
      await load();
    } catch (e) {
      console.error("validateSessionByHeadAccountant", e);
      alert((e as Error)?.message ?? "Erreur lors de la validation.");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (report: ShiftReportValidatedByAgency) => {
    if (!companyId || !report.agencyId || !report.shiftId || !validatedBy.id) return;
    setActionId(report.shiftId);
    try {
      await rejectSessionByHeadAccountant({
        companyId,
        agencyId: report.agencyId,
        shiftId: report.shiftId,
        rejectedBy: validatedBy,
        reason: rejectReason[report.shiftId] || undefined,
      });
      setRejectModalId(null);
      setRejectReason((prev) => ({ ...prev, [report.shiftId]: "" }));
      await load();
    } catch (e) {
      console.error("rejectSessionByHeadAccountant", e);
      alert((e as Error)?.message ?? "Erreur lors du rejet.");
    } finally {
      setActionId(null);
    }
  };

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Validation chef d'agence" />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Validation chef d'agence"
        subtitle="Sessions validées par le comptable agence — valider ou rejeter pour finaliser."
      />
      <SectionCard
        title="Sessions validées comptable"
        icon={FileCheck}
        right={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        }
      >
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement...</div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            Aucune session en attente de validation chef d'agence.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-600">
                  <th className="text-left py-2 px-2">Agence</th>
                  <th className="text-left py-2 px-2">Guichetier</th>
                  <th className="text-left py-2 px-2">Clôturé le</th>
                  <th className="text-right py-2 px-2">Montant</th>
                  <th className="text-right py-2 px-2">Espèces</th>
                  <th className="text-right py-2 px-2">Digital</th>
                  <th className="text-left py-2 px-2">Validé comptable le</th>
                  <th className="text-right py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((report) => {
                  const busy = actionId === report.shiftId;
                  const showRejectModal = rejectModalId === report.shiftId;
                  return (
                    <tr
                      key={`${report.agencyId}-${report.shiftId}`}
                      className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-3 px-2">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          {report.agencyName ?? report.agencyId}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="inline-flex items-center gap-1">
                          <User className="w-4 h-4 text-gray-400" />
                          {report.userName ?? report.userCode ?? "—"}
                        </span>
                      </td>
                      <td className="py-3 px-2">{formatTs(report.endAt)}</td>
                      <td className="py-3 px-2 text-right font-medium">
                        {money(report.totalRevenue ?? 0)}
                      </td>
                      <td className="py-3 px-2 text-right">{money(report.totalCash ?? 0)}</td>
                      <td className="py-3 px-2 text-right">{money(report.totalDigital ?? 0)}</td>
                      <td className="py-3 px-2">{formatTs(report.validatedByAgencyAt)}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleValidate(report)}
                            disabled={busy}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRejectModalId(report.shiftId)}
                            disabled={busy}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Rejeter
                          </Button>
                        </div>
                        {showRejectModal && (
                          <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                            onClick={() => setRejectModalId(null)}
                          >
                            <div
                              className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-4 max-w-md w-full mx-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <h3 className="font-medium mb-2">Motif du rejet (optionnel)</h3>
                              <textarea
                                className="w-full border rounded px-2 py-1.5 text-sm min-h-[80px]"
                                value={rejectReason[report.shiftId] ?? ""}
                                onChange={(e) =>
                                  setRejectReason((prev) => ({
                                    ...prev,
                                    [report.shiftId]: e.target.value,
                                  }))
                                }
                                placeholder="Raison du rejet..."
                              />
                              <div className="flex justify-end gap-2 mt-3">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setRejectModalId(null)}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleReject(report)}
                                  disabled={busy}
                                >
                                  Confirmer le rejet
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
