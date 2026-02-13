// =============================================
// src/pages/ParametresPlan.tsx
// VERSION MULTI-RÔLE (CEO + ADMIN PLATEFORME)
// =============================================
import React, { useEffect, useMemo, useState } from "react";
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
  commissionOnline: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  features: {
    publicPage: boolean;
    onlineBooking: boolean;
    guichet: boolean;
  };
};

interface Props {
  companyId: string;
}

const nf = new Intl.NumberFormat("fr-FR");

const ParametresPlan: React.FC<Props> = ({ companyId }) => {
  const [cmp, setCmp] = useState<any>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [counts, setCounts] = useState({ agences: 0, users: 0 });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  /* =========================
     LOAD DATA
  ========================= */
  useEffect(() => {
    if (!companyId) return;

    const unsubs: Array<() => void> = [];

    // 1️⃣ Company realtime
    const companyRef = doc(db, "companies", companyId);
    const offCompany = onSnapshot(companyRef, (snap) => {
      if (snap.exists()) {
        setCmp({ id: snap.id, ...snap.data() });
      } else {
        setCmp(null);
      }
      setLoading(false);
    });
    unsubs.push(offCompany);

    // 2️⃣ Plans realtime
    const plansQuery = query(
      collection(db, "plans"),
      orderBy("priceMonthly", "asc")
    );

    const offPlans = onSnapshot(plansQuery, (snap) => {
      setPlans(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Plan[]
      );
    });

    unsubs.push(offPlans);

    // 3️⃣ Counts
    (async () => {
      try {
        const agencesRef = collection(
          db,
          `companies/${companyId}/agences`
        );
        const staffRef = collection(
          db,
          `companies/${companyId}/personnel`
        );

        const [ag, us] = await Promise.all([
          getCountFromServer(agencesRef),
          getCountFromServer(staffRef),
        ]);

        setCounts({
          agences: ag.data().count,
          users: us.data().count,
        });
      } catch {
        // silent
      }
    })();

    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  const planById = useMemo(() => {
    const map: Record<string, Plan> = {};
    plans.forEach((p) => (map[p.id] = p));
    return map;
  }, [plans]);

  const activePlan = useMemo(() => {
    if (!cmp) return null;
    if (cmp.planId && planById[cmp.planId])
      return planById[cmp.planId];
    return plans.find((p) => p.name === cmp.plan) || null;
  }, [cmp, planById, plans]);

  const otherPlans = useMemo(() => {
    if (!cmp) return plans;
    return plans.filter((p) =>
      cmp.planId ? p.id !== cmp.planId : p.name !== cmp.plan
    );
  }, [plans, cmp]);

  const requestUpgrade = async (target: Plan) => {
    if (!companyId) return;

    setSending(true);
    try {
      const reqRef = doc(
        collection(
          db,
          `companies/${companyId}/billingRequests`
        )
      );

      await setDoc(reqRef, {
        type: "planUpgrade",
        companyId,
        fromPlanId: cmp?.planId || null,
        toPlanId: target.id,
        toPlanName: target.name,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      alert("Demande envoyée avec succès.");
    } finally {
      setSending(false);
    }
  };

  if (loading || !cmp)
    return <div className="p-6">Chargement…</div>;

  return (
    <div className="space-y-6">
      {/* PLAN ACTUEL */}
      <section className="bg-white border rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">
          Votre plan
        </h2>

        {activePlan ? (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border rounded-xl p-4">
              <h3 className="font-semibold">
                {activePlan.name}
              </h3>
              <div className="text-2xl font-bold">
                {nf.format(activePlan.priceMonthly)} FCFA
              </div>
            </div>

            <div className="border rounded-xl p-4">
              <p className="text-sm text-gray-500">
                Agences
              </p>
              <p className="text-xl font-bold">
                {counts.agences} /{" "}
                {activePlan.maxAgences}
              </p>
            </div>

            <div className="border rounded-xl p-4">
              <p className="text-sm text-gray-500">
                Commission online
              </p>
              <p className="font-bold">
                {Math.round(
                  (activePlan.commissionOnline || 0) *
                    100
                )}
                %
              </p>
            </div>
          </div>
        ) : (
          <p>Aucun plan actif.</p>
        )}
      </section>

      {/* AUTRES PLANS */}
      <section className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold mb-4">
          Autres plans
        </h3>

        <div className="grid md:grid-cols-3 gap-4">
          {otherPlans.map((p) => (
            <div
              key={p.id}
              className="border rounded-xl p-4 flex flex-col"
            >
              <h4 className="font-semibold">{p.name}</h4>
              <div className="text-xl font-bold">
                {nf.format(p.priceMonthly)} FCFA
              </div>

              <button
                className="mt-auto px-3 py-2 rounded-lg bg-orange-600 text-white text-sm"
                disabled={sending}
                onClick={() => requestUpgrade(p)}
              >
                Demander ce plan
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ParametresPlan;
