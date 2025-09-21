// src/pages/AdminCompanyPlan.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "@/firebaseConfig";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type PlanDoc = {
  name: string;
  priceMonthly: number;
  quotaReservations?: number;
  overagePerReservation?: number;
  commissionOnline: number; // 0.01 = 1%
  feeGuichet: number;       // FCFA/billet
  minimumMonthly: number;   // FCFA
  maxAgences: number;
  features: { publicPage: boolean; onlineBooking: boolean; guichet: boolean };
};

type CompanyDoc = {
  id: string;
  nom?: string;
  planId?: string;
  plan?: string; // nom dénormalisé
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;
  commissionOnline?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  maxAgences?: number;
};

const nf = new Intl.NumberFormat("fr-FR");

export default function AdminCompanyPlan() {
  const { companyId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [company, setCompany] = useState<CompanyDoc | null>(null);

  // Liste compacte pour le select, et map par id pour l’aperçu
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [plansById, setPlansById] = useState<Record<string, PlanDoc>>({});

  const [chosenPlanId, setChosenPlanId] = useState<string>("");

  const chosenPlan = useMemo<PlanDoc | null>(
    () => (chosenPlanId ? plansById[chosenPlanId] ?? null : null),
    [chosenPlanId, plansById]
  );

  // Abonnements temps réel
  useEffect(() => {
    if (!companyId) return;
    const unsub: Array<() => void> = [];

    // 1) Doc compagnie
    const offCompany = onSnapshot(doc(db, "companies", companyId), (snap) => {
      if (snap.exists()) {
        const c = { id: snap.id, ...(snap.data() as any) } as CompanyDoc;
        setCompany(c);
        // Si aucun choix manuel en cours, on reflète le plan actuel
        setChosenPlanId((curr) => (curr ? curr : c.planId || ""));
      } else {
        setCompany(null);
      }
      setLoading(false);
    });
    unsub.push(offCompany);

    // 2) Plans
    const q = query(collection(db, "plans"), orderBy("priceMonthly", "asc"));
    const offPlans = onSnapshot(q, (qs) => {
      const list: Array<{ id: string; name: string }> = [];
      const map: Record<string, PlanDoc> = {};
      qs.docs.forEach((d) => {
        const data = d.data() as PlanDoc;
        list.push({ id: d.id, name: data.name || d.id });
        map[d.id] = data;
      });
      setPlans(list);
      setPlansById(map);
    });
    unsub.push(offPlans);

    return () => unsub.forEach((u) => u());
  }, [companyId]);

  async function applySelectedPlan() {
    if (!companyId || !chosenPlanId) return;
    const p = plansById[chosenPlanId];
    if (!p) return;

    // Cohérence : si onlineBooking, vitrine forcément active
    const publicPageEnabled = !!p.features.publicPage || !!p.features.onlineBooking;

    setSaving(true);
    try {
      await updateDoc(doc(db, "companies", companyId), {
        planId: chosenPlanId,
        plan: p.name,
        publicPageEnabled,
        onlineBookingEnabled: !!p.features.onlineBooking,
        guichetEnabled: !!p.features.guichet,
        commissionOnline: p.features.onlineBooking ? Number(p.commissionOnline || 0) : 0,
        feeGuichet: p.features.guichet ? Number(p.feeGuichet || 0) : 0,
        minimumMonthly: Number(p.minimumMonthly || 0),
        maxAgences: Number(p.maxAgences || 0),
        updatedAt: serverTimestamp(),
      });

      alert("Plan appliqué à la compagnie ✅");
      navigate(-1); // tu peux retirer ce navigate si tu veux rester sur place
    } finally {
      setSaving(false);
    }
  }

  if (loading || !company) return <div className="p-6">Chargement…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">Plan & options — {company.nom || "Compagnie"}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm">
          Plan (modèle)
          <select
            value={chosenPlanId}
            onChange={(e) => setChosenPlanId(e.target.value)}
            className="mt-1 w-full border p-2 rounded"
          >
            <option value="">— Sélectionner —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="text-sm">
          <div className="text-gray-600 mb-1">Plan actuel</div>
          <div className="px-3 py-2 border rounded bg-gray-50">
            {company.plan ? company.plan : "—"}
          </div>
        </div>
      </div>

      {/* Aperçu du plan sélectionné */}
      {chosenPlan && (
        <div className="border rounded-xl p-4 bg-white">
          <h3 className="font-semibold mb-2">Aperçu du plan sélectionné</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-gray-500">Nom</div>
              <div className="font-semibold">{chosenPlan.name}</div>
              <div className="text-gray-500 mt-2">Mensuel</div>
              <div className="font-semibold">
                {nf.format(chosenPlan.priceMonthly)} FCFA
              </div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-500">Agences max</div>
              <div className="font-semibold">{chosenPlan.maxAgences}</div>
              <div className="text-gray-500 mt-2">Minimum mensuel</div>
              <div className="font-semibold">
                {chosenPlan.minimumMonthly
                  ? nf.format(chosenPlan.minimumMonthly) + " FCFA"
                  : "—"}
              </div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-500">Tarifs</div>
              <div>
                Guichet :{" "}
                <b>
                  {chosenPlan.features.guichet
                    ? nf.format(chosenPlan.feeGuichet) + " FCFA/billet"
                    : "—"}
                </b>
              </div>
              <div>
                Online :{" "}
                <b>
                  {chosenPlan.features.onlineBooking
                    ? Math.round((chosenPlan.commissionOnline || 0) * 100) + " %"
                    : "—"}
                </b>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-600 mt-3">
            Fonctionnalités :{" "}
            <b>
              {chosenPlan.features.publicPage ? "Vitrine" : "—"},{" "}
              {chosenPlan.features.onlineBooking ? "Réservation en ligne" : "—"},{" "}
              {chosenPlan.features.guichet ? "Guichet" : "—"}
            </b>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => navigate(-1)} className="px-3 py-2 rounded border">
          Annuler
        </button>
        <button
          onClick={applySelectedPlan}
          disabled={!chosenPlanId || saving}
          className={`px-3 py-2 rounded text-white ${
            saving ? "bg-orange-300" : "bg-orange-600 hover:bg-orange-700"
          }`}
        >
          {saving ? "Application…" : "Appliquer ce plan"}
        </button>
      </div>
    </div>
  );
}
