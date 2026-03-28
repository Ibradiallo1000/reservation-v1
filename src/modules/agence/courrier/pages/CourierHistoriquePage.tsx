/**
 * Historique courrier agence: lecture directe shipments, sans agrégation frontend.
 */

import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import {
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { EmptyState } from "@/ui";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { formatFrenchDateTime } from "@/shared/date/fmtFrench";

const PAGE_SIZE = 50;

export default function CourierHistoriquePage() {
  const { user } = useAuth() as {
    user: { displayName?: string; agencyNom?: string; role?: string | string[]; companyId?: string; agencyId?: string };
  };
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [rows, setRows] = useState<Shipment[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setRows([]);
      setLoadingInitial(false);
      return;
    }
    setLoadingInitial(true);
    setLoadError(null);
    void (async () => {
      try {
        const snap = await getDocs(
          query(
            shipmentsRef(db, companyId),
            where("currentAgencyId", "==", agencyId),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
          )
        );
        setRows(snap.docs.map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment)));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Impossible de charger l’historique.");
        setRows([]);
      } finally {
        setLoadingInitial(false);
      }
    })();
  }, [companyId, agencyId]);

  return (
    <div lang="fr" className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Historique</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Archive lecture seule — pas d&apos;impression ni d&apos;action ici. Pour un envoi en cours, utilisez l&apos;écran{" "}
        <span className="font-medium text-gray-700 dark:text-gray-300">Envoi</span>.
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Affichage direct des {PAGE_SIZE} derniers colis de l’agence (plus récents d’abord).
      </p>

      {loadingInitial ? (
        <div className="mt-6 space-y-3">
          <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
        </div>
      ) : loadError && rows.length === 0 ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : (
        <>
          {loadError && (
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">{loadError}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span>
              {rows.length} colis chargé{rows.length !== 1 ? "s" : ""} — source directe `shipments`.
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="mt-6">
              <EmptyState message="Aucun colis trouvé." />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                    <th className="p-3">N°</th>
                    <th className="p-3">Créé</th>
                    <th className="p-3">Expéditeur</th>
                    <th className="p-3">Destinataire</th>
                    <th className="p-3">Route</th>
                    <th className="p-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr
                      key={s.shipmentId}
                      className={`border-b border-gray-100 dark:border-gray-700 ${i % 2 === 1 ? "bg-gray-50/80 dark:bg-gray-800/40" : ""}`}
                    >
                      <td className="p-3 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                      <td className="whitespace-nowrap p-3 text-gray-600 dark:text-gray-400">
                        {formatFrenchDateTime(s.createdAt)}
                      </td>
                      <td className="p-3">{s.sender?.name ?? "—"}</td>
                      <td className="p-3">{s.receiver?.name ?? "—"}</td>
                      <td className="p-3">
                        {`${s.originAgencyId ?? "—"} → ${s.destinationAgencyId ?? "—"}`}
                      </td>
                      <td className="p-3">{s.currentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

    </div>
  );
}
