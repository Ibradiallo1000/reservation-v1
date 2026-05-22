import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { Activity, Building2, Package, Ticket, Wallet } from "lucide-react";
import { db } from "@/firebaseConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  formatDateTime,
  normalizeCompanyRecord,
  normalizeReservationActivity,
  normalizeShipmentActivity,
  type AdminActivityRecord,
  type AdminCompanyRecord,
} from "./adminBusinessUtils";

type CompanyActivitySummary = {
  companyId: string;
  companyName: string;
  reservations: number;
  shipments: number;
  operations: number;
  gmv: number;
};

type MetricCardProps = {
  title: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

function MetricCard({ title, value, hint, icon: Icon }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-500">{title}</div>
            <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</div>
            <div className="mt-2 text-sm text-slate-500">{hint}</div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminRevenueDashboard() {
  const isOnline = useOnlineStatus();
  const [companies, setCompanies] = useState<AdminCompanyRecord[]>([]);
  const [reservations, setReservations] = useState<AdminActivityRecord[]>([]);
  const [shipments, setShipments] = useState<AdminActivityRecord[]>([]);
  const [companiesReady, setCompaniesReady] = useState(false);
  const [reservationsReady, setReservationsReady] = useState(false);
  const [shipmentsReady, setShipmentsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offCompanies = onSnapshot(
      query(collection(db, "companies"), orderBy("nom", "asc")),
      (snap) => {
        setCompanies(snap.docs.map((companyDoc) => normalizeCompanyRecord(companyDoc.id, companyDoc.data())));
        setCompaniesReady(true);
      },
      (snapshotError) => {
        console.error("[AdminRevenueDashboard] companies snapshot failed", snapshotError);
        setCompanies([]);
        setCompaniesReady(true);
        setError("Impossible de charger les compagnies.");
      }
    );

    const offReservations = onSnapshot(
      collectionGroup(db, "reservations"),
      (snap) => {
        setReservations(
          snap.docs
            .map((docSnap) => normalizeReservationActivity(docSnap))
            .filter((row): row is AdminActivityRecord => row != null)
        );
        setReservationsReady(true);
      },
      (snapshotError) => {
        console.error("[AdminRevenueDashboard] reservations snapshot failed", snapshotError);
        setReservations([]);
        setReservationsReady(true);
        setError("Impossible de charger les reservations.");
      }
    );

    const offShipments = onSnapshot(
      collectionGroup(db, "shipments"),
      (snap) => {
        setShipments(
          snap.docs
            .map((docSnap) => normalizeShipmentActivity(docSnap))
            .filter((row): row is AdminActivityRecord => row != null)
        );
        setShipmentsReady(true);
      },
      (snapshotError) => {
        console.error("[AdminRevenueDashboard] shipments snapshot failed", snapshotError);
        setShipments([]);
        setShipmentsReady(true);
        setError("Impossible de charger les colis.");
      }
    );

    return () => {
      offCompanies();
      offReservations();
      offShipments();
    };
  }, []);

  const loading = !companiesReady || !reservationsReady || !shipmentsReady;

  const activity = useMemo(() => {
    const companyNames = new Map(companies.map((company) => [company.id, company.name]));
    const operations = [...reservations, ...shipments].sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    );

    const activityByCompany = new Map<string, CompanyActivitySummary>();
    operations.forEach((row) => {
      const existing = activityByCompany.get(row.companyId) ?? {
        companyId: row.companyId,
        companyName: companyNames.get(row.companyId) ?? row.companyId,
        reservations: 0,
        shipments: 0,
        operations: 0,
        gmv: 0,
      };

      if (row.kind === "reservation") {
        existing.reservations += 1;
      } else {
        existing.shipments += 1;
      }

      existing.operations += 1;
      existing.gmv += row.amount;
      activityByCompany.set(row.companyId, existing);
    });

    const topCompanies = [...activityByCompany.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 8);
    const recentOperations = operations.slice(0, 12);
    const today = new Date();
    const todayKey = today.toDateString();
    const todayOperations = operations.filter(
      (row) => row.createdAt && row.createdAt.toDateString() === todayKey
    );

    return {
      totalReservations: reservations.length,
      totalShipments: shipments.length,
      totalOperations: operations.length,
      totalGmv: operations.reduce((sum, row) => sum + row.amount, 0),
      todayOperations: todayOperations.length,
      todayGmv: todayOperations.reduce((sum, row) => sum + row.amount, 0),
      topCompanies,
      recentOperations,
      companyNames,
    };
  }, [companies, reservations, shipments]);

  if (loading) {
    return <PageLoadingState blocks={3} />;
  }

  return (
    <div className="space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: l'activite temps reel peut etre partielle." />
      )}
      {error && <PageErrorState message={error} onRetry={() => window.location.reload()} />}

      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950">Activite plateforme</h1>
        <p className="mt-1 text-sm text-slate-500">
          Vue globale des billets confirmes et des colis payes sur l'ensemble des compagnies.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="GMV"
          value={formatCurrency(activity.totalGmv)}
          hint={`${formatCurrency(activity.todayGmv)} aujourd'hui`}
          icon={Wallet}
        />
        <MetricCard
          title="Operations"
          value={activity.totalOperations.toLocaleString("fr-FR")}
          hint={`${activity.todayOperations.toLocaleString("fr-FR")} operations aujourd'hui`}
          icon={Activity}
        />
        <MetricCard
          title="Billets confirmes"
          value={activity.totalReservations.toLocaleString("fr-FR")}
          hint="Reservations guichet + en ligne confirmees"
          icon={Ticket}
        />
        <MetricCard
          title="Colis payes"
          value={activity.totalShipments.toLocaleString("fr-FR")}
          hint="Shipments avec paiement origine ou destination"
          icon={Package}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Compagnies les plus actives</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.topCompanies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Aucune activite disponible.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-3 pr-4 font-semibold">Compagnie</th>
                      <th className="pb-3 pr-4 font-semibold">Billets</th>
                      <th className="pb-3 pr-4 font-semibold">Colis</th>
                      <th className="pb-3 pr-4 font-semibold">Operations</th>
                      <th className="pb-3 font-semibold">GMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.topCompanies.map((row) => (
                      <tr key={row.companyId} className="border-b border-slate-100 last:border-0">
                        <td className="py-4 pr-4 font-medium text-slate-950">{row.companyName}</td>
                        <td className="py-4 pr-4 text-slate-700">
                          {row.reservations.toLocaleString("fr-FR")}
                        </td>
                        <td className="py-4 pr-4 text-slate-700">
                          {row.shipments.toLocaleString("fr-FR")}
                        </td>
                        <td className="py-4 pr-4 text-slate-700">
                          {row.operations.toLocaleString("fr-FR")}
                        </td>
                        <td className="py-4 font-semibold text-emerald-700">
                          {formatCurrency(row.gmv)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dernieres operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activity.recentOperations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Aucune operation recente.
              </div>
            ) : (
              activity.recentOperations.map((row) => (
                <div
                  key={`${row.kind}-${row.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.kind === "reservation"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {row.label}
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-950">
                        {activity.companyNames.get(row.companyId) ?? row.companyId}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatDateTime(row.createdAt)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-700">
                    {formatCurrency(row.amount)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lecture metier</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Source billets</div>
            <div className="mt-2 font-semibold text-slate-950">companies/*/agences/*/reservations</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Source colis</div>
            <div className="mt-2 font-semibold text-slate-950">companies/*/logistics/data/shipments</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Perimetre GMV</div>
            <div className="mt-2 font-semibold text-slate-950">
              Billets confirmes + colis payes
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
