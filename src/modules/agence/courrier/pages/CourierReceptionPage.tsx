// CourierReceptionPage — Phase 1: (1) Envois à marquer arrivés (simulation) → ARRIVED ; (2) ARRIVED → Prêt à retirer → READY_FOR_PICKUP.

import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { onSnapshot, query, where } from "firebase/firestore";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { markShipmentArrived } from "@/modules/logistics/services/markShipmentArrived";
import { markReadyForPickup } from "@/modules/logistics/services/markReadyForPickup";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { Inbox, Loader2, CheckCircle, Truck } from "lucide-react";
import CourierPageHeader from "../components/CourierPageHeader";

export default function CourierReceptionPage() {
  const { user, company } = useAuth() as { user: { uid: string; companyId?: string; agencyId?: string }; company: unknown };
  const theme = useCompanyTheme(company);
  const primaryColor = theme?.colors?.primary ?? "#ea580c";
  const secondaryColor = theme?.colors?.secondary ?? "#f97316";
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const [pendingArrival, setPendingArrival] = useState<Shipment[]>([]);
  const [arrived, setArrived] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const qPending = query(
      shipmentsRef(db, companyId),
      where("destinationAgencyId", "==", agencyId),
      where("currentStatus", "in", ["CREATED", "IN_TRANSIT"])
    );
    const unsub1 = onSnapshot(qPending, (snap) => {
      setPendingArrival(snap.docs.map((d) => d.data() as Shipment));
    });
    return () => unsub1();
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const qArrived = query(
      shipmentsRef(db, companyId),
      where("destinationAgencyId", "==", agencyId),
      where("currentStatus", "==", "ARRIVED")
    );
    const unsub2 = onSnapshot(qArrived, (snap) => {
      setArrived(snap.docs.map((d) => d.data() as Shipment));
    });
    return () => unsub2();
  }, [companyId, agencyId]);

  const handleMarkArrived = async (shipmentId: string) => {
    setError(null);
    setLoading((p) => ({ ...p, [shipmentId]: true }));
    try {
      await markShipmentArrived({ companyId, shipmentId, performedBy: user!.uid, agencyId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading((p) => ({ ...p, [shipmentId]: false }));
    }
  };

  const handleMarkReady = async (shipmentId: string) => {
    setError(null);
    setLoading((p) => ({ ...p, [shipmentId]: true }));
    try {
      await markReadyForPickup({
        companyId,
        shipmentId,
        performedBy: user!.uid,
        agencyId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading((p) => ({ ...p, [shipmentId]: false }));
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <CourierPageHeader
        icon={Inbox}
        title="Réception Colis"
        primaryColor={primaryColor}
        description="Marquez les envois « Arrivés », puis « Prêt à retirer » pour la remise."
      />
      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm flex justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline">Fermer</button>
        </div>
      )}

      {pendingArrival.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <Truck className="w-5 h-5" />
            Envois à marquer arrivés (simulation Phase 1)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="p-3">Code</th>
                  <th className="p-3">Destinataire</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3 w-40">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingArrival.map((s) => (
                  <tr key={s.shipmentId} className="border-b">
                    <td className="p-3 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                    <td className="p-3">{s.receiver?.name ?? "—"}</td>
                    <td className="p-3">{s.currentStatus}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleMarkArrived(s.shipmentId)}
                        disabled={loading[s.shipmentId]}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm min-h-[44px]"
                      >
                        {loading[s.shipmentId] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                        Marquer arrivé
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <h2 className="font-semibold text-gray-800 p-4 pb-0">Envois arrivés — Prêt à retirer</h2>
        {arrived.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aucun envoi en statut Arrivé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="p-3">Code</th>
                  <th className="p-3">Destinataire</th>
                  <th className="p-3">Tél.</th>
                  <th className="p-3 hidden sm:table-cell">Expéditeur</th>
                  <th className="p-3 w-40">Action</th>
                </tr>
              </thead>
              <tbody>
                {arrived.map((s) => (
                  <tr key={s.shipmentId} className="border-b">
                    <td className="p-3 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                    <td className="p-3">{s.receiver?.name ?? "—"}</td>
                    <td className="p-3">{s.receiver?.phone ?? "—"}</td>
                    <td className="p-3 hidden sm:table-cell">{s.sender?.name ?? "—"}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleMarkReady(s.shipmentId)}
                        disabled={loading[s.shipmentId]}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-sm min-h-[44px]"
                      >
                        {loading[s.shipmentId] ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Prêt à retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
