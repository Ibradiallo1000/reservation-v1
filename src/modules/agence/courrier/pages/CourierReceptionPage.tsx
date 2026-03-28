// CourierReceptionPage — Arrivages : transport ARRIVED + needsValidation + destination ; provenance bus affichée.

import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { markShipmentArrived } from "@/modules/logistics/services/markShipmentArrived";
import {
  confirmShipmentArrivalValidation,
  reportShipmentArrivalAnomaly,
} from "@/modules/logistics/services/shipmentArrivalControlService";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import type { Company } from "@/types/companyTypes";
import { Inbox, Truck, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { SectionCard, EmptyState } from "@/ui";

export default function CourierReceptionPage() {
  const { user, company } = useAuth() as { user: { uid: string; companyId?: string; agencyId?: string }; company: unknown };
  const theme = useCompanyTheme(company as Company | null);
  const primaryColor = theme?.colors?.primary ?? "#ea580c";
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [awaitingValidation, setAwaitingValidation] = useState<Shipment[]>([]);
  const [legacyPendingArrival, setLegacyPendingArrival] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [rows, setRows] = useState<Shipment[]>([]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const q = query(
      shipmentsRef(db, companyId),
      where("destinationAgencyId", "==", agencyId),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment)));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  useEffect(() => {
    setAwaitingValidation(
      rows.filter((s) => s.transportStatus === "ARRIVED" && s.needsValidation === true)
    );
    setLegacyPendingArrival(
      rows.filter((s) => ["CREATED", "IN_TRANSIT"].includes(s.currentStatus))
    );
  }, [rows]);

  const setRowLoading = (shipmentId: string, v: boolean) => {
    setLoading((p) => ({ ...p, [shipmentId]: v }));
  };

  const handleConfirmValidation = async (shipmentId: string) => {
    if (!user?.uid) return;
    setError(null);
    setRowLoading(shipmentId, true);
    try {
      await confirmShipmentArrivalValidation({
        companyId,
        shipmentId,
        performedBy: user.uid,
        agencyId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRowLoading(shipmentId, false);
    }
  };

  const handleReportAnomaly = async (shipmentId: string) => {
    if (!user?.uid) return;
    setError(null);
    setRowLoading(shipmentId, true);
    try {
      await reportShipmentArrivalAnomaly({
        companyId,
        shipmentId,
        performedBy: user.uid,
        agencyId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRowLoading(shipmentId, false);
    }
  };

  const handleMarkArrived = async (shipmentId: string) => {
    setError(null);
    setRowLoading(shipmentId, true);
    try {
      await markShipmentArrived({ companyId, shipmentId, performedBy: user!.uid, agencyId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRowLoading(shipmentId, false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <div className="mb-6 flex items-start gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-100 dark:bg-gray-800"
          style={{ color: primaryColor }}
        >
          <Inbox className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Arrivages</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Colis proposés par le transport : provenance bus, validation ou anomalie. La remise se fait dans l’onglet Remise.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline">
            Fermer
          </button>
        </div>
      )}

      <SectionCard title="File d’arrivages" icon={Truck}>
        {awaitingValidation.length === 0 ? (
          <EmptyState message="Aucun colis en attente de validation d’arrivée." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600 dark:text-gray-400">
                  <th className="p-3">Code</th>
                  <th className="p-3">Destinataire</th>
                  <th className="p-3">Statut opér.</th>
                  <th className="min-w-[180px] p-3">Trajet</th>
                  <th className="min-w-[200px] p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {awaitingValidation.map((s) => {
                  return (
                    <tr key={s.shipmentId} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="p-3 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                      <td className="p-3">{s.receiver?.name ?? "—"}</td>
                      <td className="p-3">{s.currentStatus}</td>
                      <td className="p-3 align-top">
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          {s.tripInstanceId ? String(s.tripInstanceId) : "—"}
                        </span>
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConfirmValidation(s.shipmentId)}
                            disabled={loading[s.shipmentId]}
                            className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: primaryColor }}
                          >
                            Valider contrôle
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReportAnomaly(s.shipmentId)}
                            disabled={loading[s.shipmentId]}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                          >
                            <AlertTriangle className="h-4 w-4" />
                            Signaler anomalie
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {legacyPendingArrival.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <button
            type="button"
            onClick={() => setManualOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-amber-950 dark:text-amber-100"
          >
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Secours — mode manuel
              <span className="rounded-full border border-amber-500 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:border-amber-600 dark:bg-amber-950/80 dark:text-amber-200">
                ⚠️ Mode manuel
              </span>
            </span>
            {manualOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {manualOpen && (
            <div className="border-t border-amber-200 px-4 pb-4 pt-2 dark:border-amber-900">
              <p className="mb-3 text-xs text-amber-900/90 dark:text-amber-200/90">
                Colis sans file transport ou ancien parcours. À utiliser uniquement si nécessaire.
              </p>
              <div className="overflow-x-auto rounded-lg border border-amber-200/80 bg-white dark:border-amber-900 dark:bg-gray-950">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-600 dark:text-gray-400">
                      <th className="p-3">Code</th>
                      <th className="p-3">Destinataire</th>
                      <th className="p-3">Statut</th>
                      <th className="w-40 p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legacyPendingArrival.map((s) => (
                      <tr key={s.shipmentId} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="p-3 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                        <td className="p-3">{s.receiver?.name ?? "—"}</td>
                        <td className="p-3">{s.currentStatus}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => void handleMarkArrived(s.shipmentId)}
                            disabled={loading[s.shipmentId]}
                            className="min-h-[44px] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            Marquer arrivé
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
