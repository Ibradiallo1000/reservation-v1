import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Link, useNavigate, useParams } from "react-router-dom";

/* =========================
   Types
========================= */
type PlanDoc = {
  name: string;
  priceMonthly: number;
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

type PlanOption = {
  id: string;
  name: string;
  priceMonthly: number;
};

/* =========================
   Utils
========================= */
const nf = new Intl.NumberFormat("fr-FR");

function slugify(value: string) {
  return value
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
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  /* -------- Compagnie -------- */
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [pays, setPays] = useState("");
  const [status, setStatus] = useState<"actif" | "inactif">("actif");

  /* -------- Admin principal -------- */
  const [adminEmail, setAdminEmail] = useState("");

  /* -------- Plans -------- */
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanDoc | null>(null);

  /* -------- UI -------- */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<null | { type: "info" | "error"; text: string }>(null);

  /* =========================
     Charger plans
  ========================= */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, "plans"), orderBy("priceMonthly", "asc"))
      );
      setPlans(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          priceMonthly: d.data().priceMonthly,
        }))
      );
    })();
  }, []);

  /* =========================
     Charger compagnie (édition)
  ========================= */
  useEffect(() => {
    if (!isEdit) {
      setLoading(false);
      return;
    }

    (async () => {
      const snap = await getDoc(doc(db, "companies", id!));
      if (!snap.exists()) {
        navigate("/admin/compagnies");
        return;
      }

      const d = snap.data();
      setNom(d.nom ?? "");
      setSlug(d.slug ?? "");
      setEmail(d.email ?? "");
      setTelephone(d.telephone ?? "");
      setPays(d.pays ?? "");
      setStatus(d.status ?? "actif");
      setSelectedPlanId(d.planId ?? "");
      setAdminEmail(d.adminEmail ?? "");
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  /* =========================
     Charger plan sélectionné
  ========================= */
  useEffect(() => {
    if (!selectedPlanId) {
      setSelectedPlan(null);
      return;
    }

    (async () => {
      const snap = await getDoc(doc(db, "plans", selectedPlanId));
      setSelectedPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
    })();
  }, [selectedPlanId]);

  /* =========================
     Slug auto
  ========================= */
  useEffect(() => {
    if (!isEdit && nom) setSlug(slugify(nom));
  }, [nom, isEdit]);

  const canSubmit = useMemo(
    () => nom && slug && selectedPlan && !saving,
    [nom, slug, selectedPlan, saving]
  );

  /* =========================
     Enregistrement
  ========================= */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedPlan) return;

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
  nom: nom.trim(),
  slug: slug.trim(),
  email: email.trim() || null,
  telephone: telephone.trim() || null,
  pays: pays.trim() || null,
  status,
  adminEmail: adminEmail.trim() || null,

  planId: selectedPlanId,
  plan: selectedPlan.name,

  commissionOnline: selectedPlan.commissionOnline ?? 0,
  feeGuichet: selectedPlan.feeGuichet ?? 0,
  minimumMonthly: selectedPlan.minimumMonthly ?? 0,
  maxAgences: selectedPlan.maxAgences ?? 0,

  publicPageEnabled: selectedPlan.features?.publicPage ?? false,
  onlineBookingEnabled: selectedPlan.features?.onlineBooking ?? false,
  guichetEnabled: selectedPlan.features?.guichet ?? false,

  updatedAt: serverTimestamp(),
};

      let companyId = id;

      if (isEdit) {
        await updateDoc(doc(db, "companies", id!), payload);
      } else {
        const ref = await addDoc(collection(db, "companies"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        companyId = ref.id;

        /* =========================
           INVITATION AUTO (CLÉ DU SYSTÈME)
        ========================= */
        if (adminEmail.trim()) {
          const invitationRef = await addDoc(collection(db, "invitations"), {
            email: adminEmail.trim().toLowerCase(),
            role: "admin_compagnie",
            companyId,
            status: "pending",
            createdAt: serverTimestamp(),
          });

          // 🔗 liaison visible dans la liste
          await updateDoc(doc(db, "companies", companyId), {
            invitationId: invitationRef.id,
          });
        }
      }

      navigate("/admin/compagnies");
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: "Erreur lors de l’enregistrement de la compagnie.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Chargement…</div>;
async function testMinimalFirestore() {
  try {
    console.log("🧪 Test minimal Firestore – START");
    const ref = await addDoc(collection(db, "companies"), {
      test: "ping",
      createdAt: serverTimestamp(),
    });
    console.log("✅ Test minimal OK – id:", ref.id);
  } catch (e: any) {
    console.error("❌ Test minimal ÉCHEC", {
      code: e?.code,
      message: e?.message,
    });
  }
}

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-orange-700 mb-4">
        {isEdit ? "Modifier la compagnie" : "Ajouter une compagnie"}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom *" />
        <input className="input" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="Slug *" />
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email compagnie" />
        <input className="input" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" />
        <input className="input" value={pays} onChange={(e) => setPays(e.target.value)} placeholder="Pays" />

        <input
          className="input"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="Email admin principal (invitation)"
        />

        <div>
          <label className="block text-sm font-medium mb-1">Plan *</label>
          <select
            className="input"
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            required
          >
            <option value="">— Sélectionner un plan —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} • {nf.format(p.priceMonthly)} FCFA
              </option>
            ))}
          </select>
        </div>

        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
        </select>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <Link to="/admin/compagnies" className="px-4 py-2 border rounded-lg">
            Annuler
          </Link>
        </div>
<button
  type="button"
  onClick={testMinimalFirestore}
  className="bg-blue-600 text-white px-4 py-2 rounded-lg"
>
  Test minimal Firestore
</button>

        {message && (
          <p className={message.type === "error" ? "text-red-600" : "text-green-600"}>
            {message.text}
          </p>
        )}
      </form>
    </div>
  );
};

export default AdminCompagnieAjouterPage;
