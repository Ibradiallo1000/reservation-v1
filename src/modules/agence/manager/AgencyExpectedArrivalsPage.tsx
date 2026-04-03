import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState, PageHeader, SectionCard } from "@/ui";
import {
  confirmTripArrivalAtDestination,
  markTripReturnToOrigin,
} from "@/modules/compagnie/tripInstances/tripInstanceService";
import type { TripInstanceDocWithId } from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import type { TripExecutionDoc } from "@/modules/compagnie/tripExecutions/tripExecutionTypes";

type ArrivalRow = {
  id: string;
  origin: string;
  departureTime: string;
  vehiclePlate: string;
  driverName: string;
  convoyeurName: string;
  statusLabel: string;
  timeline: Array<{ key: string; label: string; at?: unknown }>;
};

const AgencyExpectedArrivalsPage: React.FC = () => {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? null;
  const agencyId = user?.agencyId ?? null;
  const uid = user?.uid ?? null;
  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const isDestinationAgencyManager = rolesArr.includes("chefAgence") || rolesArr.includes("chefagence");

  const [rows, setRows] = useState<ArrivalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadEnrichedRow = useCallback(
    async (ti: TripInstanceDocWithId): Promise<ArrivalRow> => {
      const origin = String((ti as any).departure ?? (ti as any).departureCity ?? (ti as any).routeDeparture ?? "").trim() || "—";
      const departureTime = String((ti as any).time ?? (ti as any).departureTime ?? "").trim() || "—";
      const weeklyTripId = String((ti as any).weeklyTripId ?? "").trim();
      const date = String((ti as any).date ?? "").trim();
      const heure = String((ti as any).departureTime ?? (ti as any).time ?? "").trim();
      const originAgencyId = String((ti as any).agencyId ?? "").trim();
      const vehicleId = String((ti as any).vehicleId ?? "").trim();

      let vehiclePlate = "—";
      if (vehicleId) {
        try {
          const vSnap = await getDoc(doc(db, `companies/${companyId}/fleetVehicles/${vehicleId}`));
          if (vSnap.exists()) {
            vehiclePlate = String((vSnap.data() as any).plateNumber ?? "").trim() || vehicleId;
          } else vehiclePlate = vehicleId;
        } catch {
          vehiclePlate = vehicleId;
        }
      }

      let driverName = "—";
      let convoyeurName = "—";
      if (originAgencyId && weeklyTripId && date && heure) {
        const assignmentId = `${weeklyTripId}_${date}_${heure}`;
        try {
          const asgSnap = await getDoc(
            doc(db, `companies/${companyId}/agences/${originAgencyId}/tripAssignments/${assignmentId}`)
          );
          if (asgSnap.exists()) {
            const a = asgSnap.data() as any;
            driverName = String(a.driverName ?? "").trim() || "—";
            convoyeurName = String(a.convoyeurName ?? "").trim() || "—";
          }
        } catch {
          /* noop */
        }
      }

      let te: TripExecutionDoc | null = null;
      try {
        const teSnap = await getDoc(doc(db, `companies/${companyId}/tripExecutions/${ti.id}`));
        if (teSnap.exists()) te = teSnap.data() as TripExecutionDoc;
      } catch {
        te = null;
      }

      return {
        id: ti.id,
        origin,
        departureTime,
        vehiclePlate,
        driverName,
        convoyeurName,
        statusLabel: "En route vers vous",
        timeline: [
          { key: "boarding", label: "Embarquement", at: te?.boardingStartedAt },
          { key: "depart", label: "Validation départ", at: te?.departureValidatedAt ?? te?.agencyValidatedAt ?? te?.departedAt },
          { key: "transit", label: "Transit", at: te?.transitAt ?? te?.departedAt },
          { key: "arrival", label: "Arrivée", at: (ti as any).arrivalValidatedAt ?? te?.arrivedAt },
        ],
      };
    },
    [companyId]
  );

  useEffect(() => {
    if (!companyId || !agencyId || !isDestinationAgencyManager) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, `companies/${companyId}/tripInstances`),
      where("destinationAgencyId", "==", agencyId),
      where("statutMetier", "==", "en_transit")
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TripInstanceDocWithId));
        const enriched = await Promise.all(list.map((ti) => loadEnrichedRow(ti)));
        enriched.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
        setRows(enriched);
        setLoading(false);
      },
      () => {
        setRows([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [agencyId, companyId, isDestinationAgencyManager, loadEnrichedRow]);

  const handleConfirmArrival = useCallback(
    async (tripInstanceId: string) => {
      if (!companyId || !agencyId || !uid) return;
      setBusyId(tripInstanceId);
      try {
        await confirmTripArrivalAtDestination({
          companyId,
          tripInstanceId,
          destinationAgencyId: agencyId,
          validatedBy: uid,
        });
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erreur de validation arrivée.");
      } finally {
        setBusyId(null);
      }
    },
    [agencyId, companyId, uid]
  );

  const handleMarkReturn = useCallback(
    async (tripInstanceId: string) => {
      if (!companyId || !uid) return;
      setBusyId(tripInstanceId);
      try {
        await markTripReturnToOrigin({
          companyId,
          tripInstanceId,
          byUserId: uid,
        });
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erreur de journalisation retour gare.");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, uid]
  );

  const canAccess = useMemo(
    () => isDestinationAgencyManager && !!agencyId && !!companyId,
    [agencyId, companyId, isDestinationAgencyManager]
  );

  if (!canAccess) {
    return (
      <SectionCard title="Arrivées attendues">
        <p className="text-sm text-red-700 dark:text-red-300">
          Accès refusé: page réservée au chef d'agence destination.
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Arrivées attendues" subtitle="Trajets en transit vers votre agence" />
      {loading ? (
        <SectionCard title="Chargement">
          <p className="text-sm text-gray-600 dark:text-gray-300">Chargement des trajets en transit…</p>
        </SectionCard>
      ) : rows.length === 0 ? (
        <SectionCard title="Arrivées attendues">
          <EmptyState message="Aucune arrivée attendue" />
        </SectionCard>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <SectionCard key={r.id} title={`${r.origin} • départ ${r.departureTime}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
                <div><span className="font-semibold">Véhicule:</span> {r.vehiclePlate}</div>
                <div><span className="font-semibold">Chauffeur:</span> {r.driverName}</div>
                <div><span className="font-semibold">Convoyeur:</span> {r.convoyeurName}</div>
                <div><span className="font-semibold">Statut:</span> {r.statusLabel}</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 mb-3">
                <div className="text-xs font-semibold mb-1">Timeline</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                  {r.timeline.map((t) => (
                    <div key={t.key} className="flex items-center justify-between gap-2">
                      <span>{t.label}</span>
                      <span className="text-gray-500">{t.at ? "OK" : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                  disabled={busyId === r.id}
                  onClick={() => void handleConfirmArrival(r.id)}
                >
                  {busyId === r.id ? "Validation..." : "Confirmer arrivée du véhicule"}
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-amber-300 text-amber-800 dark:text-amber-200 text-sm font-semibold disabled:opacity-50"
                  disabled={busyId === r.id}
                  onClick={() => void handleMarkReturn(r.id)}
                >
                  {busyId === r.id ? "Journalisation..." : "Signaler retour gare"}
                </button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgencyExpectedArrivalsPage;

