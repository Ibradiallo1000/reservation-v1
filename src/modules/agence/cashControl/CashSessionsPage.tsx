/**
 * Agency cash control — list sessions, open/close (agent), validate/reject (accountant).
 */
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, ActionButton } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  Wallet,
  Plus,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Clock,
  Banknote,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import {
  openCashSession,
  closeCashSession,
  validateCashSession,
  rejectCashSession,
  suspendCashSession,
  listCashSessions,
} from "./cashSessionService";
import {
  CASH_SESSION_TYPE,
  CASH_SESSION_STATUS,
  getTotalExpected,
  getTotalCounted,
  type CashSessionDocWithId,
} from "./cashSessionTypes";
import { OperationalHintRow } from "@/modules/agence/components/OperationalDataHint";
import { createChefIncident } from "@/modules/agence/manager/incidentStore";

export type CashSessionsPageProps = { embedded?: boolean };

export default function CashSessionsPage({ embedded = false }: CashSessionsPageProps = {}) {
  const { user } = useAuth();
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const userId = user?.uid ?? "";
  const userRole = (user as { role?: string })?.role ?? "";
  const isAccountant =
    userRole === "agency_accountant" || userRole === "admin_compagnie";
  const isChefSupervisor =
    userRole === "chefAgence" || userRole === "superviseur" || userRole === "admin_compagnie";

  const [sessions, setSessions] = useState<CashSessionDocWithId[]>([]);
  const [openSessions, setOpenSessions] = useState<CashSessionDocWithId[]>([]);
  const [closedSessions, setClosedSessions] = useState<CashSessionDocWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState<"none" | "open" | "close">("none");
  const [openingBalance, setOpeningBalance] = useState("");
  const [countedBalance, setCountedBalance] = useState("");
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendConfirmOpen, setSuspendConfirmOpen] = useState(false);

  const load = async () => {
    if (!companyId || !agencyId) return;
    setLoading(true);
    try {
      const list = await listCashSessions(companyId, agencyId, { limitCount: 100 });
      setSessions(list);
      setOpenSessions(list.filter((s) => s.status === CASH_SESSION_STATUS.OPEN));
      setClosedSessions(
        list.filter((s) => s.status === CASH_SESSION_STATUS.CLOSED)
      );
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

  const handleOpenSession = async (type: "GUICHET" | "COURRIER") => {
    const amount = Number(openingBalance.replace(/,/, "."));
    if (isNaN(amount) || amount < 0) {
      toast.error("Montant d'ouverture invalide");
      return;
    }
    setProcessing(true);
    try {
      await openCashSession(companyId, agencyId, userId, type, amount);
      toast.success("Session ouverte");
      setOpenModal("none");
      setOpeningBalance("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Impossible d'ouvrir la session");
    } finally {
      setProcessing(false);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    const amount = Number(countedBalance.replace(/,/, "."));
    if (isNaN(amount) && countedBalance !== "") {
      toast.error("Montant compté invalide");
      return;
    }
    const count = amount;
    setProcessing(true);
    try {
      await closeCashSession(companyId, agencyId, sessionId, count, userId);
      toast.success("Session clôturée");
      setOpenModal("none");
      setClosingSessionId(null);
      setCountedBalance("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Impossible de clôturer");
    } finally {
      setProcessing(false);
    }
  };

  const handleValidate = async (sessionId: string) => {
    setProcessing(true);
    try {
      await validateCashSession(companyId, agencyId, sessionId, userId, userRole);
      toast.success("Session validée");
      load();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Impossible de valider");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (sessionId: string) => {
    setProcessing(true);
    try {
      await rejectCashSession(
        companyId,
        agencyId,
        sessionId,
        userId,
        rejectReason || undefined
      );
      toast.success("Session rejetée");
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Impossible de rejeter");
    } finally {
      setProcessing(false);
    }
  };

  const handleSuspend = async (sessionId: string) => {
    const reason = suspendReason.trim();
    if (!reason) {
      toast.error("Motif requis.");
      return;
    }
    setProcessing(true);
    try {
      await suspendCashSession(companyId, agencyId, sessionId, userId, reason);
      createChefIncident(companyId, agencyId, {
        status: "open",
        severity: "critical",
        createdBy: { id: userId, name: (user as any)?.displayName ?? undefined },
        reason,
        relatedSessionId: sessionId,
        source: "cash",
        type: "suspension",
      });
      toast.success("Session suspendue.");
      setSuspendingId(null);
      setSuspendReason("");
      setSuspendConfirmOpen(false);
      load();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Impossible de suspendre");
    } finally {
      setProcessing(false);
    }
  };

  const totalDiscrepancy = sessions
    .filter((s) => s.status === CASH_SESSION_STATUS.CLOSED && s.discrepancy != null)
    .reduce((sum, s) => sum + (Number(s.discrepancy) ?? 0), 0);

  const canClose = (s: CashSessionDocWithId) =>
    s.status === CASH_SESSION_STATUS.OPEN && s.agentId === userId;

  const sessionsBody = (
    <>
      {!embedded && (
      <PageHeader
        title="Contrôle caisse"
        subtitle="Sessions terrain par agent (guichet / courrier) — non comptabilisées"
      />
      )}
      {embedded && (
        <p className="text-xs text-gray-500 mb-3 dark:text-slate-400">
          Contrôle terrain (complément du ledger). La validation comptable des clôtures se fait selon les rôles.
        </p>
      )}

      <OperationalHintRow>
        Les sessions et écarts ci-dessous servent au <strong>contrôle terrain</strong> ; la comptabilité officielle reste le{" "}
        <strong>ledger</strong> (financialTransactions / comptes).
      </OperationalHintRow>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <MetricCard
          label="Sessions ouvertes"
          value={String(openSessions.length)}
          icon={Clock}
        />
        <MetricCard
          label="En attente validation"
          value={String(closedSessions.length)}
          icon={Wallet}
        />
        <MetricCard
          label="Écart total (clôturées)"
          value={money(totalDiscrepancy)}
          icon={totalDiscrepancy !== 0 ? AlertTriangle : Banknote}
        />
      </div>

      <SectionCard title="Sessions" className="mb-6">
        {loading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <ActionButton
                onClick={() => setOpenModal("open")}
                disabled={processing}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ouvrir une session
              </ActionButton>
            </div>

            {openModal === "open" && (
              <div className="p-4 border rounded-lg bg-muted/30 mb-4">
                <p className="text-sm font-medium mb-2">Solde d'ouverture (espèces)</p>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="border rounded px-3 py-2 w-40"
                  placeholder="0"
                />
                <div className="flex gap-2 mt-3">
                  <ActionButton
                    size="sm"
                    onClick={() => handleOpenSession(CASH_SESSION_TYPE.GUICHET)}
                    disabled={processing}
                  >
                    <Banknote className="w-4 h-4 mr-1" />
                    Guichet
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => handleOpenSession(CASH_SESSION_TYPE.COURRIER)}
                    disabled={processing}
                  >
                    <Package className="w-4 h-4 mr-1" />
                    Courrier
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOpenModal("none");
                      setOpeningBalance("");
                    }}
                  >
                    Annuler
                  </ActionButton>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Agent</th>
                    <th className="text-right p-2">Ouverture</th>
                    <th className="text-right p-2">Attendu</th>
                    <th className="text-right p-2">Compté</th>
                    <th className="text-right p-2">Écart</th>
                    <th className="text-left p-2">Statut</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="p-2">
                        {s.type === CASH_SESSION_TYPE.GUICHET ? (
                          <Banknote className="w-4 h-4 inline mr-1" />
                        ) : (
                          <Package className="w-4 h-4 inline mr-1" />
                        )}
                        {s.type}
                      </td>
                      <td className="p-2 font-mono text-xs">{s.agentId.slice(0, 8)}…</td>
                      <td className="p-2 text-right">{money(s.openingBalance)}</td>
                      <td className="p-2 text-right">{money(getTotalExpected(s))}</td>
                      <td className="p-2 text-right">
                        {s.status === CASH_SESSION_STATUS.CLOSED || s.countedBalance != null || s.countedCash != null ? money(getTotalCounted(s)) : "—"}
                      </td>
                      <td className="p-2 text-right">
                        {s.discrepancy != null ? (
                          <span
                            className={
                              Number(s.discrepancy) !== 0
                                ? "text-amber-600 font-medium"
                                : ""
                            }
                          >
                            {money(s.discrepancy)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            s.status === CASH_SESSION_STATUS.SUSPENDED
                              ? "inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/30 dark:text-red-200"
                              : s.status === CASH_SESSION_STATUS.CLOSED
                                ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                                : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        {s.status === CASH_SESSION_STATUS.OPEN && canClose(s) && (
                          <ActionButton
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setClosingSessionId(s.id);
                              setOpenModal("close");
                              setCountedBalance(String(getTotalExpected(s)));
                            }}
                            disabled={processing}
                          >
                            Clôturer
                          </ActionButton>
                        )}
                        {s.status === CASH_SESSION_STATUS.CLOSED && isAccountant && (
                          <span className="flex gap-1 justify-end">
                            <ActionButton
                              size="sm"
                              onClick={() => handleValidate(s.id)}
                              disabled={processing}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Valider
                            </ActionButton>
                            <ActionButton
                              size="sm"
                              variant="danger"
                              onClick={() => setRejectingId(s.id)}
                              disabled={processing}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Rejeter
                            </ActionButton>
                          </span>
                        )}
                        {(s.status === CASH_SESSION_STATUS.OPEN ||
                          (s.status === CASH_SESSION_STATUS.CLOSED && Math.abs(Number(s.discrepancy ?? 0)) > 0.01)) &&
                          isChefSupervisor && (
                          <span className="flex gap-1 justify-end mt-1">
                            <ActionButton
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                setSuspendingId(s.id);
                                setSuspendReason("");
                                setSuspendConfirmOpen(true);
                              }}
                              disabled={processing}
                            >
                              Suspendre
                            </ActionButton>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {openModal === "close" && closingSessionId && (
              <div className="p-4 border rounded-lg bg-muted/30 mt-4">
                <p className="text-sm font-medium mb-2">Montant compté (espèces)</p>
                <input
                  type="number"
                  step="0.01"
                  value={countedBalance}
                  onChange={(e) => setCountedBalance(e.target.value)}
                  className="border rounded px-3 py-2 w-40"
                />
                <div className="flex gap-2 mt-3">
                  <ActionButton
                    size="sm"
                    onClick={() => handleCloseSession(closingSessionId)}
                    disabled={processing}
                  >
                    Confirmer clôture
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOpenModal("none");
                      setClosingSessionId(null);
                      setCountedBalance("");
                    }}
                  >
                    Annuler
                  </ActionButton>
                </div>
              </div>
            )}

            {rejectingId && (
              <div className="p-4 border rounded-lg bg-muted/30 mt-4">
                <p className="text-sm font-medium mb-2">Motif du rejet (optionnel)</p>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="border rounded px-3 py-2 w-full max-w-md"
                  placeholder="Raison du rejet"
                />
                <div className="flex gap-2 mt-3">
                  <ActionButton
                    size="sm"
                    variant="danger"
                    onClick={() => handleReject(rejectingId)}
                    disabled={processing}
                  >
                    Rejeter
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRejectingId(null);
                      setRejectReason("");
                    }}
                  >
                    Annuler
                  </ActionButton>
                </div>
              </div>
            )}

            {suspendConfirmOpen && suspendingId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
                <div className="w-full max-w-md rounded-xl border-2 border-red-300 bg-red-50 p-5 shadow-xl dark:border-red-700 dark:bg-red-950/25">
                  <div className="text-base font-semibold text-red-900 dark:text-red-100">Action critique - Suspension</div>
                  <p className="mt-1 text-sm text-red-800 dark:text-red-200">
                    This will block all operations for this session.
                  </p>
                  <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                    Motif obligatoire
                  </label>
                  <textarea
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm min-h-[96px] dark:border-red-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Incohérence détectée, vérification comptable requise…"
                  />
                  <div className="mt-4 flex justify-end gap-2">
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSuspendConfirmOpen(false);
                        setSuspendingId(null);
                        setSuspendReason("");
                      }}
                    >
                      Annuler
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="danger"
                      onClick={() => handleSuspend(suspendingId)}
                      disabled={processing}
                    >
                      Confirmer suspension
                    </ActionButton>
                  </div>
                </div>
              </div>
            )}

            {sessions.length === 0 && !loading && (
              <p className="text-muted-foreground py-4">
                Aucune session caisse. Ouvrez une session pour commencer.
              </p>
            )}
          </>
        )}
      </SectionCard>
    </>
  );

  return embedded ? (
    <div className="space-y-4">{sessionsBody}</div>
  ) : (
    <StandardLayoutWrapper>{sessionsBody}</StandardLayoutWrapper>
  );
}
