import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "@/firebaseConfig";
import {
  collection, doc, getDoc, getDocs, serverTimestamp, setDoc
} from "firebase/firestore";

type Company = {
  id?: string;
  nom?: string;
  plan?: string;
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;
  commissionOnline?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  maxAgences?: number;
  maxUsers?: number;
  updatedAt?: any;
};

type PlanLite = { id: string; name: string };

export default function AdminCompanyDetail() {
  const { companyId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [c, setC] = useState<Company>({});
  const [plans, setPlans] = useState<PlanLite[]>([]);

  useEffect(() => {
    (async () => {
      if (!companyId) return;
      const [csnap, psnap] = await Promise.all([
        getDoc(doc(db, "companies", companyId)),
        getDocs(collection(db, "plans")),
      ]);
      if (csnap.exists()) setC({ id: csnap.id, ...(csnap.data() as any) });
      setPlans(psnap.docs.map(d => ({ id: d.id, name: (d.data() as any).name })));
      setLoading(false);
    })();
  }, [companyId]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    try {
      const patch: Partial<Company> = {
        plan: c.plan || "free",
        publicPageEnabled: !!c.publicPageEnabled,
        onlineBookingEnabled: !!c.onlineBookingEnabled,
        guichetEnabled: !!c.guichetEnabled,
        commissionOnline: Number(c.commissionOnline) || 0,
        feeGuichet: Number(c.feeGuichet) || 0,
        minimumMonthly: Number(c.minimumMonthly) || 0,
        maxAgences: Number(c.maxAgences) || 0,
        maxUsers: Number(c.maxUsers) || 0,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "companies", companyId), patch, { merge: true });
      alert("Modifications enregistrées.");
    } finally {
      setSaving(false);
    }
  };

  const planOptions = useMemo(
    () => plans.sort((a, b) => a.name.localeCompare(b.name)),
    [plans]
  );

  if (loading) return <div className="p-6">Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">
        {c.nom || "Compagnie"} — Mon plan & fonctionnalités
      </h1>

      <form onSubmit={onSave} className="bg-white rounded-xl border shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Plan</label>
          <select
            className="border rounded p-2 w-full"
            value={c.plan || ""}
            onChange={(e) => setC({ ...c, plan: e.target.value })}
          >
            <option value="">— Sélectionner —</option>
            {planOptions.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-6 mt-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!c.publicPageEnabled}
                   onChange={e => setC({ ...c, publicPageEnabled: e.target.checked })}/>
            Page publique
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!c.onlineBookingEnabled}
                   onChange={e => setC({ ...c, onlineBookingEnabled: e.target.checked })}/>
            Réservation en ligne
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!c.guichetEnabled}
                   onChange={e => setC({ ...c, guichetEnabled: e.target.checked })}/>
            Guichet
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">% commission en ligne (ex: 0.02)</label>
          <input type="number" step="any" className="border rounded p-2 w-full"
            value={c.commissionOnline ?? 0}
            onChange={e => setC({ ...c, commissionOnline: Number(e.target.value) })}/>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Frais guichet</label>
          <input type="number" className="border rounded p-2 w-full"
            value={c.feeGuichet ?? 0}
            onChange={e => setC({ ...c, feeGuichet: Number(e.target.value) })}/>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Minimum mensuel</label>
          <input type="number" className="border rounded p-2 w-full"
            value={c.minimumMonthly ?? 0}
            onChange={e => setC({ ...c, minimumMonthly: Number(e.target.value) })}/>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max agences</label>
          <input type="number" className="border rounded p-2 w-full"
            value={c.maxAgences ?? 0}
            onChange={e => setC({ ...c, maxAgences: Number(e.target.value) })}/>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max utilisateurs</label>
          <input type="number" className="border rounded p-2 w-full"
            value={c.maxUsers ?? 0}
            onChange={e => setC({ ...c, maxUsers: Number(e.target.value) })}/>
        </div>

        <div className="md:col-span-2 flex gap-2">
          <button className="px-3 py-2 rounded bg-orange-600 text-white" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
