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
  Timestamp,
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
  date?: string;   // "YYYY-MM-DD"
  heure?: string;  // "HH:mm"
  canal?: string;  // "guichet" | "en_ligne" | ...
  montant?: number;
  statut?: string; // "payé"
  statutEmbarquement?: StatutEmbarquement;
  checkInTime?: any;
  trajetId?: string;
  referenceCode?: string;
  controleurId?: string;
}

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  horaires: { [jour: string]: string[] };
  active: boolean;
}

type SelectedTrip = {
  id?: string; // optionnel
  departure: string;
  arrival: string;
  heure: string;
};

function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const weekdayFR = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

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
  const agencyId = user?.agencyId ?? null;
  const uid = user?.uid ?? null;

  // Date sélectionnée
  const [selectedDate, setSelectedDate] = useState<string>(
    location.state?.date || toLocalISO(new Date())
  );

  // Trajets du jour + sélection
  const [trajetsDuJour, setTrajetsDuJour] = useState<WeeklyTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<SelectedTrip | null>(null);

  // Réservations & UI
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // ====== Scan caméra (ON/OFF) ======
  const [scanOn, setScanOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastAlertRef = useRef<number>(0);

  // ====== Affectation (bus / immat / chauffeur / chef) – optionnelle ======
  const [assign, setAssign] = useState<{bus?: string; immat?: string; chauffeur?: string; chef?: string}>({});
  useEffect(()=>{
    setAssign({});
    if (!companyId || !agencyId || !selectedTrip || !selectedDate) return;

    // Adapte ce chemin si besoin à ta structure réelle
    const key = `${(selectedTrip.departure||'').trim()}_${(selectedTrip.arrival||'').trim()}_${(selectedTrip.heure||'').trim()}_${selectedDate}`.replace(/\s+/g,'-');
    const ref = doc(db, `companies/${companyId}/agences/${agencyId}/affectations/${key}`);
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
  }, [companyId, agencyId, selectedTrip, selectedDate]);

  /* ---------- Pré-remplissage depuis Réservations -> Afficher ---------- */
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

  /* ---------- Charger weeklyTrips du jour sélectionné ---------- */
  useEffect(() => {
    const load = async () => {
      if (!companyId || !agencyId) return;

      const weeklyTripsRef = collection(
        db,
        `companies/${companyId}/agences/${agencyId}/weeklyTrips`
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agencyId, selectedDate]);

  /* ---------- Écoute temps réel des réservations ---------- */
  useEffect(() => {
    if (!companyId || !agencyId) return;
    if (!selectedTrip || !selectedTrip.departure || !selectedTrip.arrival || !selectedTrip.heure) {
      setReservations([]); return;
    }

    setIsLoading(true);
    setReservations([]);

    const base = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    const unsubs: Array<() => void> = [];
    const bag = new Map<string, Reservation>();

    const commit = () => {
      const list = Array.from(bag.values()).sort((a, b) =>
        (a.nomClient || "").localeCompare(b.nomClient || "")
      );
      setReservations(list);
      setIsLoading(false);
    };

    // Fallback par (depart/arrivee/heure/date)
    const qFallback = query(
      base,
      where("date", "==", selectedDate),
      where("depart", "==", selectedTrip.departure),
      where("arrivee", "==", selectedTrip.arrival),
      where("heure", "==", selectedTrip.heure),
      where("statut", "==", "payé")
    );
    unsubs.push(onSnapshot(qFallback, (snap) => {
      snap.docs.forEach((d) => bag.set(d.id, { id: d.id, ...(d.data() as any) }));
      commit();
    }, () => setIsLoading(false)));

    // Par trajetId si dispo
    if (selectedTrip.id) {
      const qById = query(
        base,
        where("date", "==", selectedDate),
        where("trajetId", "==", selectedTrip.id),
        where("heure", "==", selectedTrip.heure),
        where("statut", "==", "payé")
      );
      unsubs.push(onSnapshot(qById, (snap) => {
        snap.docs.forEach((d) => bag.set(d.id, { id: d.id, ...(d.data() as any) }));
        commit();
      }, () => setIsLoading(false)));
    }

    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, selectedTrip, selectedDate]);

  /* ---------- Mise à jour transactionnelle d'un statut (emb / abs) ---------- */
  const updateStatut = useCallback(
    async (reservationId: string, statut: StatutEmbarquement) => {
      if (!companyId || !agencyId || !uid) return;
      const ref = doc(
        db,
        `companies/${companyId}/agences/${agencyId}/reservations`,
        reservationId
      );

      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error("Réservation introuvable");
          const data = snap.data() as Reservation;

          if (data.statutEmbarquement === "embarqué" && statut === "embarqué") return;

          tx.update(ref, {
            statutEmbarquement: statut,
            controleurId: uid,
            checkInTime: statut === "embarqué" ? serverTimestamp() : null,
          });

          // log
          const logsRef = collection(
            db,
            `companies/${companyId}/agences/${agencyId}/boardingLogs`
          );
          const logId = doc(logsRef);
          tx.set(logId, {
            reservationId,
            trajetId: selectedTrip?.id || data.trajetId || null,
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
    [companyId, agencyId, uid, selectedTrip?.id]
  );

  /* ---------- Saisie manuelle (ID / référence) ---------- */
  const [scanCode, setScanCode] = useState("");
  const submitManual = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const code = scanCode.trim();
      if (!code || !companyId || !agencyId) return;
      try {
        // par ID
        const idRef = doc(
          db,
          `companies/${companyId}/agences/${agencyId}/reservations`,
          code
        );
        const idSnap = await getDoc(idRef);
        if (idSnap.exists()) {
          await updateStatut(code, "embarqué");
          setScanCode("");
          return;
        }
        // par referenceCode
        const qRef = query(
          collection(
            db,
            `companies/${companyId}/agences/${agencyId}/reservations`
          ),
          where("referenceCode", "==", code)
        );
        const qs = await getDocs(qRef);
        if (qs.size === 1) {
          await updateStatut(qs.docs[0].id, "embarqué");
          setScanCode("");
        } else {
          alert("Réservation introuvable (ou référence multiple).");
        }
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la validation manuelle.");
      }
    },
    [scanCode, companyId, agencyId, updateStatut]
  );

  /* ---------- Scanner caméra ---------- */
  useEffect(() => {
    if (!scanOn) {
      readerRef.current?.reset();
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
      const devices = (await BrowserMultiFormatReader.listVideoInputDevices()) as unknown as Array<{ deviceId?: string }>;
      const preferred: string | null = devices?.[0]?.deviceId ?? null;

      await reader.decodeFromVideoDevice(
        (preferred as unknown) as string | null,
        videoRef.current as HTMLVideoElement,
        async (res) => {
          const now = Date.now();
          if (!res || now - lastScanRef.current < 1200) return; // anti double
          lastScanRef.current = now;

          const code = res.getText().trim();
          try {
            // ID direct
            const idRef = doc(
              db,
              `companies/${companyId}/agences/${agencyId}/reservations`,
              code
            );
            const idSnap = await getDoc(idRef);
            if (idSnap.exists()) {
              await updateStatut(code, "embarqué");
              new Audio("/beep.mp3").play().catch(() => {});
              return;
            }
            // referenceCode
            const qRef = query(
              collection(
                db,
                `companies/${companyId}/agences/${agencyId}/reservations`
              ),
              where("referenceCode", "==", code)
            );
            const qs = await getDocs(qRef);
            if (qs.size === 1) {
              await updateStatut(qs.docs[0].id, "embarqué");
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
    })();

    return () => {
      readerRef.current?.reset();
      readerRef.current = null;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [scanOn, companyId, agencyId, updateStatut]);

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

  /* ---------- Totaux utiles ---------- */
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
      {/* Styles locaux pour cases et impression */}
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
        {/* ==== Barre filtres (début de page) ==== */}
        <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2">
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
            {trajetsDuJour.length === 0 ? (
              <div className="text-gray-500">Aucun trajet planifié pour cette date</div>
            ) : (
              trajetButtons
            )}
          </div>
        </div>

        {/* ==== Infos départ + actions ==== */}
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

            {/* Infos bus/garage */}
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

        {/* ==== Saisie manuelle (ID / référence) ==== */}
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-sm font-semibold mb-2" style={{ color: theme.secondary }}>
            Saisir une référence
          </div>
          <form onSubmit={submitManual} className="flex gap-2">
            <input
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="ID Firestore ou référence (KMT-…)"
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg text-white text-sm"
              style={{ background: theme.primary }}
            >
              Valider
            </button>
          </form>
        </div>

        {/* ======== Zone imprimable ======== */}
        <div id="print-area" className="bg-white rounded-xl border shadow-sm">
          {/* En-tête imprimable */}
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
                  {(user as any)?.agencyName || "Agence"} • Tel. {(company as any)?.telephone || "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm">
              <b>Liste d’embarquement</b>
              {selectedTrip && (
                <> — {selectedTrip.departure} → {selectedTrip.arrival} • {humanDate} • {selectedTrip.heure}</>
              )}
            </div>

            {/* Ligne infos bus/chauffeur (si pas d’affectation) */}
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

          {/* Table passagers */}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left w-12">#</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Téléphone</th>
                  <th className="px-3 py-2 text-left">Canal</th>
                  <th className="px-3 py-2 text-center w-24">Embarqué</th>
                  <th className="px-3 py-2 text-center w-20">Absent</th>
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
                          <button
                            className="case"
                            data-checked={absent}
                            onClick={() => updateStatut(r.id, absent ? "embarqué" : "absent")}
                            title="Basculer Absent / Embarqué"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pied pour signatures (impression) */}
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
