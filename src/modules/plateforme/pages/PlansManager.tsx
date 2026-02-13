// src/pages/PlansManager.tsx
import React, { useEffect, useMemo, useState } from "react";
import { db, dbReady } from "@/firebaseConfig";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

type Plan = {
  id?: string;
  name: string;
  priceMonthly: number;           // FCFA / mois
  quotaReservations: number;      // résas / mois incluses (global)
  overagePerReservation: number;  // FCFA / résa au-delà du quota
  commissionOnline: number;       // 0.01 = 1% (si onlineBooking=true)
  feeGuichet: number;             // FCFA / billet (si guichet=true)
  minimumMonthly: number;         // FCFA (0 = none)
  maxAgences: number;             // nb d'agences autorisées
  features: {
    publicPage: boolean;
    onlineBooking: boolean;
    guichet: boolean;
  };
  createdAt?: any;
  updatedAt?: any;
};

const empty: Plan = {
  name: "",
  priceMonthly: 0,
  quotaReservations: 0,
  overagePerReservation: 0,
  commissionOnline: 0,
  feeGuichet: 0,
  minimumMonthly: 0,
  maxAgences: 1,
  features: { publicPage: true, onlineBooking: false, guichet: true },
};

const nf = new Intl.NumberFormat("fr-FR");

export default function PlansManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan>(empty);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const q = query(collection(db, "plans"), orderBy("priceMonthly", "asc"));
      const snap = await getDocs(q);

      console.log(
        "Plans.size =",
        snap.size,
        "projectId =",
        (db.app.options as any).projectId,
        "useEmulators =",
        import.meta?.env?.VITE_USE_EMULATORS
      );

      const rows = snap.docs.map((d) => {
        const x = d.data() as any;
        // Normalisations robustes (vieux champs / variantes)
        return {
          id: d.id,
          ...x,
          name: x.name ?? x.nom ?? "",
          maxAgences: x.maxAgences ?? x.maxAgencies ?? 1,
          features: {
            publicPage: x.features?.publicPage ?? x.publicPage ?? false,
            onlineBooking: x.features?.onlineBooking ?? x.onlineBooking ?? false,
            guichet: x.features?.guichet ?? x.guichet ?? false,
          },
        } as Plan;
      });

      setPlans(rows);
    } catch (err) {
      console.error("Erreur lecture plans:", err);
      alert("Impossible de charger les plans (voir console).");
      setPlans([]);
    }
  };

  useEffect(() => {
    (async () => {
      // Garantit la bonne cible (prod vs émulateur) avant la requête
      await dbReady;
      await load();
    })();
  }, []);

  const isEdit = useMemo(() => Boolean(editing.id), [editing.id]);

  const validate = (p: Plan) => {
    if (!p.name.trim()) return "Le nom du plan est requis.";
    if (p.features.onlineBooking && !p.features.publicPage) {
      return "Incohérence : la réservation en ligne nécessite une page publique.";
    }
    return "";
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: Plan = {
        ...editing,
        name: editing.name.trim(),
        priceMonthly: Number(editing.priceMonthly) || 0,
        quotaReservations: Number(editing.quotaReservations) || 0,
        overagePerReservation: Number(editing.overagePerReservation) || 0,
        commissionOnline: Number(editing.commissionOnline) || 0,
        feeGuichet: Number(editing.feeGuichet) || 0,
        minimumMonthly: Number(editing.minimumMonthly) || 0,
        maxAgences: Number(editing.maxAgences) || 0,
        features: { ...editing.features },
        updatedAt: serverTimestamp(),
      };

      const err = validate(payload);
      if (err) {
        alert(err);
        return;
      }

      if (editing.id) {
        await setDoc(doc(db, "plans", editing.id), payload, { merge: true });
      } else {
        await addDoc(collection(db, "plans"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setEditing(empty);
      await load();
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Supprimer ce plan ?")) return;
    await deleteDoc(doc(db, "plans", id));
    await load();
  };

  const handleToggleFeature = (key: keyof Plan["features"], checked: boolean) => {
    if (key === "onlineBooking" && checked) {
      // onlineBooking impose publicPage
      setEditing((e) => ({
        ...e,
        features: { ...e.features, onlineBooking: true, publicPage: true },
      }));
    } else {
      setEditing((e) => ({
        ...e,
        features: { ...e.features, [key]: checked } as any,
      }));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plans & tarifs</h1>
        <button
          className="px-3 py-2 rounded bg-orange-600 text-white"
          onClick={() => setEditing(empty)}
        >
          + Nouveau plan
        </button>
      </div>

      {/* Cartes des plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border shadow-sm p-5 bg-white flex flex-col"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">{p.name}</h3>
              <span className="text-sm font-bold">
                {nf.format(p.priceMonthly)} FCFA
                <span className="text-gray-500 text-xs font-normal"> /mois</span>
              </span>
            </div>

            <ul className="text-sm text-gray-700 space-y-1 mb-4">
              {p.quotaReservations > 0 && (
                <li>
                  Quota mensuel inclus : <b>{nf.format(p.quotaReservations)}</b>
                </li>
              )}
              {p.overagePerReservation > 0 && (
                <li>
                  Dépassement : <b>{nf.format(p.overagePerReservation)} FCFA</b>{" "}
                  / réservation
                </li>
              )}
              {p.features.guichet && (
                <li>
                  Frais guichet : <b>{nf.format(p.feeGuichet)} FCFA</b> / billet
                </li>
              )}
              {p.features.onlineBooking && (
                <li>
                  Commission online :{" "}
                  <b>{Math.round((p.commissionOnline || 0) * 100)}%</b>
                </li>
              )}
              {p.minimumMonthly > 0 && (
                <li>
                  Minimum mensuel : <b>{nf.format(p.minimumMonthly)} FCFA</b>
                </li>
              )}
              <li>
                Agences max : <b>{p.maxAgences}</b>
              </li>
              <li className="flex flex-wrap gap-2 pt-1">
                {p.features.publicPage && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                    Page publique
                  </span>
                )}
                {p.features.onlineBooking && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                    Réservation en ligne
                  </span>
                )}
                {p.features.guichet && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                    Guichet
                  </span>
                )}
              </li>
            </ul>

            <div className="mt-auto flex gap-3">
              <button
                className="px-3 py-1.5 rounded border"
                onClick={() => setEditing(p)}
              >
                Éditer
              </button>
              <button
                className="px-3 py-1.5 rounded border border-red-300 text-red-600"
                onClick={() => p.id && onDelete(p.id)}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <div className="text-sm text-gray-500">
            Aucun plan créé pour le moment.
          </div>
        )}
      </div>

      {/* Formulaire Plan */}
      <form
        onSubmit={onSave}
        className="bg-white rounded-2xl border shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <h2 className="md:col-span-3 font-semibold text-lg">
          {isEdit ? "Modifier le plan" : "Créer un plan"}
        </h2>

        <label className="text-sm">
          Nom du plan
          <input
            className="border rounded p-2 mt-1 w-full"
            placeholder="Starter, Pro, Enterprise…"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
        </label>

        <label className="text-sm">
          Prix mensuel (FCFA)
          <input
            className="border rounded p-2 mt-1 w-full"
            type="number"
            value={editing.priceMonthly}
            onChange={(e) =>
              setEditing({ ...editing, priceMonthly: Number(e.target.value) })
            }
          />
        </label>

        <label className="text-sm">
          Agences maximum
          <input
            className="border rounded p-2 mt-1 w-full"
            type="number"
            value={editing.maxAgences}
            onChange={(e) =>
              setEditing({ ...editing, maxAgences: Number(e.target.value) })
            }
          />
        </label>

        <label className="text-sm">
          Quota de réservations / mois (global)
          <input
            className="border rounded p-2 mt-1 w-full"
            type="number"
            value={editing.quotaReservations}
            onChange={(e) =>
              setEditing({
                ...editing,
                quotaReservations: Number(e.target.value),
              })
            }
          />
        </label>

        <label className="text-sm">
          Dépassement (FCFA) / réservation
          <input
            className="border rounded p-2 mt-1 w-full"
            type="number"
            value={editing.overagePerReservation}
            onChange={(e) =>
              setEditing({
                ...editing,
                overagePerReservation: Number(e.target.value),
              })
            }
          />
        </label>

        <label className="text-sm">
          Minimum mensuel (FCFA) — optionnel
          <input
            className="border rounded p-2 mt-1 w-full"
            type="number"
            value={editing.minimumMonthly}
            onChange={(e) =>
              setEditing({ ...editing, minimumMonthly: Number(e.target.value) })
            }
          />
        </label>

        <label className="text-sm">
          Commission en ligne (%) {editing.features.onlineBooking ? "" : "(désactivé)"}
          <input
            className="border rounded p-2 mt-1 w-full disabled:opacity-50"
            type="number"
            step="0.1"
            disabled={!editing.features.onlineBooking}
            value={editing.features.onlineBooking ? (editing.commissionOnline || 0) * 100 : 0}
            onChange={(e) =>
              setEditing({
                ...editing,
                commissionOnline: Number(e.target.value) / 100,
              })
            }
          />
        </label>

        <label className="text-sm">
          Frais guichet (FCFA / billet) {editing.features.guichet ? "" : "(désactivé)"}
          <input
            className="border rounded p-2 mt-1 w-full disabled:opacity-50"
            type="number"
            disabled={!editing.features.guichet}
            value={editing.features.guichet ? editing.feeGuichet : 0}
            onChange={(e) =>
              setEditing({ ...editing, feeGuichet: Number(e.target.value) })
            }
          />
        </label>

        <div className="md:col-span-3 flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editing.features.publicPage}
              onChange={(e) => handleToggleFeature("publicPage", e.target.checked)}
            />
            Page publique (site vitrine)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editing.features.onlineBooking}
              onChange={(e) =>
                handleToggleFeature("onlineBooking", e.target.checked)
              }
            />
            Réservation en ligne
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editing.features.guichet}
              onChange={(e) => handleToggleFeature("guichet", e.target.checked)}
            />
            Guichet (vente au comptoir)
          </label>
        </div>

        <div className="md:col-span-3 flex gap-2">
          <button
            className="px-3 py-2 rounded bg-orange-600 text-white disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Enregistrement..." : isEdit ? "Enregistrer" : "Créer"}
          </button>
          {isEdit && (
            <button
              type="button"
              className="px-3 py-2 rounded border"
              onClick={() => setEditing(empty)}
            >
              Annuler
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
