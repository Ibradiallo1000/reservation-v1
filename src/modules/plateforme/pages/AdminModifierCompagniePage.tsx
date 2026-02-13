// src/pages/AdminModifierCompagniePage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

// Secondary app (pour envoyer le reset sans toucher la session courante)
import { getApp, initializeApp, deleteApp, FirebaseApp } from "firebase/app";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

type Company = {
  nom: string;
  slug?: string;
  email?: string;
  telephone?: string;
  pays?: string;
  status?: "actif" | "inactif";
};

type AdminUser = {
  uid: string;
  displayName?: string;
  email: string;
  phone?: string;
  role: string;
  companyId: string;
};

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const AdminModifierCompagniePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Champs compagnie
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [pays, setPays] = useState("");
  const [status, setStatus] = useState<"actif" | "inactif">("actif");

  // Admin principal (affichage + reset password)
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [resetSending, setResetSending] = useState(false);

  const canSave = useMemo(() => {
    return nom.trim().length >= 2 && slug.trim().length >= 2 && !saving;
  }, [nom, slug, saving]);

  useEffect(() => {
    (async () => {
      try {
        if (!id) return;

        // Compagnie
        const snap = await getDoc(doc(db, "companies", id));
        if (snap.exists()) {
          const d = (snap.data() || {}) as Company;
          setNom(d.nom || "");
          setSlug(d.slug || "");
          setEmail(d.email || "");
          setTelephone(d.telephone || "");
          setPays(d.pays || "");
          setStatus((d.status as any) || "actif");
        }

        // Admin principal (users: role=admin_compagnie & companyId=id)
        const q = query(
          collection(db, "users"),
          where("companyId", "==", id),
          where("role", "==", "admin_compagnie"),
          limit(1)
        );
        const us = await getDocs(q);
        if (!us.empty) {
          const u = { uid: us.docs[0].id, ...(us.docs[0].data() as any) } as AdminUser;
          setAdmin(u);
          setAdminFullName(u.displayName || "");
          setAdminPhone(u.phone || "");
        } else {
          setAdmin(null);
        }
      } catch (err) {
        console.error(err);
        setMessage("Erreur lors du chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // garder un slug propre si l’utilisateur ne le force pas
  useEffect(() => {
    if (!nom) return;
    setSlug((prev) => {
      const auto = slugify(nom);
      if (!prev || prev === slugify(prev)) return auto;
      return prev;
    });
  }, [nom]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !canSave) return;
    setSaving(true);
    setMessage("");
    try {
      // Compagnie
      await updateDoc(doc(db, "companies", id), {
        nom: nom.trim(),
        slug: slug.trim(),
        email: email.trim() || null,
        telephone: telephone.trim() || null,
        pays: pays.trim() || null,
        status,
        updatedAt: serverTimestamp(),
      });

      // Admin (FireStore uniquement : nom + téléphone)
      if (admin) {
        await updateDoc(doc(db, "users", admin.uid), {
          displayName: adminFullName.trim() || null,
          phone: adminPhone.trim() || null,
          updatedAt: serverTimestamp(),
        });
      }

      setMessage("✅ Modifications enregistrées.");
      setTimeout(() => navigate("/admin/compagnies"), 900);
    } catch (err) {
      console.error(err);
      setMessage("❌ Erreur lors de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  // Envoi / renvoi du lien de réinitialisation de mot de passe à l’admin
  async function handleSendAdminReset() {
    if (!admin?.email) {
      setMessage("Email admin introuvable.");
      return;
    }
    setResetSending(true);
    setMessage("");

    let secondary: FirebaseApp | null = null;
    try {
      const primary = getApp();
      secondary = initializeApp(primary.options, "admin-modifier-secondary");
      const auth2 = getAuth(secondary);

      await sendPasswordResetEmail(auth2, admin.email);
      setMessage(`✉️ Lien de réinitialisation envoyé à ${admin.email}.`);
    } catch (err) {
      console.error(err);
      setMessage("❌ Échec de l’envoi du lien de réinitialisation.");
    } finally {
      setResetSending(false);
      if (secondary) await deleteApp(secondary);
    }
  }

  if (loading) return <p className="p-6">Chargement…</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-orange-700">Modifier la compagnie</h1>
        <button
          className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
          onClick={() => navigate("/admin/compagnies")}
        >
          ← Retour
        </button>
      </div>

      {message && <div className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded p-3">{message}</div>}

      <form onSubmit={handleSave} className="grid md:grid-cols-2 gap-5">
        {/* Bloc compagnie */}
        <section className="bg-white border rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-orange-700 mb-3">Infos compagnie</h2>

          <label className="block mb-3">
            <span className="text-sm text-gray-700">Nom *</span>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
            />
          </label>

          <label className="block mb-3">
            <span className="text-sm text-gray-700">Slug *</span>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              required
            />
          </label>

          <label className="block mb-3">
            <span className="text-sm text-gray-700">Email</span>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block mb-3">
            <span className="text-sm text-gray-700">Téléphone</span>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </label>

          <label className="block mb-3">
            <span className="text-sm text-gray-700">Pays</span>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={pays}
              onChange={(e) => setPays(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-700">Statut</span>
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="actif">Actif</option>
              <option value="inactif">Inactif</option>
            </select>
          </label>
        </section>

        {/* Bloc admin principal */}
        <section className="bg-white border rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-orange-700 mb-3">Admin principal</h2>

          {admin ? (
            <>
              <label className="block mb-3">
                <span className="text-sm text-gray-700">Nom complet</span>
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                />
              </label>

              <label className="block mb-3">
                <span className="text-sm text-gray-700">Téléphone</span>
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                />
              </label>

              <label className="block mb-4">
                <span className="text-sm text-gray-700">Email (lecture seule)</span>
                <input
                  className="mt-1 w-full border rounded px-3 py-2 bg-gray-100"
                  value={admin.email}
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">
                  Pour changer l’email, passer par la console Firebase (ou une Cloud Function d’admin).
                </p>
              </label>

              <button
                type="button"
                onClick={handleSendAdminReset}
                disabled={resetSending}
                className={`px-3 py-2 rounded text-white ${
                  resetSending ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {resetSending ? "Envoi en cours…" : "Envoyer le lien de réinitialisation"}
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              Aucun admin principal trouvé pour cette compagnie.
            </p>
          )}
        </section>

        <div className="md:col-span-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin/compagnies")}
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className={`px-5 py-2 rounded text-white ${
              canSave ? "bg-green-600 hover:bg-green-700" : "bg-gray-400"
            }`}
          >
            {saving ? "Enregistrement…" : "Sauvegarder"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminModifierCompagniePage;
