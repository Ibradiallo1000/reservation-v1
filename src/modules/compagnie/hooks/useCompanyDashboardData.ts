// =============================================
// src/hooks/useCompanyDashboardData.ts
// =============================================
import { useEffect, useMemo, useState } from "react";
import { db } from "@/firebaseConfig";
import {
  collection, query, where, onSnapshot, Timestamp, getDocs, doc, getDoc, limit, CollectionReference,
} from "firebase/firestore";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

/* ---------- Types exportés (identiques à ta version) ---------- */

export interface DashboardKpis {
  caPeriode: number;
  caPeriodeFormatted: string;
  caDeltaText: string;
  /** Variation du CA vs période précédente (%), null si pas de période précédente ou CA précédent = 0 */
  caDeltaPercent: number | null;
  reservationsCount: number;
  clientsUniques: number;
  agencesActives: number;
  totalAgences: number;
  villesCouvertes: number;
  tauxRemplissageText: string;
  parCanal: { name: string; value: number }[];
  parStatut: { name: string; value: number }[];
  partEnLigne: number;
  partGuichet: number;
}

export type DailyPoint = { date: string; reservations: number; revenue: number };
export type Series = { daily: DailyPoint[] };

// CORRECTION ICI : Rendre tauxRemplissage optionnel
export type AgencyPerf = {
  id: string;
  nom: string;
  ville?: string;
  reservations: number;
  revenus: number;
  tauxRemplissage?: boolean;
  /** Variation des revenus vs période précédente (%), undefined si pas de CA précédent */
  variation?: number;
};

export type TopTrajet = { trajet: string; reservations: number; revenus: number; tauxRemplissage?: string };
export type AlertItem = { level: "error" | "warning" | "info"; message: string };

export interface ReservationDoc {
  id: string;
  agencyId?: string; agenceId?: string;
  agencyNom?: string; agencyVille?: string;
  depart?: string; arrival?: string; departNormalized?: string; arrivee?: string;
  date?: string; heure?: string;
  canal?: string; statut?: string;
  montant?: number; seatsGo?: number;
  clientPhone?: string; clientId?: string;
  createdAt?: any;
}

/* ---------- Utils ---------- */
function normCity(s?: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ").trim();
}
function normStr(s?: string) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function isPaidStatus(s?: string) {
  const n = normStr(s);
  return n === "paye" || n === "paid" || n === "payed";
}
function getDateKey(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === "function") return v.toDate() as Date;
    if (typeof v === "string") { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
    return null;
  } catch { return null; }
}

/* ---------- Noms possibles de la sous-collection ---------- */
const RESERVATION_COLLECTION_CANDIDATES = ["reservations","reservation","bookings","reserves","resas"];

async function getReservationsCollectionRef(
  companyId: string,
  agencyId: string
): Promise<{ ref: CollectionReference | null; nameTried: string[] }> {
  const tried: string[] = [];
  for (const name of RESERVATION_COLLECTION_CANDIDATES) {
    tried.push(name);
    const ref = collection(db, `companies/${companyId}/agences/${agencyId}/${name}`);
    try {
      console.log("▶ Test chemin:", `companies/${companyId}/agences/${agencyId}/${name}`);
      await getDocs(query(ref));
      return { ref, nameTried: tried };
    } catch (e: any) {
      console.warn(`⚠️ Chemin refusé (${name}) →`, e?.message || e);
      continue;
    }
  }
  return { ref: null, nameTried: tried };
}

/* ---------- Hook principal ---------- */
export function useCompanyDashboardData({
  companyId, dateFrom, dateTo,
}: { companyId: string; dateFrom: Date; dateTo: Date }) {
  const money = useFormatCurrency();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; nom: string; ville?: string }[]>([]);
  const [reservations, setReservations] = useState<ReservationDoc[]>([]);
  const [previousPeriodReservations, setPreviousPeriodReservations] = useState<ReservationDoc[]>([]);

  // Meta compagnie
  useEffect(() => {
    if (!companyId) return;
    console.log("🏢 Dashboard companyId =", companyId);
    const ref = doc(db, `companies/${companyId}`);
    getDoc(ref).then(s => setCompany({ id: companyId, ...s.data() })).catch(err => {
      console.error("✖ get company meta:", err);
    });
  }, [companyId]);

  // Agences
  useEffect(() => {
    if (!companyId) return;
    const qAg = query(collection(db, `companies/${companyId}/agences`));
    console.log("📡 Listen agences:", `companies/${companyId}/agences`);
    const unsub = onSnapshot(qAg, (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data() as { nomAgence?: string; nom?: string; ville?: string };
        const nom = data.nomAgence ?? data.nom ?? "";
        return { id: d.id, nom, ville: data.ville };
      });
      setAgencies(list);
    }, (err) => console.error("✖ onSnapshot agences:", err));
    return () => unsub();
  }, [companyId]);

  // Réservations par agence
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);

    const startTs = Timestamp.fromDate(dateFrom);
    const endTs = Timestamp.fromDate(dateTo);

    let cancelled = false;
    const unsubs: (() => void)[] = [];

    (async () => {
      try {
        const agSnap = await getDocs(collection(db, `companies/${companyId}/agences`));
        const agencyIds = agSnap.docs.map(d => d.id);
        console.log("📄 Agences trouvées:", agencyIds.length, agencyIds);

        if (agencyIds.length === 0) {
          if (!cancelled) { setReservations([]); setLoading(false); }
          return;
        }

        const all: ReservationDoc[] = [];
        let attached = 0;

        for (const aid of agencyIds) {
          const { ref, nameTried } = await getReservationsCollectionRef(companyId, aid);
          if (!ref) {
            console.error("✖ Impossible d'ouvrir une sous-collection de réservations pour", aid, " (essayé:", nameTried.join(", "), ")");
            attached += 1;
            if (attached === agencyIds.length && !cancelled) { setReservations(all); setLoading(false); }
            continue;
          }

          const qRes = query(ref, where("createdAt", ">=", startTs), where("createdAt", "<=", endTs));
          console.log("📡 Listen réservations:", ref.path);

          const unsub = onSnapshot(qRes, (snap) => {
            const items = snap.docs.map(d => {
              const data = d.data() as any;
              return {
                id: d.id,
                agencyId: aid,
                agenceId: aid,
                agencyNom: data.agencyNom,
                agencyVille: data.agencyVille,
                depart: data.depart,
                arrival: data.arrival,
                departNormalized: data.departNormalized,
                arrivee: data.arrivee,
                date: data.date, heure: data.heure,
                canal: data.canal, statut: data.statut,
                montant: data.montant || 0, seatsGo: data.seatsGo || 1,
                clientPhone: data.clientPhone, clientId: data.clientId,
                createdAt: data.createdAt,
              } as ReservationDoc;
            });

            const filteredOut = all.filter(r => r.agencyId !== aid && r.agenceId !== aid);
            all.splice(0, all.length, ...filteredOut, ...items);

            const filtered = all.filter(r => {
              const dt = toDateSafe(r.createdAt) ?? (r.date ? new Date(`${r.date}T${r.heure || "00:00"}:00`) : null);
              return dt ? dt >= dateFrom && dt <= dateTo : false;
            });

            if (!cancelled) setReservations(filtered);
          }, (err) => {
            console.error(`✖ onSnapshot réservations (${ref.path}):`, err);
          });

          unsubs.push(unsub);
          attached += 1;
        }

      } catch (e) {
        console.error("✖ Dashboard attach error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach(u => u());
    };
  }, [companyId, dateFrom.getTime(), dateTo.getTime()]);

  // Période précédente (même durée) pour variation CA et par agence
  useEffect(() => {
    if (!companyId) return;
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevDateTo = new Date(dateFrom.getTime() - 86400000);
    const prevDateFrom = new Date(prevDateTo.getTime() - periodMs);
    const startTsPrev = Timestamp.fromDate(prevDateFrom);
    const endTsPrev = Timestamp.fromDate(prevDateTo);

    (async () => {
      try {
        const agSnap = await getDocs(collection(db, `companies/${companyId}/agences`));
        const agencyIds = agSnap.docs.map(d => d.id);
        const all: ReservationDoc[] = [];
        for (const aid of agencyIds) {
          const { ref } = await getReservationsCollectionRef(companyId, aid);
          if (!ref) continue;
          const q = query(ref, where("createdAt", ">=", startTsPrev), where("createdAt", "<=", endTsPrev), limit(500));
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            const data = d.data() as any;
            all.push({
              id: d.id,
              agencyId: aid,
              agenceId: aid,
              agencyNom: data.agencyNom,
              agencyVille: data.agencyVille,
              statut: data.statut,
              montant: data.montant || 0,
              seatsGo: data.seatsGo || 1,
              createdAt: data.createdAt,
              date: data.date,
              heure: data.heure,
            } as ReservationDoc);
          });
        }
        setPreviousPeriodReservations(all);
      } catch (e) {
        console.error("✖ Previous period reservations:", e);
        setPreviousPeriodReservations([]);
      }
    })();
  }, [companyId, dateFrom.getTime(), dateTo.getTime()]);

  /* ---------- Sélection paid-only ---------- */
  const paidReservations = useMemo(
    () => reservations.filter(r => isPaidStatus(r.statut)),
    [reservations]
  );

  const previousPaidReservations = useMemo(
    () => previousPeriodReservations.filter(r => isPaidStatus(r.statut)),
    [previousPeriodReservations]
  );

  const previousRevenueByAgency = useMemo(() => {
    const m = new Map<string, number>();
    previousPaidReservations.forEach(r => {
      const aId = (r.agencyId || r.agenceId) as string | undefined;
      if (!aId) return;
      m.set(aId, (m.get(aId) ?? 0) + (r.montant || 0));
    });
    return m;
  }, [previousPaidReservations]);

  /* ---------- Agrégations ---------- */
  const totalAgences = agencies.length;

  const perAgency = useMemo<AgencyPerf[]>(() => {
    const map = new Map<string, AgencyPerf>();

    agencies.forEach(a => map.set(a.id, {
      id: a.id,
      nom: a.nom,
      ville: a.ville,
      reservations: 0,
      revenus: 0,
    }));

    paidReservations.forEach(r => {
      const aId = (r.agencyId || r.agenceId) as string | undefined;
      if (!aId) return;

      const curr = map.get(aId) || {
        id: aId,
        nom: r.agencyNom || "Agence inconnue",
        ville: r.agencyVille,
        reservations: 0,
        revenus: 0,
      };

      curr.reservations += r.seatsGo || 1;
      curr.revenus += r.montant || 0;
      map.set(aId, curr);
    });

    return Array.from(map.values()).map(a => {
      const prevRev = previousRevenueByAgency.get(a.id) ?? 0;
      const variation =
        prevRev > 0
          ? Math.round((((a.revenus - prevRev) / prevRev) * 100) * 10) / 10
          : undefined;
      return { ...a, variation };
    }).sort((a, b) => b.revenus - a.revenus);
  }, [agencies, paidReservations, previousRevenueByAgency]);

  const clientsUniques = useMemo(() => {
    const s = new Set<string>();
    paidReservations.forEach(r => { 
      if (r.clientId) s.add("id:" + r.clientId); 
      else if (r.clientPhone) s.add("tel:" + r.clientPhone); 
    });
    return s.size;
  }, [paidReservations]);

  const villesCouvertes = useMemo(() => {
    const s = new Set<string>();
    paidReservations.forEach(r => { 
      const a = normCity(r.depart || r.departNormalized); 
      const b = normCity(r.arrival || r.arrivee); 
      if (a) s.add(a); 
      if (b) s.add(b); 
    });
    return s.size;
  }, [paidReservations]);

  const parCanal = useMemo(() => {
    const m = new Map<string, number>();
    paidReservations.forEach(r => {
      const canal = normStr(r.canal);
      const norm =
        canal.includes("ligne") || canal === "online" || canal === "web" ? "En ligne" :
        canal.includes("guichet") ? "Guichet" : "Autres";
      m.set(norm, (m.get(norm) || 0) + 1);
    });
    return Array.from(m).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
  }, [paidReservations]);

  const parStatut = useMemo(() => {
    const m = new Map<string, number>();
    reservations.forEach(r => { 
      const k = normStr(r.statut) || "—"; 
      m.set(k, (m.get(k) || 0) + 1); 
    });
    return Array.from(m).map(([name, value]) => ({ name, value }));
  }, [reservations]);

  const kpis = useMemo<DashboardKpis>(() => {
    const ca = paidReservations.reduce((s, r) => s + (r.montant || 0), 0);
    const previousCa = previousPaidReservations.reduce((s, r) => s + (r.montant || 0), 0);
    const caDeltaPercent =
      previousCa > 0
        ? Math.round(((ca - previousCa) / previousCa) * 1000) / 10
        : null;
    const caDeltaText = "vs période précédente";

    const reservationsCount = paidReservations.length;

    const clientsSet = new Set<string>();
    paidReservations.forEach((r) => {
      if (r.clientId) clientsSet.add(`id:${r.clientId}`);
      else if (r.clientPhone) clientsSet.add(`tel:${r.clientPhone}`);
    });
    const clientsUniques = clientsSet.size;

    const totalSeats = paidReservations.reduce((s, r) => s + (r.seatsGo || 1), 0);
    const capacity = 0;
    const tauxRemplissageText = capacity > 0 ? `${Math.round((totalSeats / capacity) * 100)}%` : "N/A";

    const actives = new Set<string>();
    paidReservations.forEach((r) => {
      const aId = (r.agencyId || r.agenceId) as string | undefined;
      if (aId) actives.add(aId);
    });

    const totalCanal = parCanal.reduce((s, x) => s + x.value, 0);
    const enLigneVal = parCanal.filter(x => x.name === "En ligne").reduce((s, x) => s + x.value, 0);
    const guichetVal = parCanal.filter(x => x.name === "Guichet").reduce((s, x) => s + x.value, 0);
    const partEnLigne = totalCanal ? Math.round((enLigneVal / totalCanal) * 100) : 0;
    const partGuichet = totalCanal ? Math.round((guichetVal / totalCanal) * 100) : 0;

    return {
      caPeriode: ca,
      caPeriodeFormatted: money(ca),
      caDeltaText,
      caDeltaPercent,
      reservationsCount,
      clientsUniques,
      agencesActives: actives.size,
      totalAgences,
      villesCouvertes,
      tauxRemplissageText,
      parCanal,
      parStatut,
      partEnLigne,
      partGuichet,
    };
  }, [paidReservations, previousPaidReservations, totalAgences, villesCouvertes, parCanal, parStatut]);

  const series = useMemo<Series>(() => {
    const m = new Map<string, { reservations: number; revenue: number }>();
    for (let d = new Date(dateFrom); d <= dateTo; d.setDate(d.getDate() + 1)) {
      m.set(getDateKey(d), { reservations: 0, revenue: 0 });
    }
    paidReservations.forEach(r => {
      const dt = toDateSafe(r.createdAt) ?? (r.date ? new Date(`${r.date}T${r.heure || "00:00"}:00`) : new Date());
      const key = getDateKey(dt);
      const curr = m.get(key) || { reservations: 0, revenue: 0 };
      curr.reservations += r.seatsGo || 1;
      curr.revenue += r.montant || 0;
      m.set(key, curr);
    });
    const daily = Array.from(m).map(([date, v]) => ({ date, reservations: v.reservations, revenue: v.revenue }));
    return { daily };
  }, [paidReservations, dateFrom.getTime(), dateTo.getTime()]);

  const topTrajets = useMemo<TopTrajet[]>(() => {
    const m = new Map<string, { reservations: number; revenus: number }>();
    paidReservations.forEach(r => {
      const a = normCity(r.depart || r.departNormalized); 
      const b = normCity(r.arrival || r.arrivee);
      if (!a || !b) return;
      const key = `${a} → ${b}`;
      const curr = m.get(key) || { reservations: 0, revenus: 0 };
      curr.reservations += r.seatsGo || 1; 
      curr.revenus += r.montant || 0;
      m.set(key, curr);
    });
    return Array.from(m).map(([trajet, v]) => ({ 
      trajet, 
      reservations: v.reservations, 
      revenus: v.revenus 
    }))
    .sort((a,b)=>b.reservations-a.reservations)
    .slice(0,12);
  }, [paidReservations]);

  const alerts: AlertItem[] = useMemo(() => {
    const arr: AlertItem[] = [];
    const enAttente = parStatut.find(s => s.name.includes("attente"))?.value || 0;
    if (enAttente > 50) arr.push({ level: "warning", message: `${enAttente} réservations en attente` });
    
    const preuves = parStatut.find(s => s.name.includes("preuve"))?.value || 0;
    if (preuves > 0) arr.push({ level: "info", message: `${preuves} preuve(s) reçue(s) à valider` });
    
    const zero = perAgency.filter(a => a.reservations === 0);
    if (zero.length > 0) arr.push({ level: "warning", message: `${zero.length} agence(s) sans vente` });
    
    return arr;
  }, [perAgency, parStatut]);

  function exportCSV(rows: ReservationDoc[]) {
    const header = ["id","agencyId","date","heure","depart","arrivee","montant","canal","statut","seatsGo","clientPhone"];
    const csv = [header.join(",")].concat(
      rows.map(r => [
        r.id, r.agencyId || r.agenceId || "", r.date || "", r.heure || "",
        r.depart || r.departNormalized || "", r.arrival || r.arrivee || "", String(r.montant || 0),
        r.canal || "", r.statut || "", String(r.seatsGo || 1), r.clientPhone || "",
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); 
    const a = document.createElement("a");
    a.href = url; 
    a.download = `reservations_${getDateKey(dateFrom)}_${getDateKey(dateTo)}.csv`; 
    a.click(); 
    URL.revokeObjectURL(url);
  }

  return { 
    loading, 
    company, 
    kpis, 
    series, 
    perAgency, 
    topTrajets, 
    alerts, 
    rawReservations: reservations, 
    exportCSV 
  } as const;
}