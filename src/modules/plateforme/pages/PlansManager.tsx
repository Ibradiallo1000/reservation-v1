// src/modules/plateforme/pages/PlansManager.tsx
// Dual-revenue plan model: monthly subscription + digital channel fee
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
import { Button } from "@/shared/ui/button";
import { CheckCircle2, Shield, Star, Zap, Crown, Building2 } from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "@/shared/utils/formatCurrency";

/* ====================================================================
   TYPES
==================================================================== */
type SupportLevel = "basic" | "standard" | "priority" | "premium" | "enterprise";

type Plan = {
  id?: string;
  name: string;
  priceMonthly: number;
  quotaReservations: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  supportLevel: SupportLevel;
  isTrial?: boolean;
  trialDurationDays?: number;
  brandingLocked?: boolean;
  // All plans include all features – no conditional toggles
  features: {
    publicPage: true;
    onlineBooking: true;
    guichet: true;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
};

const EMPTY: Plan = {
  name: "",
  priceMonthly: 0,
  quotaReservations: 0,
  digitalFeePercent: 0,
  feeGuichet: 0,
  minimumMonthly: 0,
  maxAgences: 1,
  supportLevel: "basic",
  isTrial: false,
  trialDurationDays: 0,
  brandingLocked: false,
  features: { publicPage: true, onlineBooking: true, guichet: true },
};

/* ====================================================================
   CONSTANTS
==================================================================== */
const nf = new Intl.NumberFormat("fr-FR");

const SUPPORT_LABELS: Record<SupportLevel, { label: string; color: string }> = {
  basic: { label: "Basic", color: "bg-gray-100 text-gray-700" },
  standard: { label: "Standard", color: "bg-blue-100 text-blue-700" },
  priority: { label: "Prioritaire", color: "bg-amber-100 text-amber-700" },
  premium: { label: "Premium", color: "bg-purple-100 text-purple-700" },
  enterprise: { label: "Enterprise", color: "bg-indigo-100 text-indigo-700" },
};

const SUPPORT_ICONS: Record<SupportLevel, React.ReactNode> = {
  basic: <Shield className="h-3.5 w-3.5" />,
  standard: <Shield className="h-3.5 w-3.5" />,
  priority: <Star className="h-3.5 w-3.5" />,
  premium: <Zap className="h-3.5 w-3.5" />,
  enterprise: <Crown className="h-3.5 w-3.5" />,
};

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--btn-primary,#FF6600)] focus:outline-none focus:ring-2 focus:ring-[var(--btn-primary,#FF6600)]/20 disabled:opacity-50";

const selectClass = `${inputClass} appearance-none`;

/* ====================================================================
   COMPONENT
==================================================================== */
export default function PlansManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan>(EMPTY);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const q = query(collection(db, "plans"), orderBy("priceMonthly", "asc"));
      const snap = await getDocs(q);

      const rows = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;

        return {
          id: d.id,
          name: (x.name as string) ?? (x.nom as string) ?? "",
          priceMonthly: Number(x.priceMonthly) || 0,
          quotaReservations: Number(x.quotaReservations) || 0,
          digitalFeePercent: Number(x.digitalFeePercent) || 0,
          feeGuichet: Number(x.feeGuichet) || 0,
          minimumMonthly: Number(x.minimumMonthly) || 0,
          maxAgences: Number(x.maxAgences ?? x.maxAgencies) || 1,
          supportLevel: (x.supportLevel as SupportLevel) || "basic",
          isTrial: Boolean(x.isTrial),
          trialDurationDays: Number(x.trialDurationDays) || 0,
          brandingLocked: Boolean(x.brandingLocked),
          // All features always true in new model
          features: {
            publicPage: true as const,
            onlineBooking: true as const,
            guichet: true as const,
          },
        } satisfies Plan;
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
      await dbReady;
      await load();
    })();
  }, []);

  const isEdit = useMemo(() => Boolean(editing.id), [editing.id]);

  const validate = (p: Plan) => {
    if (!p.name.trim()) return "Le nom du plan est requis.";
    if (p.digitalFeePercent < 0 || p.digitalFeePercent > 100) return "Le frais digital doit être entre 0 et 100%.";
    return "";
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: editing.name.trim(),
        priceMonthly: Number(editing.priceMonthly) || 0,
        quotaReservations: Number(editing.quotaReservations) || 0,
        digitalFeePercent: Number(editing.digitalFeePercent) || 0,
        feeGuichet: Number(editing.feeGuichet) || 0,
        minimumMonthly: Number(editing.minimumMonthly) || 0,
        maxAgences: Number(editing.maxAgences) || 0,
        supportLevel: editing.supportLevel || "basic",
        isTrial: Boolean(editing.isTrial),
        trialDurationDays: editing.isTrial ? (Number(editing.trialDurationDays) || 30) : 0,
        brandingLocked: Boolean(editing.brandingLocked),
        // All features always true
        features: { publicPage: true, onlineBooking: true, guichet: true },
        updatedAt: serverTimestamp(),
      };

      const err = validate(editing);
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
      setEditing(EMPTY);
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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plans & Tarifs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Modèle dual : abonnement mensuel + frais canal digital (% sur réservations en ligne)
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing(EMPTY)}>
          + Nouveau plan
        </Button>
      </div>

      {/* ── Plan Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => {
          const support = SUPPORT_LABELS[p.supportLevel] ?? SUPPORT_LABELS.basic;
          return (
            <div
              key={p.id}
              className="rounded-xl border border-gray-200 shadow-sm p-5 bg-white flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg text-gray-900">{p.name}</h3>
                    {p.isTrial && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Essai
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {p.priceMonthly === 0 ? (
                      <span className="text-green-600">Gratuit</span>
                    ) : (
                      <>
                        {formatCurrency(p.priceMonthly)}
                        <span className="text-sm font-normal text-gray-500">/mois</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${support.color}`}>
                  {SUPPORT_ICONS[p.supportLevel]}
                  {support.label}
                </span>
              </div>

              {/* Key metrics */}
              <div className="space-y-2 text-sm text-gray-700 flex-1">
                <div className="flex justify-between">
                  <span>Agences max</span>
                  <strong>{p.maxAgences === 0 ? "Illimité" : p.maxAgences}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Quota réservations / mois</span>
                  <strong>{p.quotaReservations === 0 ? "Illimité" : nf.format(p.quotaReservations)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--btn-primary,#FF6600)] font-medium">Frais canal digital</span>
                  <strong className="text-[var(--btn-primary,#FF6600)]">{p.digitalFeePercent}%</strong>
                </div>
                {p.feeGuichet > 0 && (
                  <div className="flex justify-between">
                    <span>Frais guichet</span>
                    <strong>{formatCurrency(p.feeGuichet)}/billet</strong>
                  </div>
                )}
                {p.isTrial && p.trialDurationDays && p.trialDurationDays > 0 && (
                  <div className="flex justify-between">
                    <span>Durée essai</span>
                    <strong>{p.trialDurationDays} jours</strong>
                  </div>
                )}
                {p.brandingLocked && (
                  <div className="text-xs text-amber-600 font-medium mt-1">
                    Branding Teliya verrouillé
                  </div>
                )}
              </div>

              {/* Included features */}
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Gestion interne
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Page publique
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Réservation en ligne
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Guichet
                </span>
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>
                  Éditer
                </Button>
                <Button variant="danger" size="sm" onClick={() => p.id && onDelete(p.id)}>
                  Supprimer
                </Button>
              </div>
            </div>
          );
        })}
        {plans.length === 0 && (
          <div className="text-sm text-gray-500 col-span-full">
            Aucun plan créé pour le moment.
          </div>
        )}
      </div>

      {/* ── Plan Form ── */}
      <form
        onSubmit={onSave}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6"
      >
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-gray-600" />
          {isEdit ? "Modifier le plan" : "Créer un plan"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-gray-700">Nom du plan</label>
            <input
              className={inputClass}
              placeholder="Trial, Starter, Growth, Pro…"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>

          {/* Price */}
          <div>
            <label className="text-sm font-medium text-gray-700">Prix mensuel ({getCurrencySymbol()})</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={editing.priceMonthly}
              onChange={(e) => setEditing({ ...editing, priceMonthly: Number(e.target.value) })}
            />
          </div>

          {/* Max agencies */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Agences maximum <span className="text-xs text-gray-400">(0 = illimité)</span>
            </label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={editing.maxAgences}
              onChange={(e) => setEditing({ ...editing, maxAgences: Number(e.target.value) })}
            />
          </div>

          {/* Quota */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Quota réservations / mois <span className="text-xs text-gray-400">(0 = illimité)</span>
            </label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={editing.quotaReservations}
              onChange={(e) => setEditing({ ...editing, quotaReservations: Number(e.target.value) })}
            />
          </div>

          {/* Digital fee */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Frais canal digital (%)
            </label>
            <input
              className={inputClass}
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={editing.digitalFeePercent}
              onChange={(e) => setEditing({ ...editing, digitalFeePercent: Number(e.target.value) })}
            />
            <p className="text-xs text-gray-400 mt-1">Pourcentage prélevé sur chaque réservation en ligne</p>
          </div>

          {/* Guichet fee */}
          <div>
            <label className="text-sm font-medium text-gray-700">Frais guichet ({getCurrencySymbol()} / billet)</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={editing.feeGuichet}
              onChange={(e) => setEditing({ ...editing, feeGuichet: Number(e.target.value) })}
            />
          </div>

          {/* Minimum monthly */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Minimum mensuel ({getCurrencySymbol()}) <span className="text-xs text-gray-400">(0 = aucun)</span>
            </label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={editing.minimumMonthly}
              onChange={(e) => setEditing({ ...editing, minimumMonthly: Number(e.target.value) })}
            />
          </div>

          {/* Support level */}
          <div>
            <label className="text-sm font-medium text-gray-700">Niveau de support</label>
            <select
              className={selectClass}
              value={editing.supportLevel}
              onChange={(e) => setEditing({ ...editing, supportLevel: e.target.value as SupportLevel })}
            >
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="priority">Prioritaire</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          {/* Trial toggle + duration */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                className="rounded"
                checked={editing.isTrial ?? false}
                onChange={(e) => setEditing({
                  ...editing,
                  isTrial: e.target.checked,
                  trialDurationDays: e.target.checked ? 30 : 0,
                })}
              />
              Plan d'essai (trial)
            </label>
            {editing.isTrial && (
              <div>
                <label className="text-xs text-gray-500">Durée (jours)</label>
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  value={editing.trialDurationDays || 30}
                  onChange={(e) => setEditing({ ...editing, trialDurationDays: Number(e.target.value) })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Branding locked */}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="rounded"
            checked={editing.brandingLocked ?? false}
            onChange={(e) => setEditing({ ...editing, brandingLocked: e.target.checked })}
          />
          Branding Teliya verrouillé (le CEO ne peut pas personnaliser le thème)
        </label>

        {/* All features included notice */}
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          <strong>Note :</strong> Tous les plans incluent désormais : gestion interne, page publique, réservation en ligne, guichet et tableau de bord.
          Les plans se différencient par le prix, les quotas et le frais canal digital.
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer le plan"}
          </Button>
          {isEdit && (
            <Button type="button" variant="secondary" onClick={() => setEditing(EMPTY)}>
              Annuler
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
