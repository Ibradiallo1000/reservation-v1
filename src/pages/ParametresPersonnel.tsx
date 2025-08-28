// src/pages/ParametresPersonnel.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

/** Rôles de création ici (niveau compagnie). Tout le personnel de la compagnie est affiché. */
type CompanyRoleCreate = "admin_compagnie" | "comptable_compagnie";

type AnyRole =
  | "admin_plateforme"
  | "admin_compagnie"
  | "comptable_compagnie"
  | "chef_agence"
  | "comptable_agence"
  | "guichetier"
  | "agent_courrier"
  | string; // tolérant si d’autres rôles existent

interface UserDoc {
  id: string; // uid
  uid: string;
  displayName: string;
  email: string;
  telephone?: string;
  role: AnyRole;
  active?: boolean;
  companyId: string;
  agencyId?: string | null;
  createdAt?: any;
}

interface Agence {
  id: string;
  nomAgence: string;
  companyId: string;
}

/* ===================== VALIDATIONS ===================== */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const phoneRegex = /^\d{8,15}$/;          // 8 à 15 chiffres
const pass6DigitsRegex = /^\d{6}$/;       // mot de passe = 6 chiffres

const toCapitalize = (v: string) =>
  v
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

const isEmpty = (s: string) => !s || s.trim() === "";

/* ===================== COMPOSANT ===================== */
const ParametresPersonnel: React.FC = () => {
  const { user } = useAuth();

  const [allStaff, setAllStaff] = useState<UserDoc[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  /* -------- Formulaire d'ajout (NIVEAU COMPAGNIE) -------- */
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CompanyRoleCreate>("comptable_compagnie");

  /* -------- Édition -------- */
  const [editId, setEditId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editTelephone, setEditTelephone] = useState("");
  const [editRole, setEditRole] = useState<AnyRole>("comptable_compagnie");

  /* ===================== LOAD ===================== */
  const loadAgences = async () => {
    if (!user?.companyId) return;
    const qAg = query(
      collection(db, "agences"),
      where("companyId", "==", user.companyId)
    );
    const snap = await getDocs(qAg);
    const list: Agence[] = snap.docs.map((d) => ({
      id: d.id,
      nomAgence: (d.data() as any).nomAgence,
      companyId: (d.data() as any).companyId,
    }));
    setAgences(list);
  };

  const loadStaff = async () => {
    if (!user?.companyId) return;
    try {
      // On prend TOUS les users de la compagnie (peu importe le rôle/agency)
      const qUsers = query(
        collection(db, "users"),
        where("companyId", "==", user.companyId)
      );
      const snap = await getDocs(qUsers);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as UserDoc))
        // on peut exclure explicitement admin_plateforme si jamais il existe dans la même companyId
        .filter((u) => u.role !== "admin_plateforme")
        .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
      setAllStaff(list);
    } catch (err) {
      console.error("loadStaff err:", err);
      setMessage("❌ Erreur lors du chargement du personnel.");
    }
  };

  useEffect(() => {
    loadAgences();
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyId]);

  const resetForm = () => {
    setDisplayName("");
    setEmail("");
    setTelephone("");
    setPassword("");
    setRole("comptable_compagnie");
  };

  /* ===================== ACTIONS ===================== */

  const validateBeforeAdd = () => {
    const errors: string[] = [];
    if (isEmpty(displayName)) errors.push("le nom complet");
    if (isEmpty(email) || !emailRegex.test(email)) errors.push("un email valide");
    if (isEmpty(telephone) || !phoneRegex.test(telephone))
      errors.push("un téléphone composé de 8 à 15 chiffres");
    if (!pass6DigitsRegex.test(password))
      errors.push("un mot de passe de 6 chiffres");

    if (errors.length) {
      setMessage("⚠️ Merci de renseigner " + errors.join(", ") + ".");
      return false;
    }
    return true;
  };

  const handleAdd = async () => {
    if (!user?.companyId) {
      setMessage("⚠️ Aucune compagnie associée.");
      return;
    }
    if (!validateBeforeAdd()) return;

    setBusy(true);
    setMessage("");

    try {
      const niceName = toCapitalize(displayName);

      // 1) Création Auth (mdp = 6 chiffres)
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      await updateProfile(cred.user, { displayName: niceName });
      const uid = cred.user.uid;

      // 2) Document Firestore /users/{uid} (niveau compagnie)
      const ref = doc(db, "users", uid);
      await setDoc(
        ref,
        {
          uid,
          email: email.trim().toLowerCase(),
          displayName: niceName,
          telephone: telephone.trim(),
          role, // admin_compagnie | comptable_compagnie
          active: true,
          companyId: user.companyId,
          agencyId: null,
          createdAt: Timestamp.now(),
        },
        { merge: true }
      );

      setMessage("✅ Personnel ajouté avec succès.");
      resetForm();
      await loadStaff();
    } catch (err: any) {
      console.error("handleAdd err:", err);
      setMessage(
        err?.code === "auth/email-already-in-use"
          ? "⚠️ Cet email est déjà utilisé."
          : "❌ Ajout impossible. Voir la console."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (m: UserDoc, next: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const ref = doc(db, "users", m.uid);
      await updateDoc(ref, { active: next });
      setAllStaff((prev) => prev.map((x) => (x.uid === m.uid ? { ...x, active: next } : x)));
    } catch (err) {
      console.error("toggleActive err:", err);
      setMessage("❌ Erreur lors du changement de statut.");
    } finally {
      setBusy(false);
    }
  };

  const handleEditStart = (m: UserDoc) => {
    setEditId(m.uid);
    setEditDisplayName(m.displayName || "");
    setEditTelephone(m.telephone || "");
    setEditRole(m.role);
  };

  const handleEditSave = async () => {
    if (!editId) return;

    const niceName = toCapitalize(editDisplayName || "");
    if (isEmpty(niceName)) {
      setMessage("⚠️ Le nom est obligatoire.");
      return;
    }
    if (isEmpty(editTelephone) || !phoneRegex.test(editTelephone)) {
      setMessage("⚠️ Téléphone invalide. 8–15 chiffres.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const ref = doc(db, "users", editId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("User introuvable");

      await updateDoc(ref, {
        displayName: niceName,
        telephone: editTelephone.trim(),
        role: editRole,
      });

      setAllStaff((prev) =>
        prev.map((x) =>
          x.uid === editId
            ? { ...x, displayName: niceName, telephone: editTelephone.trim(), role: editRole }
            : x
        )
      );
      setEditId(null);
    } catch (err) {
      console.error("edit save err:", err);
      setMessage("❌ Erreur lors de la modification.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (m: UserDoc) => {
    const ok = window.confirm(
      `Supprimer définitivement "${m.displayName}" ?\nCette action effacera aussi son compte d'authentification.`
    );
    if (!ok) return;

    setBusy(true);
    setMessage("");

    try {
      // 1) Firestore
      const ref = doc(db, "users", m.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) await deleteDoc(ref);

      // 2) Auth (via Cloud Function adminDeleteUser)
      const functions = getFunctions();
      const fn = httpsCallable(functions, "adminDeleteUser");
      await fn({ uid: m.uid });

      setAllStaff((prev) => prev.filter((x) => x.uid !== m.uid));
      setMessage("✅ Compte supprimé partout.");
    } catch (err) {
      console.error("delete err:", err);
      setMessage("❌ Suppression partielle. Vérifie la console et la Cloud Function.");
    } finally {
      setBusy(false);
    }
  };

  /* ===================== GROUPING (par agence) ===================== */
  const agencesMap = useMemo(() => {
    const m = new Map<string, string>();
    agences.forEach((a) => m.set(a.id, a.nomAgence));
    return m;
  }, [agences]);

  /** regroupe: clé = agencyId || '__company__' */
  const grouped = useMemo(() => {
    const groups: Record<string, UserDoc[]> = {};
    for (const u of allStaff) {
      const key = u.agencyId ? String(u.agencyId) : "__company__";
      if (!groups[key]) groups[key] = [];
      groups[key].push(u);
    }
    // tri interne
    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))
    );
    return groups;
  }, [allStaff]);

  const groupOrder = useMemo(() => {
    const ids = agences.map((a) => a.id);
    return ["__company__", ...ids];
  }, [agences]);

  /* ===================== UI ===================== */

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-6">
        Paramètres de la compagnie — Personnel
      </h1>

      {/* Carte d’ajout (niveau compagnie) */}
      <div className="mb-8 bg-white p-6 rounded-xl shadow-md border">
        <h2 className="text-lg font-semibold mb-4">
          Ajouter un membre (niveau compagnie)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(toCapitalize(e.target.value))}
            placeholder="Nom complet (Ex. Ayoub Diallo)"
            className="border p-3 rounded focus:ring-2"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
            placeholder="Email (ex. nom@domaine.com)"
            type="email"
            className="border p-3 rounded focus:ring-2"
          />
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ""))}
            placeholder="Téléphone (ex. 78953098)"
            inputMode="numeric"
            className="border p-3 rounded focus:ring-2"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CompanyRoleCreate)}
            className="border p-3 rounded focus:ring-2"
          >
            <option value="comptable_compagnie">Comptable (compagnie)</option>
            <option value="admin_compagnie">Admin compagnie</option>
            {/* On ne crée PAS de chef_agence ici : ils sont créés via la page Agences */}
          </select>

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Mot de passe (6 chiffres)"
            type="password"
            className="border p-3 rounded focus:ring-2 md:col-span-2"
          />
        </div>

        <button
          onClick={handleAdd}
          disabled={busy}
          className="w-full py-3 rounded font-semibold text-white transition disabled:opacity-60 bg-orange-600"
        >
          {busy ? "⏳ Traitement..." : "Ajouter l’utilisateur"}
        </button>
        {message && (
          <p className="mt-3 text-center text-sm text-gray-700">{message}</p>
        )}
      </div>

      {/* LISTE groupée par Agence */}
      {groupOrder.map((key) => {
        const items = grouped[key] || [];
        const titre =
          key === "__company__" ? "Niveau compagnie" : `Agence : ${agencesMap.get(key) || key}`;

        return (
          <div key={key} className="bg-white rounded-xl shadow-md border mb-6">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">{titre}</h2>
            </div>

            {items.length === 0 ? (
              <p className="p-6 text-gray-500">Aucun personnel.</p>
            ) : (
              <div className="divide-y">
                {items.map((m) => (
                  <div
                    key={m.uid}
                    className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    {/* Infos */}
                    <div>
                      {editId === m.uid ? (
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <input
                            value={editDisplayName}
                            onChange={(e) =>
                              setEditDisplayName(toCapitalize(e.target.value))
                            }
                            className="border p-2 rounded"
                          />
                          <input
                            value={editTelephone}
                            onChange={(e) =>
                              setEditTelephone(e.target.value.replace(/\D/g, ""))
                            }
                            placeholder="Téléphone"
                            inputMode="numeric"
                            className="border p-2 rounded"
                          />
                          <select
                            value={editRole}
                            onChange={(e) =>
                              setEditRole(e.target.value as AnyRole)
                            }
                            className="border p-2 rounded"
                          >
                            <option value="admin_compagnie">Admin compagnie</option>
                            <option value="comptable_compagnie">Comptable (compagnie)</option>
                            <option value="chef_agence">Chef d’agence</option>
                            <option value="comptable_agence">Comptable (agence)</option>
                            <option value="guichetier">Guichetier</option>
                            <option value="agent_courrier">Agent de courrier</option>
                          </select>
                          <div className="text-xs text-gray-500 flex items-center">
                            Statut:&nbsp;
                            <span className={m.active ? "text-green-600" : "text-red-600"}>
                              {m.active ? "Actif" : "Désactivé"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-semibold text-gray-900">
                            {m.displayName}{" "}
                            <span className="text-gray-500 text-sm">• {m.role}</span>
                          </p>
                          <p className="text-sm text-gray-600">
                            {m.email}
                            {m.telephone ? ` • ${m.telephone}` : ""}
                          </p>
                          <p className="text-xs">
                            Statut :{" "}
                            <span className={m.active ? "text-green-600" : "text-red-600"}>
                              {m.active ? "Actif" : "Désactivé"}
                            </span>
                          </p>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {editId === m.uid ? (
                        <>
                          <button
                            onClick={handleEditSave}
                            disabled={busy}
                            className="px-3 py-1 rounded text-white bg-green-600"
                          >
                            Enregistrer
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="px-3 py-1 rounded border"
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditStart(m)}
                            className="px-3 py-1 rounded border"
                          >
                            Modifier
                          </button>

                          {m.active ? (
                            <button
                              onClick={() => handleToggleActive(m, false)}
                              disabled={busy}
                              className="px-3 py-1 rounded text-white bg-amber-700"
                            >
                              Désactiver
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleActive(m, true)}
                              disabled={busy}
                              className="px-3 py-1 rounded text-white bg-green-700"
                            >
                              Activer
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(m)}
                            disabled={busy}
                            className="px-3 py-1 rounded text-white bg-red-600"
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ParametresPersonnel;
