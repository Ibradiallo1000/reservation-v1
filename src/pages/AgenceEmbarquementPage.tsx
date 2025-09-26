// src/pages/AgenceEmbarquementPage.tsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
  limit as fsLimit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";

/* ===================== Types ===================== */
type StatutEmbarquement = "embarqué" | "absent" | "en_attente";

interface Reservation {
  id: string;
  nomClient?: string;
  telephone?: string;
  depart?: string;
  arrivee?: string;
  date?: any;     // string "YYYY-MM-DD" ou Firestore Timestamp
  heure?: string; // "HH:mm" ou "H:mm"
  canal?: string; // "guichet" | "en_ligne" | ...
  montant?: number;
  statut?: string; // "payé" | "validé" | ...
  statutEmbarquement?: StatutEmbarquement;
  checkInTime?: any;
  trajetId?: string;
  referenceCode?: string;
  controleurId?: string;
  arrival?: string; // alias possible
}

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  horaires: { [jour: string]: string[] };
  active: boolean;
}

type SelectedTrip = {
  id?: string;
  departure: string;
  arrival: string;
  heure: string;
};

type AgencyItem = { id: string; nom: string };

/* ===================== Utils ===================== */
function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const weekdayFR = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

function extractCode(raw: string): string {
  const t = (raw || "").trim();
  try {
    const u = new URL(t);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase() === "r");
    if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
    return decodeURIComponent(parts[parts.length - 1] || t);
  } catch {
    return t;
  }
}
function getScanText(res: any): string {
  if (!res) return "";
  if (typeof res === "string") return res;
  if (typeof (res as any).getText === "function") return (res as any).getText();
  if (typeof (res as any).text === "string") return (res as any).text;
  return String(res);
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normCity(v?: string): string {
  return stripAccents(v || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function normTime(v?: string): string | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return m[1].padStart(2, "0") + ":" + m[2];
}
function normDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }
  if (typeof v === "object" && "seconds" in v) {
    const d = new Date((v as any).seconds * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

// Lookup robuste par agence(s)
async function findReservationByCode(
  companyId: string,
  agencyId: string | null | undefined,
  code: string
): Promise<{ resId: string; agencyId: string } | null> {
  if (agencyId) {
    const directRef = doc(db, `companies/${companyId}/agences/${agencyId}/reservations`, code);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) return { resId: directSnap.id, agencyId };

    const q1 = query(
      collection(db, `companies/${companyId}/agences/${agencyId}/reservations`),
      where("referenceCode", "==", code),
      fsLimit(1)
    );
    const s1 = await getDocs(q1);
    if (!s1.empty) return { resId: s1.docs[0].id, agencyId };
    return null;
  }

  const ags = await getDocs(collection(db, `companies/${companyId}/agences`));

  for (const ag of ags.docs) {
    const dref = doc(db, `companies/${companyId}/agences/${ag.id}/reservations`, code);
    const ds = await getDoc(dref);
    if (ds.exists()) return { resId: ds.id, agencyId: ag.id };
  }
  for (const ag of ags.docs) {
    const q2 = query(
      collection(db, `companies/${companyId}/agences/${ag.id}/reservations`),
      where("referenceCode", "==", code),
      fsLimit(1)
    );
    const s2 = await getDocs(q2);
    if (!s2.empty) return { resId: s2.docs[0].id, agencyId: ag.id };
  }
  return null;
}

/* ===================== Page ===================== */
const AgenceEmbarquementPage: React.FC = () => {
  const { user, company } = useAuth() as any;
  const location = useLocation() as {
    state?: { trajet?: string; date?: string; heure?: string };
  };

  const theme = {
    primary: (company as any)?.couleurPrimaire || "#0ea5e9",
    secondary: (company as any)?.couleurSecondaire || "#f59e0b",
    bg: "#f7f8fa",
  };

  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;
  const uid = user?.uid ?? null;

  const [agencies, setAgencies] = useState<AgencyItem[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(userAgencyId);

  const [selectedDate, setSelectedDate] = useState<string>(
    location.state?.date || toLocalISO(new Date())
  );

  const [trajetsDuJour, setTrajetsDuJour] = useState<WeeklyTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<SelectedTrip | null>(null);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Scan caméra
  const [scanOn, setScanOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastAlertRef = useRef<number>(0);

  // Affectation (optionnelle)
  const [assign, setAssign] = useState<{bus?: string; immat?: string; chauffeur?: string; chef?: string}>({});

  /* ---------- Charger les agences ---------- */
  useEffect(() => {
    (async () => {
      if (!companyId) return;
      if (userAgencyId) {
        if (!agencies.length) {
          const snap = await getDocs(collection(db, `companies/${companyId}/agences`));
          const list = snap.docs.map(d => ({ id: d.id, nom: (d.data() as any)?.nom || (d.data() as any)?.name || d.id }));
          setAgencies(list);
        }
        return;
      }
      const snap = await getDocs(collection(db, `companies/${companyId}/agences`));
      const list = snap.docs.map(d => ({ id: d.id, nom: (d.data() as any)?.nom || (d.data() as any)?.name || d.id }));
      setAgencies(list);
      if (list.length === 1) setSelectedAgencyId(list[0].id);
    })();
  }, [companyId, userAgencyId, agencies.length]);

  /* ---------- Affectation liée au trajet ---------- */
  useEffect(()=>{
    setAssign({});
    if (!companyId || !selectedAgencyId || !selectedTrip || !selectedDate) return;

    const key = `${(selectedTrip.departure||'').trim()}_${(selectedTrip.arrival||'').trim()}_${(selectedTrip.heure||'').trim()}_${selectedDate}`.replace(/\s+/g,'-');
    const ref = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/affectations/${key}`);
    getDoc(ref).then(s=>{
      if (s.exists()) {
        const d = s.data() as any;
        setAssign({
          bus: d?.busNumber || d?.bus || "",
          immat: d?.immatriculation || d?.immat || "",
          chauffeur: d?.chauffeur || "",
          chef: d?.chefEmbarquement || d?.chef || "",
        });
      }
    }).catch(()=>{});
  }, [companyId, selectedAgencyId, selectedTrip, selectedDate]);

  /* ---------- Pré-remplissage navigation ---------- */
  useEffect(() => {
    const st = location.state;
    if (!st?.trajet || !st?.heure) return;
    const [dep, arr] = st.trajet.split("→").map((s) => s.trim());
    setSelectedTrip({
      departure: dep || "",
      arrival: arr || "",
      heure: st.heure,
    });
    if (st.date) setSelectedDate(st.date);
  }, [location.state]);

  /* ---------- WeeklyTrips du jour ---------- */
  useEffect(() => {
    const load = async () => {
      if (!companyId || !selectedAgencyId) { setTrajetsDuJour([]); return; }

      const weeklyTripsRef = collection(
        db,
        `companies/${companyId}/agences/${selectedAgencyId}/weeklyTrips`
      );
      const snap = await getDocs(weeklyTripsRef);

      const dayName = weekdayFR(new Date(selectedDate));
      const trips = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as WeeklyTrip)
        .filter((t) => t.active && t.horaires?.[dayName]?.length > 0);

      setTrajetsDuJour(trips);

      if (selectedTrip && !selectedTrip.id) {
        const found = trips.find(
          (t) =>
            t.departure === selectedTrip.departure &&
            t.arrival === selectedTrip.arrival &&
            (t.horaires[dayName] || []).includes(selectedTrip.heure)
        );
        if (found) {
          setSelectedTrip((prev) => (prev ? { ...prev, id: found.id } : prev));
        }
      }
    };
    void load();
  }, [companyId, selectedAgencyId, selectedDate]); // eslint-disable-line

  /* ---------- Écoute temps réel réservations ---------- */
  useEffect(() => {
    if (!companyId || !selectedAgencyId) { setReservations([]); return; }
    if (!selectedTrip || !selectedTrip.departure || !selectedTrip.arrival || !selectedTrip.heure) {
      setReservations([]); return;
    }

    setIsLoading(true);
    setReservations([]);

    const base = collection(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations`);
    const unsubs: Array<() => void> = [];
    const bag = new Map<string, Reservation>();

    const commit = () => {
      const list = Array.from(bag.values()).sort((a, b) =>
        (a.nomClient || "").localeCompare(b.nomClient || "")
      );
      setReservations(list);
      setIsLoading(false);
    };

    const qPaid = query(
      base,
      where("date", "==", selectedDate),
      where("depart", "==", selectedTrip.departure),
      where("arrivee", "==", selectedTrip.arrival),
      where("heure", "==", selectedTrip.heure),
      where("statut", "==", "payé")
    );
    unsubs.push(onSnapshot(qPaid, (snap) => {
      snap.docs.forEach((d) => bag.set(d.id, { id: d.id, ...(d.data() as any) }));
      commit();
    }, () => setIsLoading(false)));

    const qValid = query(
      base,
      where("date", "==", selectedDate),
      where("depart", "==", selectedTrip.departure),
      where("arrivee", "==", selectedTrip.arrival),
      where("heure", "==", selectedTrip.heure),
      where("statut", "==", "validé")
    );
    unsubs.push(onSnapshot(qValid, (snap) => {
      snap.docs.forEach((d) => bag.set(d.id, { id: d.id, ...(d.data() as any) }));
      commit();
    }, () => setIsLoading(false)));

    if (selectedTrip.id) {
      const qById = query(
        base,
        where("date", "==", selectedDate),
        where("trajetId", "==", selectedTrip.id),
        where("heure", "==", selectedTrip.heure),
        where("statut", "in", ["payé", "validé"] as any)
      );
      unsubs.push(onSnapshot(qById, (snap) => {
        snap.docs.forEach((d) => bag.set(d.id, { id: d.id, ...(d.data() as any) }));
        commit();
      }, () => setIsLoading(false)));
    }

    return () => unsubs.forEach((u) => u());
  }, [companyId, selectedAgencyId, selectedTrip, selectedDate]);

  /* ---------- Mise à jour Embarqué / Absent ---------- */
  const updateStatut = useCallback(
    async (reservationId: string, statut: StatutEmbarquement) => {
      if (!companyId || !uid) return;
      if (!selectedTrip || !selectedDate) {
        alert("Sélectionne d'abord la date et le trajet avant d’embarquer.");
        return;
      }
      if (!selectedAgencyId) {
        alert("Sélectionne d’abord une agence.");
        return;
      }

      const ref = doc(
        db,
        `companies/${companyId}/agences/${selectedAgencyId}/reservations`,
        reservationId
      );

      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error("Réservation introuvable");
          const data = snap.data() as Reservation;

          const base = (data.statut || "").toLowerCase();
          if (!["payé", "validé", "valide", "embarqué"].includes(base)) {
            throw new Error("Statut non éligible (doit être payé/validé).");
          }

          const dataDep = normCity(data.depart);
          const dataArr = normCity(data.arrivee || data.arrival);
          const dataHr  = normTime(data.heure || "");
          const dataDt  = normDate(data.date);

          const selDep  = normCity(selectedTrip.departure);
          const selArr  = normCity(selectedTrip.arrival);
          const selHr   = normTime(selectedTrip.heure);
          const selDt   = normDate(selectedDate);

          const idMatch = !!(data.trajetId && selectedTrip?.id && data.trajetId === selectedTrip.id);
          const fieldsMatch = (dataDep === selDep) && (dataArr === selArr) && (dataHr === selHr) && (dataDt === selDt);
          const softMatch = (dataDep === selDep) && (dataArr === selArr) && (dataDt === selDt);

          if (!(idMatch || fieldsMatch || softMatch)) {
            throw new Error("Billet pour un autre départ (date/heure/trajet non concordants).");
          }

          if (data.statutEmbarquement === "embarqué" && statut === "embarqué") return;

          const patch: any = {
            statutEmbarquement: statut,
            controleurId: uid,
            checkInTime: statut === "embarqué" ? serverTimestamp() : null,
          };
          if (statut === "embarqué") patch.statut = "embarqué";

          tx.update(ref, patch);

          const logsRef = collection(
            db,
            `companies/${companyId}/agences/${selectedAgencyId}/boardingLogs`
          );
          const logRef = doc(logsRef);
          tx.set(logRef, {
            reservationId,
            trajetId: selectedTrip?.id || data.trajetId || null,
            departure: selectedTrip?.departure,
            arrival: selectedTrip?.arrival,
            date: selectedDate,
            heure: selectedTrip?.heure,
            result: statut.toUpperCase(),
            controleurId: uid,
            scannedAt: serverTimestamp(),
          });
        });
      } catch (e: any) {
        alert(e?.message || "Erreur lors de la mise à jour.");
        console.error(e);
      }
    },
    [companyId, selectedAgencyId, uid, selectedTrip?.id, selectedTrip?.departure, selectedTrip?.arrival, selectedTrip?.heure, selectedDate]
  );

  /* ---------- Utilitaire : prochain départ ---------- */
  async function computeNextDeparture(
    dbRef: typeof db,
    companyId: string,
    agencyId: string,
    baseTrip: { id?: string; departure: string; arrival: string; heure: string; },
    baseDate: string
  ): Promise<{ date: string; heure: string }> {
    let target: any | null = null;
    if (baseTrip.id) {
      const s = await getDoc(doc(dbRef, `companies/${companyId}/agences/${agencyId}/weeklyTrips/${baseTrip.id}`));
      if (s.exists()) target = { id: s.id, ...(s.data() as any) };
    }
    if (!target) {
      const wref = collection(dbRef, `companies/${companyId}/agences/${agencyId}/weeklyTrips`);
      const wsnap = await getDocs(wref);
      target = wsnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
        .find(t => t.active && t.departure === baseTrip.departure && t.arrival === baseTrip.arrival) || null;
    }
    if (!target) throw new Error("Trajet hebdo introuvable.");

    const start = new Date(`${baseDate}T${baseTrip.heure || "00:00"}:00`);
    for (let add = 0; add < 14; add++) {
      const d = new Date(start);
      d.setDate(d.getDate() + add);
      const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
      const hours: string[] = (target.horaires?.[dayName] || []).slice().sort();

      if (!hours.length) continue;
      if (add === 0) {
        const after = hours.filter(h => h > baseTrip.heure);
        if (after.length) return { date: baseDate, heure: after[0] };
      } else {
        const iso = d.toISOString().slice(0, 10);
        return { date: iso, heure: hours[0] };
      }
    }
    throw new Error("Aucun prochain départ disponible.");
  }

  /* ---------- Absent + Reprogrammer ---------- */
  const absentEtReprogrammer = useCallback(async (reservationId: string) => {
    if (!companyId || !selectedAgencyId || !uid || !selectedTrip || !selectedDate) {
      alert("Contexte incomplet (agence, trajet ou date manquants).");
      return;
    }

    const resRef = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations/${reservationId}`);
    const resSnap = await getDoc(resRef);
    if (!resSnap.exists()) return alert("Réservation introuvable.");
    const data = resSnap.data() as Reservation & Record<string, any>;

    if (data.noShowAt || data.reprogrammedOnce === true) {
      alert("Déjà reprogrammé ou marqué absent.");
      return;
    }

    try {
      const next = await computeNextDeparture(
        db, companyId, selectedAgencyId,
        {
          id: data.trajetId || selectedTrip.id,
          departure: (data.depart || selectedTrip.departure)!,
          arrival: (data.arrivee || data.arrival || selectedTrip.arrival)!,
          heure: (data.heure || selectedTrip.heure)!,
        },
        (normDate(data.date) || selectedDate)!
      );

      const batch = writeBatch(db);

      batch.update(resRef, {
        statutEmbarquement: "absent",
        noShowAt: serverTimestamp(),
        noShowBy: uid,
        reprogrammedOnce: true,
      });

      const newRef = doc(collection(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations`));
      batch.set(newRef, {
        companyId, agencyId: selectedAgencyId,
        depart: data.depart, arrivee: data.arrivee || data.arrival, trajetId: data.trajetId || selectedTrip.id || null,
        date: next.date, heure: next.heure,
        nomClient: data.nomClient, telephone: data.telephone,
        seatsGo: (data as any).seatsGo || 1,
        canal: "report",
        statut: "validé",
        statutEmbarquement: "en_attente",
        sourceReservationId: reservationId,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });

      const logRef = doc(collection(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingLogs`));
      batch.set(logRef, {
        reservationId,
        trajetId: data.trajetId || selectedTrip.id || null,
        departure: data.depart, arrival: data.arrivee || data.arrival,
        date: selectedDate, heure: selectedTrip.heure,
        result: "ABSENT_REPROG",
        nextDate: next.date, nextHeure: next.heure,
        controleurId: uid,
        scannedAt: serverTimestamp(),
      });

      await batch.commit();
      alert(`Reprogrammé au ${next.date} • ${next.heure}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Échec de la reprogrammation.");
    }
  }, [companyId, selectedAgencyId, uid, selectedTrip, selectedDate]);

  /* ---------- Saisie manuelle (ID / référence) ---------- */
  const [scanCode, setScanCode] = useState("");
  const submitManual = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!companyId) return;

      const code = extractCode(scanCode);
      if (!code) return;

      try {
        const found = await findReservationByCode(companyId, selectedAgencyId, code);
        if (found) {
          await updateStatut(found.resId, "embarqué");
          setScanCode("");
        } else {
          alert("Réservation introuvable.");
        }
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la validation manuelle.");
      }
    },
    [scanCode, companyId, selectedAgencyId, updateStatut]
  );

  /* ---------- Scanner caméra (sans .hints) ---------- */
  useEffect(() => {
    if (!scanOn) {
      readerRef.current?.reset?.();
      readerRef.current = null;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    (async () => {
      try {
        // Caméra arrière par défaut
        // @ts-ignore
        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current as HTMLVideoElement,
          async (res: any) => {
            const now = Date.now();
            if (!res || now - lastScanRef.current < 1200) return;
            lastScanRef.current = now;

            const raw = getScanText(res);
            const code = extractCode(raw);
            try {
              const found = await findReservationByCode(companyId!, selectedAgencyId, code);
              if (found) {
                await updateStatut(found.resId, "embarqué");
                new Audio("/beep.mp3").play().catch(() => {});
              } else {
                if (now - lastAlertRef.current > 2000) {
                  lastAlertRef.current = now;
                  alert("Billet introuvable.");
                }
              }
            } catch (e) {
              console.error(e);
              if (now - lastAlertRef.current > 2000) {
                lastAlertRef.current = now;
                alert("Erreur lors du scan");
              }
            }
          }
        );
      } catch {
        // Fallback: premier device
        const devices = (await BrowserMultiFormatReader.listVideoInputDevices()) as unknown as Array<{ deviceId?: string }>;
        const preferred: string | null = devices?.[0]?.deviceId ?? null;
        await reader.decodeFromVideoDevice(
          (preferred as unknown) as string | null,
          videoRef.current as HTMLVideoElement,
          async (res: any) => {
            const now = Date.now();
            if (!res || now - lastScanRef.current < 1200) return;
            lastScanRef.current = now;

            const raw = getScanText(res);
            const code = extractCode(raw);
            try {
              const found = await findReservationByCode(companyId!, selectedAgencyId, code);
              if (found) {
                await updateStatut(found.resId, "embarqué");
                new Audio("/beep.mp3").play().catch(() => {});
              } else {
                if (now - lastAlertRef.current > 2000) {
                  lastAlertRef.current = now;
                  alert("Billet introuvable.");
                }
              }
            } catch (e) {
              console.error(e);
              if (now - lastAlertRef.current > 2000) {
                lastAlertRef.current = now;
                alert("Erreur lors du scan");
              }
            }
          }
        );
      }
    })();

    return () => {
      readerRef.current?.reset?.();
      readerRef.current = null;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [scanOn, companyId, selectedAgencyId, updateStatut]);

  /* ---------- Filtre recherche ---------- */
  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase().trim();
    if (!t) return reservations;
    return reservations.filter(
      (r) =>
        (r.nomClient || "").toLowerCase().includes(t) ||
        (r.telephone || "").includes(searchTerm)
    );
  }, [reservations, searchTerm]);

  /* ---------- Totaux ---------- */
  const totals = useMemo(() => {
    let embarques = 0, absents = 0, total = 0;
    for (const r of reservations) {
      total += 1;
      if (r.statutEmbarquement === "embarqué") embarques++;
      else if (r.statutEmbarquement === "absent") absents++;
    }
    return { total, embarques, absents };
  }, [reservations]);

  const humanDate = useMemo(() => {
    try {
      const d = new Date(selectedDate + "T00:00:00");
      return format(d, "dd/MM/yyyy");
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const dayName = useMemo(
    () => weekdayFR(new Date(selectedDate)),
    [selectedDate]
  );

  const trajetButtons = useMemo(() => {
    if (!trajetsDuJour.length) return [] as JSX.Element[];
    return trajetsDuJour.flatMap((trip) =>
      (trip.horaires[dayName] || []).map((h) => {
        const active =
          selectedTrip?.departure === trip.departure &&
          selectedTrip?.arrival === trip.arrival &&
          selectedTrip?.heure === h;
        return (
          <button
            key={`${trip.id}_${h}`}
            onClick={() =>
              setSelectedTrip({
                id: trip.id,
                departure: trip.departure,
                arrival: trip.arrival,
                heure: h,
              })
            }
            className={`px-3 py-2 rounded-lg text-sm font-medium shadow-sm ${
              active ? "text-white" : "bg-gray-200 text-gray-700"
            }`}
            style={active ? { background: theme.primary } : undefined}
          >
            {trip.departure} → {trip.arrival} à {h}
          </button>
        );
      })
    );
  }, [trajetsDuJour, dayName, selectedTrip, theme.primary]);

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-600">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: theme.bg }}>
      <style>{`
        .brand-logo{height:32px;width:auto;object-fit:contain}
        .case{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:2px solid #0f172a;border-radius:4px;background:#fff;cursor:pointer;user-select:none}
        .case[data-checked="true"]::after{content:"✓";font-weight:700}
        @media print{
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; inset: 0; padding: 0 8mm; }
          .brand-logo{height:20px}
          .case{width:14px;height:14px;border:1.5px solid #000;border-radius:0}
          .case::after{font-size:12px;line-height:1}
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filtre Agence + Date */}
        <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: theme.secondary }}>
                Agence :
              </span>
              {selectedAgencyId ? (
                <span className="px-2 py-1 rounded border bg-gray-50 text-sm">
                  {agencies.find(a => a.id === selectedAgencyId)?.nom || "—"}
                </span>
              ) : (
                <select
                  className="px-2 py-1 border rounded text-sm"
                  value={selectedAgencyId || ""}
                  onChange={(e) => setSelectedAgencyId(e.target.value || null)}
                >
                  <option value="">— Choisir une agence —</option>
                  {agencies.map(a => (
                    <option key={a.id} value={a.id}>{a.nom}</option>
                  ))}
                </select>
              )}
            </div>

            <span className="font-semibold" style={{ color: theme.secondary }}>
              Date :
            </span>
            <button
              className="px-2 py-1 rounded border"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(toLocalISO(d));
              }}
            >
              ◀ Jour précédent
            </button>
            <input
              type="date"
              className="border rounded px-3 py-1"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              className="px-2 py-1 rounded border"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(toLocalISO(d));
              }}
            >
              Jour suivant ▶
            </button>
          </div>

          <div className="font-semibold">Sélectionner un trajet</div>
          <div className="flex flex-wrap gap-2">
            {!selectedAgencyId ? (
              <div className="text-gray-500">Choisissez d’abord une agence.</div>
            ) : trajetsDuJour.length === 0 ? (
              <div className="text-gray-500">Aucun trajet planifié pour cette date</div>
            ) : (
              trajetButtons
            )}
          </div>
        </div>

        {/* Infos départ + actions */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="text-sm text-gray-500">Trajet</div>
            <div className="font-semibold">
              {selectedTrip ? (
                <>
                  {selectedTrip.departure} — {selectedTrip.arrival} • {humanDate} à {selectedTrip.heure}
                </>
              ) : (
                "Aucun trajet sélectionné"
              )}
            </div>

            <div className="ml-auto grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><div className="text-gray-500">N° Bus</div><div className="font-medium">{assign.bus || "—"}</div></div>
              <div><div className="text-gray-500">Immat.</div><div className="font-medium">{assign.immat || "—"}</div></div>
              <div className="hidden md:block"><div className="text-gray-500">Chauffeur</div><div className="font-medium">{assign.chauffeur || "—"}</div></div>
              <div className="hidden md:block"><div className="text-gray-500">Chef embarquement</div><div className="font-medium">{assign.chef || "—"}</div></div>
            </div>
          </div>

          <div className="px-4 pb-3 flex flex-wrap items-center gap-4">
            <div className="text-xs text-gray-600">
              Total: <b>{totals.total}</b> • Embarqués: <b>{totals.embarques}</b> • Absents: <b>{totals.absents}</b>
            </div>
            <input
              type="text"
              placeholder="Rechercher nom / téléphone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={() => setScanOn((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm ${
                scanOn ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"
              }`}
              title="Activer le scanner (QR / code-barres)"
              disabled={!selectedTrip || !selectedAgencyId}
            >
              {scanOn ? "Scanner ON" : "Scanner OFF"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg text-sm border"
              title="Imprimer la liste"
            >
              🖨️ Imprimer
            </button>
          </div>

          {scanOn && (
            <div className="px-4 pb-4">
              <video
                ref={videoRef}
                className="w-full max-w-md aspect-video bg-black rounded-lg overflow-hidden"
                muted
                playsInline
                autoPlay
              />
            </div>
          )}
        </div>

        {/* Saisie manuelle */}
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-sm font-semibold mb-2" style={{ color: theme.secondary }}>
            Saisir une référence
          </div>
          <form onSubmit={submitManual} className="flex gap-2">
            <input
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="ID Firestore ou référence (REF-… / MT-…)"
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg text-white text-sm"
              style={{ background: theme.primary }}
              disabled={!selectedAgencyId && !userAgencyId}
            >
              Valider
            </button>
          </form>
        </div>

        {/* Zone imprimable */}
        <div id="print-area" className="bg-white rounded-xl border shadow-sm">
          <div className="px-4 pt-4">
            <div className="flex items-center gap-3">
              {company?.logoUrl && (
                <img
                  src={(company as any).logoUrl}
                  alt={(company as any)?.nom}
                  className="brand-logo"
                />
              )}
              <div>
                <div className="font-extrabold">
                  {(company as any)?.nom || "Compagnie"}
                </div>
                <div className="text-xs text-gray-500">
                  {(user as any)?.agencyName || agencies.find(a => a.id === selectedAgencyId)?.nom || "Agence"} • Tel. {(company as any)?.telephone || "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm">
              <b>Liste d’embarquement</b>
              {selectedTrip && (
                <> — {selectedTrip.departure} → {selectedTrip.arrival} • {humanDate} • {selectedTrip.heure}</>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
              <div className="border rounded-lg px-2 py-1">
                N° Bus / Immat: {assign.bus || assign.immat ? `${assign.bus || ""} ${assign.immat || ""}` : "_________"}
              </div>
              <div className="border rounded-lg px-2 py-1">
                Chauffeur: {assign.chauffeur || "______________"}
              </div>
              <div className="border rounded-lg px-2 py-1">
                Contrôleur: {assign.chef || "______________"}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left w-12">#</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Téléphone</th>
                  <th className="px-3 py-2 text-left">Canal</th>
                  <th className="px-3 py-2 text-center w-24">Embarqué</th>
                  <th className="px-3 py-2 text-center w-28">Absent</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-3 py-4 text-gray-500" colSpan={6}>
                      Chargement…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-gray-400" colSpan={6}>
                      Aucun passager trouvé
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => {
                    const embarked = r.statutEmbarquement === "embarqué";
                    const absent   = r.statutEmbarquement === "absent";
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{r.nomClient || "—"}</td>
                        <td className="px-3 py-2">{r.telephone || "—"}</td>
                        <td className="px-3 py-2 capitalize">{r.canal || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            className="case"
                            data-checked={embarked}
                            onClick={() => updateStatut(r.id, embarked ? "absent" : "embarqué")}
                            title="Basculer Embarqué / Absent"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              className="case"
                              data-checked={absent}
                              onClick={() => updateStatut(r.id, absent ? "embarqué" : "absent")}
                              title="Basculer Absent / Embarqué"
                            />
                            <button
                              className="text-[11px] px-2 py-1 rounded border hover:bg-gray-50"
                              onClick={() => absentEtReprogrammer(r.id)}
                              title="Marquer absent et reprogrammer au prochain départ"
                            >
                              Absent + Reprog.
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-6 px-4 py-6 text-sm">
            <div><div className="border-t pt-2 text-center">Contrôleur / Chef d’embarquement</div></div>
            <div><div className="border-t pt-2 text-center">Chauffeur</div></div>
            <div><div className="border-t pt-2 text-center">Visa Agence</div></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgenceEmbarquementPage;
