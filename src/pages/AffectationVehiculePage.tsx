// src/pages/AffectationVehiculePage.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";

/* ===================== Types ===================== */
type WeeklyTrip = {
  id: string;
  departure: string;
  arrival: string;
  horaires: Record<string, string[]>;
  active: boolean;
};

type AgencyItem = { id: string; nom: string };

type Affectation = {
  busNumber?: string;
  immatriculation?: string;
  chauffeur?: string;
  chefEmbarquement?: string; // convoyeur
  tripId?: string | null;
  date?: string;
  heure?: string;
  createdAt?: any;
  updatedAt?: any;
};

/* ===================== Utils ===================== */
function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const weekdayFR = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

function affectationKey(dep: string, arr: string, heure: string, date: string) {
  return `${dep.trim()}_${arr.trim()}_${heure.trim()}_${date}`.replace(/\s+/g, "-");
}

/* ===================== Sous-composant ligne ===================== */
/** Ce sous-composant a ses *propres* hooks (stables) par ligne, évitant les hooks dans la boucle du parent. */
const AffectationRow: React.FC<{
  companyId: string;
  agencyId: string;
  trip: WeeklyTrip;
  date: string;
  heure: string;
  onSaved?: () => void;
}> = ({ companyId, agencyId, trip, date, heure, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busNumber, setBusNumber] = useState("");
  const [immat, setImmat] = useState("");
  const [chauffeur, setChauffeur] = useState("");
  const [convoyeur, setConvoyeur] = useState("");
  const [exists, setExists] = useState(false);

  const key = useMemo(
    () => affectationKey(trip.departure, trip.arrival, heure, date),
    [trip.departure, trip.arrival, heure, date]
  );

  // Charger l'affectation existante
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ref = doc(
          db,
          `companies/${companyId}/agences/${agencyId}/affectations/${key}`
        );
        const snap = await getDoc(ref);
        if (!cancelled && snap.exists()) {
          const d = snap.data() as Affectation;
          setBusNumber(d.busNumber || "");
          setImmat(d.immatriculation || "");
          setChauffeur(d.chauffeur || "");
          setConvoyeur(d.chefEmbarquement || "");
          setExists(true);
        } else if (!cancelled) {
          setBusNumber("");
          setImmat("");
          setChauffeur("");
          setConvoyeur("");
          setExists(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId, key]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const ref = doc(
        db,
        `companies/${companyId}/agences/${agencyId}/affectations/${key}`
      );
      const payload: Affectation = {
        busNumber: busNumber || "",
        immatriculation: immat || "",
        chauffeur: chauffeur || "",
        chefEmbarquement: convoyeur || "",
        tripId: trip.id || null,
        date,
        heure,
        updatedAt: new Date(),
      };
      await setDoc(ref, payload, { merge: true });
      setExists(true);
      onSaved?.();
    } catch (e) {
      console.error(e);
      alert("Échec de l’enregistrement de l’affectation.");
    } finally {
      setSaving(false);
    }
  }, [companyId, agencyId, key, busNumber, immat, chauffeur, convoyeur, trip.id, date, heure, onSaved]);

  return (
    <tr className="border-t">
      <td className="px-3 py-2 whitespace-nowrap text-sm">
        <div className="font-medium">{trip.departure} → {trip.arrival}</div>
        <div className="text-xs text-gray-500">{date} • {heure}</div>
      </td>
      <td className="px-2 py-2">
        <input
          className="w-40 px-2 py-1 border rounded text-sm"
          placeholder="N° Bus"
          value={busNumber}
          onChange={(e) => setBusNumber(e.target.value)}
          disabled={loading || saving}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className="w-40 px-2 py-1 border rounded text-sm"
          placeholder="Immat."
          value={immat}
          onChange={(e) => setImmat(e.target.value)}
          disabled={loading || saving}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className="w-48 px-2 py-1 border rounded text-sm"
          placeholder="Chauffeur"
          value={chauffeur}
          onChange={(e) => setChauffeur(e.target.value)}
          disabled={loading || saving}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className="w-48 px-2 py-1 border rounded text-sm"
          placeholder="Convoyeur"
          value={convoyeur}
          onChange={(e) => setConvoyeur(e.target.value)}
          disabled={loading || saving}
        />
      </td>
      <td className="px-2 py-2 text-center">
        <button
          onClick={save}
          disabled={saving || loading}
          className={`px-3 py-1 rounded text-sm text-white ${exists ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
          title={exists ? "Mettre à jour l’affectation" : "Enregistrer l’affectation"}
        >
          {saving ? "…" : exists ? "Mettre à jour" : "Affecter"}
        </button>
      </td>
      <td className="px-3 py-2 text-xs text-center">
        {loading ? "…" : exists ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            Affecté
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
            Non affecté
          </span>
        )}
      </td>
    </tr>
  );
};

/* ===================== Page principale ===================== */
const AffectationVehiculePage: React.FC = () => {
  const { user, company } = useAuth() as any;

  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;

  const theme = {
    primary: (company as any)?.couleurPrimaire || "#0ea5e9",
    secondary: (company as any)?.couleurSecondaire || "#f59e0b",
    bg: "#f7f8fa",
  };

  const [agencies, setAgencies] = useState<AgencyItem[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(userAgencyId);

  const [selectedDate, setSelectedDate] = useState<string>(toLocalISO(new Date()));
  const [dayTrips, setDayTrips] = useState<WeeklyTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<WeeklyTrip | null>(null);
  const [selectedHeure, setSelectedHeure] = useState<string>("");

  /* Charger agences (si l’utilisateur peut en changer) */
  useEffect(() => {
    (async () => {
      if (!companyId) return;
      const snap = await getDocs(collection(db, `companies/${companyId}/agences`));
      const list = snap.docs.map((d) => ({
        id: d.id,
        nom: (d.data() as any)?.nom || (d.data() as any)?.name || d.id,
      }));
      setAgencies(list);
      if (!userAgencyId && list.length === 1) setSelectedAgencyId(list[0].id);
    })();
  }, [companyId, userAgencyId]);

  /* WeeklyTrips du jour */
  useEffect(() => {
    (async () => {
      if (!companyId || !selectedAgencyId) {
        setDayTrips([]);
        setSelectedTrip(null);
        setSelectedHeure("");
        return;
      }
      const weeklyTripsRef = collection(
        db,
        `companies/${companyId}/agences/${selectedAgencyId}/weeklyTrips`
      );
      const snap = await getDocs(weeklyTripsRef);
      const dayName = weekdayFR(new Date(selectedDate));
      const trips = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as WeeklyTrip)
        .filter((t) => t.active && (t.horaires?.[dayName] || []).length > 0);
      setDayTrips(trips);

      // Si le trajet sélectionné n’existe plus, on réinitialise
      if (selectedTrip) {
        const still = trips.find((t) => t.id === selectedTrip.id) || null;
        if (!still) {
          setSelectedTrip(null);
          setSelectedHeure("");
        }
      }
    })();
  }, [companyId, selectedAgencyId, selectedDate]); // eslint-disable-line

  const hoursForSelected = useMemo(() => {
    if (!selectedTrip) return [];
    const dayName = weekdayFR(new Date(selectedDate));
    return (selectedTrip.horaires?.[dayName] || []).slice().sort();
  }, [selectedTrip, selectedDate]);

  const onSavedOne = useCallback(() => {
    // Rien d’obligatoire ici (on pourrait toaster). Gardé pour extension.
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen" style={{ background: theme.bg }}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: theme.secondary }}>
                Agence :
              </span>
              {userAgencyId ? (
                <span className="px-2 py-1 rounded border bg-gray-50 text-sm">
                  {agencies.find((a) => a.id === (selectedAgencyId || userAgencyId))?.nom || "—"}
                </span>
              ) : (
                <select
                  className="px-2 py-1 border rounded text-sm"
                  value={selectedAgencyId || ""}
                  onChange={(e) => setSelectedAgencyId(e.target.value || null)}
                >
                  <option value="">— Choisir une agence —</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nom}
                    </option>
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
            ) : dayTrips.length === 0 ? (
              <div className="text-gray-500">Aucun trajet planifié pour cette date</div>
            ) : (
              dayTrips.map((t) => {
                const dayName = weekdayFR(new Date(selectedDate));
                const hours = (t.horaires?.[dayName] || []).slice().sort();
                const active = selectedTrip?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTrip(t);
                      setSelectedHeure(""); // on re-sélectionne l’heure ensuite
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium shadow-sm ${
                      active ? "text-white" : "bg-gray-200 text-gray-700"
                    }`}
                    style={active ? { background: theme.primary } : undefined}
                    title={hours.join(", ")}
                  >
                    {t.departure} → {t.arrival}
                  </button>
                );
              })
            )}
          </div>

          {/* Choix de l’heure pour le trajet sélectionné */}
          {selectedTrip && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Heure :</span>
              {hoursForSelected.length === 0 ? (
                <span className="text-xs text-gray-500">Aucune heure pour ce jour</span>
              ) : (
                hoursForSelected.map((h) => {
                  const active = selectedHeure === h;
                  return (
                    <button
                      key={h}
                      onClick={() => setSelectedHeure(h)}
                      className={`px-2 py-1 rounded border text-sm ${
                        active ? "text-white" : "bg-white text-gray-700"
                      }`}
                      style={active ? { background: theme.primary, borderColor: theme.primary } : undefined}
                    >
                      {h}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Tableau d’affectation pour (trajet sélectionné + toutes les heures) OU toutes les lignes du jour */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="font-semibold">Affectations véhicule & équipage</div>
            {!!selectedTrip && !!selectedHeure && (
              <div className="text-sm text-gray-600">
                {selectedTrip.departure} → {selectedTrip.arrival} • {selectedDate} • {selectedHeure}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Trajet</th>
                  <th className="px-3 py-2 text-left">N° Bus</th>
                  <th className="px-3 py-2 text-left">Immat.</th>
                  <th className="px-3 py-2 text-left">Chauffeur</th>
                  <th className="px-3 py-2 text-left">Convoyeur</th>
                  <th className="px-3 py-2 text-center w-32">Action</th>
                  <th className="px-3 py-2 text-center w-32">Statut</th>
                </tr>
              </thead>
              <tbody>
                {/* Cas 1 : un trajet + une heure sélectionnés → une ligne unique */}
                {selectedTrip && selectedHeure ? (
                  <AffectationRow
                    key={`${selectedTrip.id}_${selectedHeure}`}
                    companyId={companyId!}
                    agencyId={(selectedAgencyId || userAgencyId)!}
                    trip={selectedTrip}
                    date={selectedDate}
                    heure={selectedHeure}
                    onSaved={onSavedOne}
                  />
                ) : (
                  /* Cas 2 : afficher toutes les combinaisons du jour */
                  (() => {
                    const dayName = weekdayFR(new Date(selectedDate));
                    const rows: JSX.Element[] = [];
                    dayTrips.forEach((t) => {
                      const hours = (t.horaires?.[dayName] || []).slice().sort();
                      hours.forEach((h) => {
                        rows.push(
                          <AffectationRow
                            key={`${t.id}_${h}`}
                            companyId={companyId!}
                            agencyId={(selectedAgencyId || userAgencyId)!}
                            trip={t}
                            date={selectedDate}
                            heure={h}
                            onSaved={onSavedOne}
                          />
                        );
                      });
                    });
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td className="px-3 py-4 text-gray-500" colSpan={7}>
                            Aucun trajet pour cette date.
                          </td>
                        </tr>
                      );
                    }
                    return rows;
                  })()
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-xs text-gray-500">
            Astuce : si vous ne sélectionnez pas d’heure, le tableau affiche toutes les rotations du jour pour affecter en masse.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AffectationVehiculePage;
