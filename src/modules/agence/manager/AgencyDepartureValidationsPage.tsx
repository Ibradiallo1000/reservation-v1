import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState, PageHeader, SectionCard } from "@/ui";
import {
  boardingStatsKey,
  type BoardingStatsDoc,
} from "@/modules/agence/aggregates/types";
import { markOriginDeparture } from "@/modules/compagnie/tripInstances/tripProgressService";
import type {
  TripInstanceDocWithId,
  TripInstanceStatutMetier,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";

type ValidationRow = {
  tripInstanceId: string;
  agencyId: string;
  date: string;
  heure: string;
  departure: string;
  arrival: string;
  vehiclePlate: string;
  driverName: string;
  convoyeurName: string;
  reservationsCount: number;
  totalSeats: number;
  embarkedSeats: number;
  absentSeats: number;
  statutMetier: TripInstanceStatutMetier;
};

type PrintPassengerRow = {
  id: string;
  nomClient?: string;
  telephone?: string;
  referenceCode?: string;
  seatsGo?: number;
  boardingStatus?: string;
  statutEmbarquement?: string;
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBoardingLabel(row: Pick<PrintPassengerRow, "boardingStatus" | "statutEmbarquement">): string {
  const b = String(row.boardingStatus ?? "").toLowerCase();
  if (b === "boarded") return "embarqué";
  if (b === "no_show") return "absent";
  const s = String(row.statutEmbarquement ?? "").toLowerCase();
  if (s === "embarqué" || s === "embarque") return "embarqué";
  if (s === "absent") return "absent";
  return "en attente";
}

function openPrintHtml(html: string, title: string): void {
  const win = window.open("", "_blank", "noopener,noreferrer,width=980,height=900");
  if (!win) throw new Error("Impossible d'ouvrir la fenêtre d'impression.");
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  win.focus();
  win.print();
}

const AgencyDepartureValidationsPage: React.FC = () => {
  const { user, company } = useAuth() as any;
  const companyId = user?.companyId ?? null;
  const agencyId = user?.agencyId ?? null;
  const uid = user?.uid ?? null;
  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const isChefAgence = rolesArr.includes("chefAgence") || rolesArr.includes("chefagence");

  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  const companyName = String(company?.nom ?? "Compagnie");
  const companyLogo = String(company?.logoUrl ?? "");
  const agencyName = String(user?.agencyNom ?? user?.agencyName ?? agencyId ?? "");

  const loadStats = useCallback(
    async (ti: TripInstanceDocWithId): Promise<ValidationRow> => {
      const dep = String((ti as any).departure ?? (ti as any).departureCity ?? (ti as any).routeDeparture ?? "").trim();
      const arr = String((ti as any).arrival ?? (ti as any).arrivalCity ?? (ti as any).routeArrival ?? "").trim();
      const heure = String((ti as any).time ?? (ti as any).departureTime ?? "").trim();
      const date = String((ti as any).date ?? "").trim();
      const vehicleId = String((ti as any).vehicleId ?? "").trim();
      const weeklyTripId = String((ti as any).weeklyTripId ?? "").trim();

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
      if (agencyId && weeklyTripId && date && heure) {
        const assignmentId = `${weeklyTripId}_${date}_${heure}`;
        try {
          const aSnap = await getDoc(doc(db, `companies/${companyId}/agences/${agencyId}/tripAssignments/${assignmentId}`));
          if (aSnap.exists()) {
            const a = aSnap.data() as any;
            driverName = String(a.driverName ?? "").trim() || "—";
            convoyeurName = String(a.convoyeurName ?? "").trim() || "—";
          }
        } catch {
          /* noop */
        }
      }

      let embarkedSeats = 0;
      let absentSeats = 0;
      let totalSeats = 0;
      let reservationsCount = 0;
      if (agencyId && dep && arr && heure && date) {
        try {
          const key = boardingStatsKey(dep, arr, heure, date);
          const bsSnap = await getDoc(doc(db, `companies/${companyId}/agences/${agencyId}/boardingStats/${key}`));
          if (bsSnap.exists()) {
            const bs = bsSnap.data() as BoardingStatsDoc & {
              expectedSeats?: number;
              expectedCount?: number;
              totalSeats?: number;
              totalReservations?: number;
              reservationsCount?: number;
            };
            embarkedSeats = Number(bs.embarkedSeats ?? 0);
            absentSeats = Number(bs.absentSeats ?? 0);
            totalSeats = Number(
              bs.totalSeats ??
                bs.expectedSeats ??
                bs.expectedCount ??
                Math.max(0, embarkedSeats + absentSeats)
            );
            reservationsCount = Number(
              bs.reservationsCount ??
                bs.totalReservations ??
                bs.expectedCount ??
                0
            );
          }
        } catch {
          /* noop */
        }
      }

      return {
        tripInstanceId: ti.id,
        agencyId: String((ti as any).agencyId ?? agencyId ?? ""),
        date,
        heure,
        departure: dep,
        arrival: arr,
        vehiclePlate,
        driverName,
        convoyeurName,
        reservationsCount: Math.max(0, reservationsCount),
        totalSeats: Math.max(0, totalSeats),
        embarkedSeats: Math.max(0, embarkedSeats),
        absentSeats: Math.max(0, absentSeats),
        statutMetier: "validation_agence_requise",
      };
    },
    [agencyId, companyId]
  );

  useEffect(() => {
    if (!companyId || !agencyId || !isChefAgence) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, `companies/${companyId}/tripInstances`),
      where("agencyId", "==", agencyId),
      where("statutMetier", "==", "validation_agence_requise")
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TripInstanceDocWithId));
        const enriched = await Promise.all(list.map((ti) => loadStats(ti)));
        enriched.sort((a, b) => `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`));
        setRows(enriched);
        setLoading(false);
      },
      () => {
        setRows([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [agencyId, companyId, isChefAgence, loadStats]);

  const loadPassengerRows = useCallback(
    async (row: ValidationRow): Promise<PrintPassengerRow[]> => {
      const snap = await getDocs(
        query(
          collection(db, `companies/${companyId}/agences/${row.agencyId}/reservations`),
          where("tripInstanceId", "==", row.tripInstanceId)
        )
      );
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as PrintPassengerRow));
    },
    [companyId]
  );

  const handleValidateDeparture = useCallback(
    async (row: ValidationRow) => {
      if (!companyId || !uid) return;
      if (row.statutMetier !== "validation_agence_requise") {
        alert("Validation impossible: statut métier incorrect.");
        return;
      }
      setValidatingId(row.tripInstanceId);
      try {
        await markOriginDeparture(companyId, row.tripInstanceId, uid);
        alert("Départ validé. Le trajet est maintenant en transit.");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erreur de validation du départ.");
      } finally {
        setValidatingId(null);
      }
    },
    [companyId, uid]
  );

  const buildListPassengersPrintHtml = useCallback(
    (row: ValidationRow, passengers: PrintPassengerRow[]): string => {
      const printedAt = format(new Date(), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
      const bodyRows = passengers
        .map((p, i) => {
          const statut = normalizeBoardingLabel(p);
          return `<tr>
            <td>${i + 1}</td>
            <td>${esc(p.nomClient || "—")}</td>
            <td>${esc(p.telephone || "—")}</td>
            <td>${esc(p.referenceCode || p.id || "—")}</td>
            <td style="text-align:center">${esc(p.seatsGo ?? 1)}</td>
            <td style="text-align:center">${esc(statut)}</td>
          </tr>`;
        })
        .join("");
      return `<!doctype html><html><head><meta charset="utf-8" />
<title>Liste passagers - ${esc(row.tripInstanceId)}</title>
<style>
body{font-family:Arial,sans-serif;color:#000;padding:14px}
.h{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.logo{width:56px;height:56px;object-fit:contain;border:1px solid #000}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #000;padding:6px}
.meta{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 10px;margin:8px 0}
.f{margin-top:10px;border-top:1px solid #000;padding-top:8px;font-size:11px}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:12px}
.line{height:22mm;border-bottom:1px solid #000}
</style></head><body>
<div class="h">
  ${companyLogo ? `<img class="logo" src="${esc(companyLogo)}" />` : `<div class="logo"></div>`}
  <div>
    <div style="font-size:16px;font-weight:700">Liste passagers officielle</div>
    <div style="font-size:13px">${esc(companyName)}</div>
  </div>
</div>
<div class="meta">
  <b>Agence</b><span>${esc(agencyName)}</span>
  <b>Date/heure</b><span>${esc(`${row.date} ${row.heure}`)}</span>
  <b>Trajet</b><span>${esc(`${row.departure} → ${row.arrival}`)}</span>
  <b>Identifiant trajet</b><span>${esc(row.tripInstanceId)}</span>
</div>
<table><thead><tr><th>#</th><th>Nom</th><th>Téléphone</th><th>Référence</th><th>Places</th><th>Statut</th></tr></thead>
<tbody>${bodyRows || `<tr><td colspan="6" style="text-align:center">Aucun passager</td></tr>`}</tbody></table>
<div class="f">Totaux: R ${row.reservationsCount} / P ${row.totalSeats} / E ${row.embarkedSeats} / A ${row.absentSeats}</div>
<div class="sig">
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef embarquement</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chauffeur</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef agence</div></div>
</div>
<div style="margin-top:10px;font-size:10px;color:#444">Édition du ${esc(printedAt)}</div>
</body></html>`;
    },
    [agencyName, companyLogo, companyName]
  );

  const buildRoadOrderPrintHtml = useCallback(
    (row: ValidationRow): string => {
      const now = format(new Date(), "yyyy-MM-dd HH:mm");
      return `<!doctype html><html><head><meta charset="utf-8" />
<title>Bon de route - ${esc(row.tripInstanceId)}</title>
<style>
body{font-family:Arial,sans-serif;color:#000;padding:14px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #000;padding:7px;text-align:left}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
.line{height:22mm;border-bottom:1px solid #000}
</style></head><body>
<h2 style="margin:0 0 8px 0">Bon de route officiel</h2>
<table>
  <tr><th>Identifiant trajet</th><td>${esc(row.tripInstanceId)}</td></tr>
  <tr><th>Trajet</th><td>${esc(`${row.departure} → ${row.arrival}`)}</td></tr>
  <tr><th>Date / heure</th><td>${esc(`${row.date} ${row.heure}`)}</td></tr>
  <tr><th>Véhicule (immatriculation)</th><td>${esc(row.vehiclePlate)}</td></tr>
  <tr><th>Chauffeur</th><td>${esc(row.driverName)}</td></tr>
  <tr><th>Convoyeur</th><td>${esc(row.convoyeurName)}</td></tr>
  <tr><th>Heure départ validée</th><td>${esc(now)}</td></tr>
  <tr><th>Nombre passagers (embarqués)</th><td>${esc(row.embarkedSeats)}</td></tr>
</table>
<div class="sig">
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chauffeur</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef embarquement</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef agence</div></div>
</div>
</body></html>`;
    },
    []
  );

  const handlePrintPassengers = useCallback(
    async (row: ValidationRow) => {
      if (row.statutMetier !== "validation_agence_requise") {
        alert("Impression bloquée: statut métier incorrect.");
        return;
      }
      try {
        const passengers = await loadPassengerRows(row);
        openPrintHtml(
          buildListPassengersPrintHtml(row, passengers),
          `Liste passagers - ${row.tripInstanceId}`
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erreur d'impression.");
      }
    },
    [buildListPassengersPrintHtml, loadPassengerRows]
  );

  const handlePrintRoadOrder = useCallback((row: ValidationRow) => {
    if (row.statutMetier !== "validation_agence_requise") {
      alert("Impression bloquée: statut métier incorrect.");
      return;
    }
    openPrintHtml(buildRoadOrderPrintHtml(row), `Bon de route - ${row.tripInstanceId}`);
  }, [buildRoadOrderPrintHtml]);

  const title = useMemo(() => "Validation départs", []);

  if (!isChefAgence) {
    return (
      <div className="p-4 text-red-700 dark:text-red-300">
        Accès refusé: cette page est réservée au chef d'agence.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle="Validation administrative finale des départs (lecture seule passagers)"
      />
      {loading ? (
        <SectionCard title="Chargement">
          <p className="text-sm text-gray-600 dark:text-gray-300">Chargement des départs à valider…</p>
        </SectionCard>
      ) : rows.length === 0 ? (
        <SectionCard title="Validation départs">
          <EmptyState message="Aucun départ à valider" />
        </SectionCard>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <SectionCard key={row.tripInstanceId} title={`${row.departure} → ${row.arrival} • ${row.heure}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
                <div><span className="font-semibold">Véhicule:</span> {row.vehiclePlate}</div>
                <div><span className="font-semibold">Chauffeur:</span> {row.driverName}</div>
                <div><span className="font-semibold">Convoyeur:</span> {row.convoyeurName}</div>
                <div><span className="font-semibold">Statut métier:</span> {row.statutMetier}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs font-semibold">
                <span className="px-2 py-1 rounded bg-blue-600 text-white">R {row.reservationsCount}</span>
                <span className="px-2 py-1 rounded bg-indigo-600 text-white">P {row.totalSeats}</span>
                <span className="px-2 py-1 rounded bg-emerald-600 text-white">E {row.embarkedSeats}</span>
                <span className="px-2 py-1 rounded bg-red-600 text-white">A {row.absentSeats}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                  disabled={validatingId === row.tripInstanceId || row.statutMetier !== "validation_agence_requise"}
                  onClick={() => void handleValidateDeparture(row)}
                >
                  {validatingId === row.tripInstanceId ? "Validation..." : "Valider et autoriser départ"}
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
                  onClick={() => void handlePrintPassengers(row)}
                  disabled={row.statutMetier !== "validation_agence_requise"}
                >
                  Imprimer liste passagers
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
                  onClick={() => handlePrintRoadOrder(row)}
                  disabled={row.statutMetier !== "validation_agence_requise"}
                >
                  Imprimer bon de route
                </button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgencyDepartureValidationsPage;

