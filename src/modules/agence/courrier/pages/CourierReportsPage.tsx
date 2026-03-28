/**
 * Rapport courrier : synthèse session en cours (comme le guichet) + liste des sessions agent.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import { getDoc, onSnapshot, query, where } from "firebase/firestore";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentRef } from "@/modules/logistics/domain/firestorePaths";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { recordShipmentEvent } from "@/modules/logistics/services/recordShipmentEvent";
import { decrementParcelCount } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { EmptyState } from "@/ui";
import { useCourierWorkspace } from "../context/CourierWorkspaceContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { formatFrenchDateTime } from "@/shared/date/fmtFrench";
import { Ban, Pencil, Truck } from "lucide-react";

function statusLabel(st: CourierSession["status"] | undefined): string {
  if (!st) return "—";
  if (st === "PENDING") return "En attente comptable";
  if (st === "ACTIVE") return "Active";
  if (st === "CLOSED") return "Clôturée";
  if (st === "VALIDATED_AGENCY") return "Validée compta — en attente chef d'agence";
  if (st === "VALIDATED") return "Validée";
  return st;
}

export default function CourierReportsPage() {
  const { user } = useAuth() as {
    user?: { companyId?: string; agencyId?: string; uid?: string; displayName?: string };
  };
  const money = useFormatCurrency();
  const w = useCourierWorkspace();
  const {
    session,
    sessionId,
    shipments,
    ledgerSessionTotal,
    agentCode,
    agentName,
    primaryColor,
    agencyId,
    markInTransit,
    inTransitLoading,
  } = w;

  const companyId = user?.companyId ?? "";
  const agentId = user?.uid ?? "";

  const [rows, setRows] = useState<Array<{ id: string; data: CourierSession }>>([]);
  const [reportError, setReportError] = useState<string | null>(null);

  const handleCancelShipment = useCallback(
    async (shipmentId: string) => {
      if (!window.confirm("Annuler cet envoi ? Le colis passera au statut annulé.")) return;
      setReportError(null);
      try {
        await recordShipmentEvent({
          companyId,
          shipmentId,
          eventType: "CANCELLED",
          agencyId,
          performedBy: agentId,
        });
        const snap = await getDoc(shipmentRef(db, companyId, shipmentId));
        const trip = (snap.data() as Shipment | undefined)?.tripInstanceId?.trim();
        if (trip) await decrementParcelCount(companyId, trip, 1).catch(() => {});
      } catch (e) {
        setReportError(e instanceof Error ? e.message : "Annulation impossible");
      }
    },
    [companyId, agencyId, agentId]
  );

  useEffect(() => {
    if (!companyId || !agencyId || !agentId) {
      setRows([]);
      return;
    }
    const col = courierSessionsRef(db, companyId, agencyId);
    const unsub = onSnapshot(query(col, where("agentId", "==", agentId)), (snap) => {
      const byTime = (d: { data: () => Record<string, unknown> }) =>
        (d.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      const sorted = [...snap.docs]
        .sort((a, b) => byTime(b) - byTime(a))
        .map((d) => ({ id: d.id, data: { ...d.data(), sessionId: d.id } as CourierSession }));
      setRows(sorted);
    });
    return () => unsub();
  }, [companyId, agencyId, agentId]);

  const sessionPeriodLabel = useMemo(() => {
    if (!session?.openedAt) return "—";
    const opened = formatFrenchDateTime(session.openedAt);
    const end =
      session.status === "ACTIVE" ? "En cours" : formatFrenchDateTime(session.closedAt ?? session.validatedAt);
    return `${opened} → ${end}`;
  }, [session]);

  const colisEnvoyes = useMemo(
    () => shipments.filter((s) => s.currentStatus === "IN_TRANSIT").length,
    [shipments]
  );
  const colisRemis = useMemo(
    () =>
      shipments.filter((s) => s.currentStatus === "DELIVERED" || s.currentStatus === "CLOSED").length,
    [shipments]
  );
  const colisEnAttente = useMemo(
    () =>
      shipments.filter((s) =>
        ["CREATED", "STORED", "ASSIGNED", "READY_FOR_PICKUP", "ARRIVED"].includes(s.currentStatus)
      ).length,
    [shipments]
  );
  const colisAnomalie = useMemo(
    () => shipments.filter((s) => s.arrivalAnomalyFlag === true).length,
    [shipments]
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Rapport</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Session en cours : financier (ledger), liste détaillée des colis et actions (CREATED) ; puis historique des sessions.
        L&apos;écran <span className="font-medium text-gray-700 dark:text-gray-300">Envoi</span> sert uniquement à créer ou
        modifier un colis, un par un.
      </p>

      {reportError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {reportError}
          <button type="button" className="ml-3 underline" onClick={() => setReportError(null)}>
            Fermer
          </button>
        </div>
      )}

      {session?.status === "ACTIVE" && sessionId && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Financier — encaissement (ledger)
              </h2>
              <p className="mt-2 text-2xl font-bold teliya-monetary" style={{ color: primaryColor }}>
                {ledgerSessionTotal == null ? "—" : money(ledgerSessionTotal)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Montant issu du ledger / transactions de caisse rattachées à cette session. À ne pas confondre avec le simple
                décompte de colis.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Opérationnel — activité colis
              </h2>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{shipments.length}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Total enregistré sur cette session (tous statuts confondus).
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Envoyés
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">{colisEnvoyes}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">En transit</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Remis
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">{colisRemis}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Livrés / clos</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    En attente
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">{colisEnAttente}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Créé, arrivée, prêt…</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Anomalie
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-amber-800 dark:text-amber-200">{colisAnomalie}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Signalées arrivée</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Les quatre indicateurs se recoupent possiblement (ex. anomalie + autre statut). Calculs uniquement sur les colis
                de la session affichée.
              </p>
            </div>
          </div>

          {shipments.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <h3 className="border-b border-gray-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                Opérations de session (liste complète & actions CREATED)
              </h3>
              <div className="max-h-[min(560px,65vh)] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                      <th className="p-3">N°</th>
                      <th className="p-3">Créé</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3">Montant</th>
                      <th className="p-3">Anomalie</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shipments]
                      .sort(
                        (a, b) =>
                          ((b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0) -
                          ((a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0)
                      )
                      .map((s, i) => {
                        const amt = Number(s.transportFee ?? 0) + Number(s.insuranceAmount ?? 0);
                        const canManageCreated = s.currentStatus === "CREATED" && s.originAgencyId === agencyId;
                        return (
                          <tr
                            key={s.shipmentId}
                            className={`border-b border-gray-100 dark:border-gray-700 ${i % 2 === 1 ? "bg-gray-50/80 dark:bg-gray-800/40" : ""}`}
                          >
                            <td className="whitespace-nowrap p-3 font-mono text-xs">{s.shipmentNumber ?? s.shipmentId}</td>
                            <td className="whitespace-nowrap p-3 text-gray-600 dark:text-gray-400">
                              {formatFrenchDateTime(s.createdAt)}
                            </td>
                            <td className="p-3">{s.currentStatus}</td>
                            <td className="whitespace-nowrap p-3 teliya-monetary">{money(amt)}</td>
                            <td className="p-3">
                              {s.arrivalAnomalyFlag ? (
                                <span className="font-medium text-amber-800 dark:text-amber-200">Oui</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="p-3">
                              {canManageCreated ? (
                                <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                                  <Link
                                    to={`/agence/courrier/nouveau?edit=${encodeURIComponent(s.shipmentId)}`}
                                    className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium dark:border-gray-600"
                                    style={{ color: primaryColor }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Modifier
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => void handleCancelShipment(s.shipmentId)}
                                    className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-800 dark:border-red-900 dark:text-red-200"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                    Annuler
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!!inTransitLoading[s.shipmentId]}
                                    onClick={() => void markInTransit(s.shipmentId)}
                                    className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-gray-600"
                                  >
                                    <Truck className="h-3.5 w-3.5" />
                                    En transit
                                  </button>
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/60 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Période</p>
              <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">{sessionPeriodLabel}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Agent</p>
              <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                {user?.displayName ?? agentName}{" "}
                <span className="font-mono text-gray-500">({agentCode})</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sessions enregistrées</h2>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState message="Aucune session à afficher." />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {rows.map(({ id, data }) => {
              const comptableValidated =
                data.status === "VALIDATED_AGENCY" || data.status === "VALIDATED";
              const chefValidated = data.status === "VALIDATED";
              const diff = Number((data as unknown as { difference?: number }).difference ?? 0);
              const hasDiscrepancy = Number.isFinite(diff) && Math.abs(diff) > 0.01;
              return (
                <div
                  key={id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 ${
                    hasDiscrepancy
                      ? "border-amber-300 dark:border-amber-700"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Session courrier</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatFrenchDateTime(data.openedAt)} — {formatFrenchDateTime(data.closedAt)}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {statusLabel(data.status)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${comptableValidated ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
                      Comptable {comptableValidated ? "✓" : "…"}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${chefValidated ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
                      Chef {chefValidated ? "✓" : "…"}
                    </span>
                    {hasDiscrepancy ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                        Litige {diff > 0 ? "+" : ""}{money(diff)}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Agent <span className="font-mono text-gray-700 dark:text-gray-300">{data.agentCode ?? "—"}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
