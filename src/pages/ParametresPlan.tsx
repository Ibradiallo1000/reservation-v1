// src/pages/ParametresPlan.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

type Plan = {
  id: string;
  name: string;
  priceMonthly: number;
  quotaReservations?: number;
  overagePerReservation?: number;
  commissionOnline: number; // 0.01
  feeGuichet: number;       // FCFA/billet
  minimumMonthly: number;   // FCFA
  maxAgences: number;
  features: { publicPage: boolean; onlineBooking: boolean; guichet: boolean };
};

type CompanyDoc = {
  id: string;
  nom?: string;
  planId?: string; // id du plan actif
  plan?: string;   // nom (fallback)
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;
};

const nf = new Intl.NumberFormat("fr-FR");

const ParametresPlan: React.FC = () => {
  const { user, company } = useAuth() as any;
  const companyId = user?.companyId || company?.id;

  const [cmp, setCmp] = useState<CompanyDoc | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [counts, setCounts] = useState({ agences: 0, users: 0 });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // Abonnements temps réel
  useEffect(() => {
    if (!companyId) return;
    const unsubscribers: Array<() => void> = [];

    // 1) Doc compagnie en temps réel
    const cRef = doc(db, "companies", companyId);
    const offCompany = onSnapshot(cRef, (snap) => {
      if (snap.exists()) {
        setCmp({ id: snap.id, ...(snap.data() as any) });
        setLoading(false);
      } else {
        setCmp(null);
        setLoading(false);
      }
    });
    unsubscribers.push(offCompany);

    // 2) Plans en temps réel
    const q = query(collection(db, "plans"), orderBy("priceMonthly", "asc"));
    const offPlans = onSnapshot(q, (querySnap) => {
      setPlans(
        querySnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Plan[]
      );
    });
    unsubscribers.push(offPlans);

    // 3) Comptages (pas critique en temps réel)
    (async () => {
      try {
        const agencesRef = collection(db, `companies/${companyId}/agences`);
        const staffRef = collection(db, `companies/${companyId}/personnel`);
        const [ag, us] = await Promise.all([
          getCountFromServer(agencesRef),
          getCountFromServer(staffRef),
        ]);
        setCounts({ agences: ag.data().count, users: us.data().count });
      } catch {
        /* no-op */
      }
    })();

    return () => unsubscribers.forEach((u) => u());
  }, [companyId]);

  const planById = useMemo(() => {
    const map: Record<string, Plan> = {};
    plans.forEach((p) => (map[p.id] = p));
    return map;
  }, [plans]);

  // Plan actif : priorité à planId ; sinon on matche par nom
  const activePlan: Plan | null = useMemo(() => {
    if (!cmp) return null;
    if (cmp.planId && planById[cmp.planId]) return planById[cmp.planId];
    return plans.find((p) => p.name === cmp.plan) || null;
  }, [cmp, planById, plans]);

  const otherPlans = useMemo(
    () => plans.filter((p) => (cmp?.planId ? p.id !== cmp.planId : p.name !== cmp?.plan)),
    [plans, cmp?.planId, cmp?.plan]
  );

  const requestUpgrade = async (target: Plan) => {
    if (!companyId || !cmp) return;
    setSending(true);
    try {
      const reqRef = doc(collection(db, `companies/${companyId}/billingRequests`));
      await setDoc(reqRef, {
        type: "planUpgrade",
        companyId,
        fromPlanId: cmp.planId || null,
        fromPlanName: cmp.plan || null,
        toPlanId: target.id,
        toPlanName: target.name,
        createdAt: serverTimestamp(),
        status: "pending",
        actorUid: user?.uid || null,
      });
      alert("Demande envoyée. Notre équipe vous contactera.");
    } finally {
      setSending(false);
    }
  };

  if (loading || !cmp) return <div className="p-6">Chargement…</div>;

  return (
    <div className="space-y-6">
      {/* ===== Plan actuel ===== */}
      <section className="bg-white border rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Votre plan</h2>
        {activePlan ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold">{activePlan.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">ACTIF</span>
              </div>
              <div className="text-2xl font-extrabold">
                {nf.format(activePlan.priceMonthly)} FCFA
              </div>
              <div className="text-xs text-gray-500">par mois</div>
            </div>

            <div className="border rounded-xl p-4">
              <p className="text-sm text-gray-500">Agences autorisées</p>
              <p className="text-xl font-bold">
                {counts.agences} / {activePlan.maxAgences}
              </p>
            </div>

            <div className="border rounded-xl p-4">
              <p className="text-sm text-gray-500">Tarifs</p>
              <ul className="text-sm">
                {activePlan.features.onlineBooking && (
                  <li>
                    Commission en ligne :{" "}
                    <b>{Math.round((activePlan.commissionOnline || 0) * 100)}%</b>
                  </li>
                )}
                {activePlan.features.guichet && (
                  <li>
                    Frais guichet : <b>{nf.format(activePlan.feeGuichet)} FCFA</b>
                  </li>
                )}
                <li>
                  Minimum mensuel :{" "}
                  <b>
                    {activePlan.minimumMonthly
                      ? nf.format(activePlan.minimumMonthly) + " FCFA"
                      : "—"}
                  </b>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-sm text-orange-700">
            Aucun plan actif trouvé. (Valeur actuelle : {cmp.plan || "—"})
          </div>
        )}
      </section>

      {/* ===== Autres plans ===== */}
      <section className="bg-white border rounded-xl p-5">
        <h3 className="text-md font-semibold mb-4">Autres plans</h3>
        {otherPlans.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun autre plan disponible.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {otherPlans.map((p) => (
              <div key={p.id} className="border rounded-xl p-4 flex flex-col">
                <h4 className="font-semibold">{p.name}</h4>
                <div className="text-xl font-extrabold mt-1">
                  {nf.format(p.priceMonthly)} FCFA
                </div>
                <div className="text-xs text-gray-500 mb-3">par mois</div>
                <ul className="text-sm text-gray-700 space-y-1 mb-4">
                  <li>Agences max : <b>{p.maxAgences}</b></li>
                  {p.features.onlineBooking && (
                    <li>Commission online : <b>{Math.round((p.commissionOnline || 0) * 100)}%</b></li>
                  )}
                  {p.features.guichet && (
                    <li>Frais guichet : <b>{nf.format(p.feeGuichet)} FCFA</b></li>
                  )}
                  <li>
                    Minimum mensuel :{" "}
                    <b>{p.minimumMonthly ? nf.format(p.minimumMonthly) + " FCFA" : "—"}</b>
                  </li>
                  <li>
                    Fonctionnalités :{" "}
                    {p.features.publicPage ? "Vitrine" : "—"},{" "}
                    {p.features.onlineBooking ? "Réservation en ligne" : "—"},{" "}
                    {p.features.guichet ? "Guichet" : "—"}
                  </li>
                </ul>
                <button
                  className="mt-auto px-3 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 text-sm disabled:opacity-60"
                  disabled={sending}
                  onClick={() => requestUpgrade(p)}
                >
                  Demander ce plan
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ParametresPlan;
