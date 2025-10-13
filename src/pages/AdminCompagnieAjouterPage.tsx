// src/pages/AdminCompagnieAjouterPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db, functions } from "@/firebaseConfig"; // assure-toi que 'functions' est exporté depuis firebaseConfig
import { httpsCallable } from "firebase/functions";
import { useNavigate, Link } from "react-router-dom";

/* =========================
   Types
========================= */
type PlanDoc = {
  name: string;
  priceMonthly: number;
  quotaReservations?: number;
  overagePerReservation?: number;
  commissionOnline: number; // 0.01 = 1%
  feeGuichet: number;       // FCFA / billet
  minimumMonthly: number;   // FCFA
  maxAgences: number;
  features: { publicPage: boolean; onlineBooking: boolean; guichet: boolean };
};

type PlanOption = { id: string; name: string; priceMonthly?: number };

/* =========================
   Utils
========================= */
const nf = new Intl.NumberFormat("fr-FR");

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/* =========================
   Component
========================= */
const AdminCompagnieAjouterPage: React.FC = () => {
  const navigate = useNavigate();

  // ------- state formulaire (compagnie)
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [pays, setPays] = useState("");

  // ------- state formulaire (admin principal)
  const [adminNom, setAdminNom] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminTelephone, setAdminTelephone] = useState("");

  // ------- state plans
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<PlanDoc | null>(null);

  // ------- ui
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<null | { type: "info" | "error"; text: string }>(null);

  /* Charger la liste des plans */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "plans"), orderBy("priceMonthly", "asc")));
        const opts: PlanOption[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: String(data?.name ?? d.id),
            priceMonthly: Number(data?.priceMonthly ?? 0),
          };
        });
        setPlans(opts);
      } catch (e) {
        console.error(e);
        setMessage({ type: "error", text: "Erreur lors du chargement des plans." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* Charger le plan sélectionné pour le récap */
  useEffect(() => {
    (async () => {
      if (!selectedPlanId) {
        setSelectedPlan(null);
        return;
      }
      try {
        const pSnap = await getDoc(doc(db, "plans", selectedPlanId));
        setSelectedPlan(pSnap.exists() ? (pSnap.data() as PlanDoc) : null);
      } catch (e) {
        console.error(e);
        setSelectedPlan(null);
      }
    })();
  }, [selectedPlanId]);

  /* Slug auto à partir du nom tant que l’utilisateur ne force pas le champ */
  useEffect(() => {
    if (!nom) return;
    setSlug((prev) => {
      const auto = slugify(nom);
      if (!prev || prev === slugify(prev)) return auto;
      return prev;
    });
  }, [nom]);

  /* Validation */
  const canSubmit = useMemo(() => {
    const base =
      nom.trim().length >= 2 &&
      slug.trim().length >= 2 &&
      selectedPlanId &&
      !!selectedPlan &&
      adminNom.trim().length >= 3 &&
      /\S+@\S+\.\S+/.test(adminEmail) &&
      !saving;

    return base;
  }, [nom, slug, selectedPlanId, selectedPlan, adminNom, adminEmail, saving]);

  /* Soumission : appelle la Cloud Function createCompanyAndAdmin */
  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedPlan) return;

    setSaving(true);
    setMessage(null);

    const payload = {
      company: {
        nom: nom.trim(),
        slug: slug.trim(),
        email: email.trim() || null,
        telephone: telephone.trim() || null,
        pays: pays.trim() || null,
        planId: selectedPlanId,
      },
      admin: {
        fullName: adminNom.trim(),
        email: adminEmail.trim(),
        telephone: adminTelephone.trim() || null,
      },
      sendResetEmail: true,
    };

    try {
      const cf = httpsCallable(functions, "createCompanyAndAdmin");
      await cf(payload);

      setMessage({ type: "info", text: "Compagnie créée. L’email de réinitialisation a été envoyé à l’admin." });
      setTimeout(() => {
        navigate("/admin/compagnies", { replace: true, state: { created: true } });
      }, 700);
    } catch (e: any) {
      console.error(e);
      const txt =
        (e?.message as string)?.includes("auth/operation-not-allowed")
          ? "Auth: Email/Password n’est pas activé dans Firebase Authentication."
          : "Erreur lors de la création. Vérifiez les champs et réessayez.";
      setMessage({ type: "error", text: txt });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse h-6 w-40 rounded bg-gray-200 mb-4" />
        <div className="animate-pulse h-32 w-full rounded bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="text-sm text-gray-500">
          <Link to="/admin/compagnies" className="hover:underline">Compagnies</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">Ajouter</span>
        </div>
        <h1 className="text-2xl font-extrabold mt-1 text-orange-700">Ajouter une compagnie</h1>
        <p className="text-gray-600 mt-1">
          Créez la compagnie, assignez un <b>plan</b>, et définissez l’<b>administrateur principal</b>.
          Un mail de réinitialisation du mot de passe sera envoyé automatiquement.
        </p>
      </div>

      {message && (
        <div
          className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleCreateCompany} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Col 1 : Infos compagnie */}
        <section className="lg:col-span-2">
          <div className="rounded-2xl border shadow-sm bg-white">
            <div className="border-b px-5 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Infos compagnie</h2>
              <span className="text-xs text-gray-400">Champs * requis</span>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-700">Nom *</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex: Diallo Trans"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-700">Slug *</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="ex: diallo-trans"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-700">Email</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@exemple.com"
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-700">Téléphone</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="+223 74 00 00 00"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm text-gray-700">Pays</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={pays}
                  onChange={(e) => setPays(e.target.value)}
                  placeholder="Ex: Mali"
                />
              </label>
            </div>
          </div>

          {/* Admin principal */}
          <div className="rounded-2xl border shadow-sm bg-white mt-5">
            <div className="border-b px-5 py-3">
              <h2 className="font-semibold text-gray-800">Admin principal</h2>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-700">Nom complet *</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={adminNom}
                  onChange={(e) => setAdminNom(e.target.value)}
                  placeholder="Ex: Ibrahim Diallo"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-700">Email (admin) *</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="prenom.nom@exemple.com"
                  required
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm text-gray-700">Téléphone (admin)</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={adminTelephone}
                  onChange={(e) => setAdminTelephone(e.target.value)}
                  placeholder="+223 74 00 00 00"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Col 2 : Récap Plan (sticky) */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="rounded-2xl border shadow-sm bg-white">
              <div className="border-b px-5 py-3">
                <h2 className="font-semibold text-gray-800">Plan</h2>
              </div>

              <div className="p-5">
                <label className="block text-sm text-gray-700 font-medium mb-1">
                  Plan (obligatoire)
                </label>
                <select
                  className="border rounded-lg px-3 py-2 w-full"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  required
                >
                  <option value="">— Sélectionner un plan —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.priceMonthly != null ? `• ${nf.format(p.priceMonthly)} FCFA / mois` : ""}
                    </option>
                  ))}
                </select>

                {selectedPlan && (
                  <div className="mt-4 text-sm text-gray-800 rounded-xl border bg-gray-50 p-4">
                    <div className="font-semibold mb-2">Récapitulatif</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Nom</span>
                        <b>{selectedPlan.name}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Mensuel</span>
                        <b>{nf.format(selectedPlan.priceMonthly)} FCFA</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Agences max</span>
                        <b>{selectedPlan.maxAgences}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Commission online</span>
                        <b>{Math.round((selectedPlan.commissionOnline || 0) * 100)}%</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Frais guichet</span>
                        <b>{nf.format(selectedPlan.feeGuichet)} FCFA / billet</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Minimum mensuel</span>
                        <b>{nf.format(selectedPlan.minimumMonthly)} FCFA</b>
                      </div>
                      <div className="pt-2 text-gray-600">
                        Features :{" "}
                        <b>
                          {selectedPlan.features?.publicPage ? "Vitrine" : "—"},{" "}
                          {selectedPlan.features?.onlineBooking ? "Réservation en ligne" : "—"},{" "}
                          {selectedPlan.features?.guichet ? "Guichet" : "—"}
                        </b>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={`flex-1 px-4 py-2.5 rounded-xl text-white shadow-sm transition ${
                  canSubmit
                    ? "bg-orange-600 hover:bg-orange-700"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {saving ? "Création…" : "Créer la compagnie"}
              </button>

              <Link
                to="/admin/compagnies"
                className="px-4 py-2.5 rounded-xl border bg-white hover:bg-gray-50 text-gray-700"
              >
                ← Retour
              </Link>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
};

export default AdminCompagnieAjouterPage;
