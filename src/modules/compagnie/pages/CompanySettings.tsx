// ✅ src/pages/company/CompanySettingsPlan.tsx
import React, { useEffect, useState, useMemo } from "react";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";

type Company = {
  id: string;
  nom?: string;
  plan?: string;
  maxAgences?: number;
  maxUsers?: number;
  commissionOnline?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  guichetEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  publicPageEnabled?: boolean;
};

type PlanDef = {
  id: string; // ex: "free", "starter", "pro"
  label: string; // ex: "Starter"
  description?: string;
  maxAgences: number;
  maxUsers: number;
  guichetEnabled: boolean;
  onlineBookingEnabled: boolean;
  publicPageEnabled: boolean;
  commissionOnline: number; // 0.02 = 2%
  feeGuichet: number; // en FCFA
  minimumMonthly: number; // en FCFA
};

const money = (n = 0) => Intl.NumberFormat("fr-FR").format(n) + " FCFA";
const pct = (n = 0) =>
  Intl.NumberFormat("fr-FR", {
    style: "percent",
    minimumFractionDigits: 0,
  }).format(n);

const CompanySettingsPlan: React.FC = () => {
  const { companyId, user } = useAuth(); // ✅ companyId est string | null
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      setPlans([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        // 1) Lire company
        const snap = await getDoc(doc(db, "companies", companyId));
        if (snap.exists()) {
          setCompany({ id: snap.id, ...(snap.data() as any) });
        } else {
          setCompany(null);
        }

        // 2) Lire catalogue des plans
        const plansSnap = await getDoc(doc(db, "_meta", "plansCatalog"));
        if (plansSnap.exists()) {
          setPlans(plansSnap.data()?.items || []);
        } else {
          // fallback local
          setPlans([
            {
              id: "free",
              label: "Free",
              description: "Démarrage — vitrine + guichet local.",
              maxAgences: 1,
              maxUsers: 3,
              guichetEnabled: true,
              onlineBookingEnabled: false,
              publicPageEnabled: true,
              commissionOnline: 0.02,
              feeGuichet: 100,
              minimumMonthly: 0,
            },
            {
              id: "starter",
              label: "Starter",
              description: "Petites structures multi-agences.",
              maxAgences: 3,
              maxUsers: 10,
              guichetEnabled: true,
              onlineBookingEnabled: true,
              publicPageEnabled: true,
              commissionOnline: 0.02,
              feeGuichet: 50,
              minimumMonthly: 25000,
            },
            {
              id: "pro",
              label: "Pro",
              description: "Croissance + API + support prioritaire.",
              maxAgences: 10,
              maxUsers: 50,
              guichetEnabled: true,
              onlineBookingEnabled: true,
              publicPageEnabled: true,
              commissionOnline: 0.015,
              feeGuichet: 0,
              minimumMonthly: 75000,
            },
          ]);
        }
      } catch (err) {
        console.error("Erreur chargement plan compagnie:", err);
        setCompany(null);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === company?.plan) || null,
    [plans, company?.plan]
  );

  // ======= Garde-fous =======
  if (!companyId) {
    return <p className="text-sm text-gray-600">Aucune compagnie active.</p>;
  }
  if (loading) {
    return <p className="text-sm text-gray-600">Chargement…</p>;
  }
  if (!company) {
    return <p className="text-sm text-gray-600">Compagnie introuvable.</p>;
  }

  // ✅ Ici TS sait que company n’est plus null
  async function requestUpgrade(planId: string) {
    if (!companyId) return;
    if (sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, "companies", companyId, "planRequests"), {
       from: company!.plan || null,
        planWanted: planId,
        status: "pending",
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });
      alert("Demande envoyée. L’équipe validera la mise à niveau.");
    } catch (e: any) {
      console.error(e);
      alert("Erreur lors de l’envoi de la demande.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Carte Plan actuel */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="text-lg font-semibold mb-1">Plan actuel</h3>
        <p className="text-gray-600 mb-4">
          {currentPlan
            ? `${currentPlan.label} (${company.plan})`
            : company.plan || "non défini"}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Agences</p>
            <p className="font-semibold">{company.maxAgences ?? "—"} max</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Utilisateurs</p>
            <p className="font-semibold">{company.maxUsers ?? "—"} max</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Commission en ligne</p>
            <p className="font-semibold">{pct(company.commissionOnline ?? 0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Frais guichet</p>
            <p className="font-semibold">{money(company.feeGuichet ?? 0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Minimum mensuel</p>
            <p className="font-semibold">{money(company.minimumMonthly ?? 0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Modules</p>
            <p className="font-semibold">
              {company.guichetEnabled ? "Guichet" : "—"} ·{" "}
              {company.onlineBookingEnabled ? "Réservation en ligne" : "—"} ·{" "}
              {company.publicPageEnabled ? "Vitrine publique" : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Catalogue (lecture seule + demande) */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="text-lg font-semibold mb-4">Changer de plan</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.id === company.plan;
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-4 ${
                  isCurrent
                    ? "ring-2 ring-orange-500 border-orange-200"
                    : ""
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <h4 className="font-semibold">{p.label}</h4>
                  <span className="text-xs text-gray-500">{p.id}</span>
                </div>
                {p.description && (
                  <p className="text-sm text-gray-600 mt-1">{p.description}</p>
                )}

                <ul className="mt-3 text-sm text-gray-700 space-y-1">
                  <li>Agences max: <b>{p.maxAgences}</b></li>
                  <li>Utilisateurs max: <b>{p.maxUsers}</b></li>
                  <li>Commission en ligne: <b>{pct(p.commissionOnline)}</b></li>
                  <li>Frais guichet: <b>{money(p.feeGuichet)}</b></li>
                  <li>Minimum mensuel: <b>{money(p.minimumMonthly)}</b></li>
                  <li>
                    Modules:{" "}
                    <b>
                      {p.guichetEnabled ? "Guichet" : "—"} ·{" "}
                      {p.onlineBookingEnabled ? "Online" : "—"} ·{" "}
                      {p.publicPageEnabled ? "Vitrine" : "—"}
                    </b>
                  </li>
                </ul>

                <button
                  disabled={isCurrent || sending}
                  onClick={() => requestUpgrade(p.id)}
                  className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-medium
                    ${
                      isCurrent
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-orange-600 text-white hover:bg-orange-700"
                    }`}
                >
                  {isCurrent ? "Plan actuel" : "Demander ce plan"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CompanySettingsPlan;
