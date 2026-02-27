import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "@/firebaseConfig";
import { getCurrencySymbol } from "@/shared/utils/formatCurrency";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import {
  collection, doc, getDoc, getDocs, serverTimestamp, setDoc
} from "firebase/firestore";
import { Button } from "@/shared/ui/button";

type SupportLevel = "basic" | "standard" | "priority" | "premium" | "enterprise";

type Company = {
  id?: string;
  nom?: string;
  plan?: string;
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;
  digitalFeePercent?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  maxAgences?: number;
  maxUsers?: number;
  supportLevel?: SupportLevel;
  planType?: "trial" | "paid";
  subscriptionStatus?: string;
  updatedAt?: unknown;
};

type PlanLite = { id: string; name: string };

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[var(--btn-primary,#FF6600)] focus:outline-none focus:ring-2 focus:ring-[var(--btn-primary,#FF6600)]/20";

export default function AdminCompanyDetail() {
  const isOnline = useOnlineStatus();
  const { companyId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [c, setC] = useState<Company>({});
  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      if (!companyId) return;
      setLoading(true);
      setError(null);
      try {
        const [csnap, psnap] = await Promise.all([
          getDoc(doc(db, "companies", companyId)),
          getDocs(collection(db, "plans")),
        ]);
        if (csnap.exists()) {
          const data = csnap.data() as Record<string, unknown>;
          setC({
            id: csnap.id,
            nom: data.nom as string,
            plan: data.plan as string,
            publicPageEnabled: true,
            onlineBookingEnabled: true,
            guichetEnabled: true,
            digitalFeePercent: Number(data.digitalFeePercent) || 0,
            feeGuichet: Number(data.feeGuichet) || 0,
            minimumMonthly: Number(data.minimumMonthly) || 0,
            maxAgences: Number(data.maxAgences) || 0,
            maxUsers: Number(data.maxUsers) || 0,
            supportLevel: (data.supportLevel as SupportLevel) || "basic",
            planType: (data.planType as "trial" | "paid") || "paid",
            subscriptionStatus: (data.subscriptionStatus as string) || "active",
          });
        }
        setPlans(psnap.docs.map(d => ({
          id: d.id,
          name: (d.data() as Record<string, unknown>).name as string,
        })));
      } catch (e) {
        console.error(e);
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger la compagnie."
            : "Erreur lors du chargement de la compagnie."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, isOnline, reloadKey]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    try {
      const digitalFee = Number(c.digitalFeePercent) || 0;
      const patch: Record<string, unknown> = {
        plan: c.plan || "free",
        publicPageEnabled: true,
        onlineBookingEnabled: true,
        guichetEnabled: true,
        digitalFeePercent: digitalFee,
        feeGuichet: Number(c.feeGuichet) || 0,
        minimumMonthly: Number(c.minimumMonthly) || 0,
        maxAgences: Number(c.maxAgences) || 0,
        maxUsers: Number(c.maxUsers) || 0,
        supportLevel: c.supportLevel || "basic",
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "companies", companyId), patch, { merge: true });
      alert("Modifications enregistrees.");
    } finally {
      setSaving(false);
    }
  };

  const planOptions = useMemo(
    () => plans.sort((a, b) => a.name.localeCompare(b.name)),
    [plans]
  );

  if (loading) {
    return <PageLoadingState />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: la configuration peut être incomplète." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <h1 className="text-2xl font-bold text-gray-900">
        {c.nom || "Compagnie"} - Plan & Configuration
      </h1>

      <form onSubmit={onSave} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-gray-700">Plan</label>
          <select
            className={`${inputClass} appearance-none mt-1`}
            value={c.plan || ""}
            onChange={(e) => setC({ ...c, plan: e.target.value })}
          >
            <option value="">- Selectionner -</option>
            {planOptions.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          <strong>Note :</strong> Tous les modules sont inclus dans tous les plans (page publique, reservation en ligne, guichet, dashboard).
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Frais canal digital (%)</label>
          <input type="number" step="0.1" min="0" className={`${inputClass} mt-1`}
            value={c.digitalFeePercent ?? 0}
            onChange={e => setC({ ...c, digitalFeePercent: Number(e.target.value) })}/>
          <p className="text-xs text-gray-400 mt-1">Pourcentage preleve sur les reservations en ligne</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Frais guichet ({getCurrencySymbol()} / billet)</label>
          <input type="number" min="0" className={`${inputClass} mt-1`}
            value={c.feeGuichet ?? 0}
            onChange={e => setC({ ...c, feeGuichet: Number(e.target.value) })}/>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Minimum mensuel ({getCurrencySymbol()})</label>
          <input type="number" min="0" className={`${inputClass} mt-1`}
            value={c.minimumMonthly ?? 0}
            onChange={e => setC({ ...c, minimumMonthly: Number(e.target.value) })}/>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">
            Max agences <span className="text-xs text-gray-400">(0 = illimite)</span>
          </label>
          <input type="number" min="0" className={`${inputClass} mt-1`}
            value={c.maxAgences ?? 0}
            onChange={e => setC({ ...c, maxAgences: Number(e.target.value) })}/>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Max utilisateurs</label>
          <input type="number" min="0" className={`${inputClass} mt-1`}
            value={c.maxUsers ?? 0}
            onChange={e => setC({ ...c, maxUsers: Number(e.target.value) })}/>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Niveau de support</label>
          <select
            className={`${inputClass} appearance-none mt-1`}
            value={c.supportLevel || "basic"}
            onChange={(e) => setC({ ...c, supportLevel: e.target.value as SupportLevel })}
          >
            <option value="basic">Basic</option>
            <option value="standard">Standard</option>
            <option value="priority">Prioritaire</option>
            <option value="premium">Premium</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        <div className="md:col-span-2 flex gap-2">
          <Button variant="primary" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
