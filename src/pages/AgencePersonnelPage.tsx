import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
  setDoc,
  updateDoc,
  query,
  where,
  getDoc,
  runTransaction,
  limit,
} from "firebase/firestore";
import { db, auth } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

type Role = "guichetier" | "controleur" | "comptable" | "chefAgence";

interface Agent {
  id?: string;          // id du doc dans subcollection agence
  uid: string;          // uid Auth
  displayName: string;
  email: string;
  telephone?: string;
  role: Role;
  active: boolean;
  companyId: string;
  agencyId: string;
  agencyName?: string;
  staffCode?: string;   // ex: G001 / ACC001
  codeCourt?: string;   // alias du staffCode pour compat
  createdAt: any;
}

/* ===================== HELPERS CODES ===================== */
/** Compteur transactionnel par rôle -> code lisible. 
 * guichetier => G###
 * comptable  => ACC###
 * (le reste: pas de code automatique)
 */
async function allocateStaffCode(params: {
  companyId: string;
  agencyId: string;
  role: Role;
}): Promise<string | undefined> {
  const { companyId, agencyId, role } = params;

  // guichetier : on garde ton chemin existant pour compat
  if (role === "guichetier") {
    const counterRef = doc(db, "companies", companyId, "agences", agencyId, "counters", "guichetier");
    const next = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const last = snap.exists() ? (snap.data() as any).lastSeq || 0 : 0;
      const n = last + 1;
      tx.set(counterRef, { lastSeq: n, updatedAt: Timestamp.now() }, { merge: true });
      return n;
    });
    return "G" + String(next).padStart(3, "0"); // G001
  }

  // comptable : nouveau compteur dédié
  if (role === "comptable") {
    const counterRef = doc(db, "companies", companyId, "agences", agencyId, "counters", "comptable");
    const next = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const last = snap.exists() ? (snap.data() as any).lastSeq || 0 : 0;
      const n = last + 1;
      tx.set(counterRef, { lastSeq: n, updatedAt: Timestamp.now() }, { merge: true });
      return n;
    });
    return "ACC" + String(next).padStart(3, "0"); // ACC001
  }

  // autres rôles : pas de code auto
  return undefined;
}

/** Vérifie s'il existe déjà un comptable pour l'agence. */
async function hasComptableAlready(companyId: string, agencyId: string) {
  const ref = collection(db, "users");
  const snap = await getDocs(
    query(
      ref,
      where("companyId", "==", companyId),
      where("agencyId", "==", agencyId),
      where("role", "==", "comptable"),
      limit(1)
    )
  );
  return !snap.empty;
}

/** Backfill : si un agent guichetier/comptable n'a pas de code, on en génère un. */
async function ensureAgentHasCode(agentDocRef: any, rootUserRef: any, agent: Agent) {
  if (!agent || !agent.companyId || !agent.agencyId) return;
  if (!["guichetier", "comptable"].includes(agent.role)) return;
  if (agent.staffCode) return;

  const code = await allocateStaffCode({
    companyId: agent.companyId,
    agencyId: agent.agencyId,
    role: agent.role,
  });
  if (!code) return;

  await updateDoc(agentDocRef, { staffCode: code, codeCourt: code });
  const rootSnap = await getDoc(rootUserRef);
  if (rootSnap.exists()) {
    await updateDoc(rootUserRef, { staffCode: code, codeCourt: code });
  }
}

const AgencePersonnelPage: React.FC = () => {
  const { user, company } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [telephone, setTelephone] = useState("");
  const [role, setRole] = useState<Role>("guichetier");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editTelephone, setEditTelephone] = useState("");
  const [editRole, setEditRole] = useState<Role>("guichetier");

  const theme = useMemo(
    () => ({
      primary: company?.couleurPrimaire || "#ef6c00",
      secondary: company?.couleurSecondaire || "#ffb74d",
    }),
    [company]
  );

  /* ===================== LOAD ===================== */
  const loadAgents = async () => {
    if (!user?.companyId || !user?.agencyId) return;

    try {
      const ref = collection(
        db,
        "companies",
        user.companyId,
        "agences",
        user.agencyId,
        "users"
      );
      const snap = await getDocs(ref);
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Agent)
      );

      // Backfill local: si guichetier/comptable sans code => en attribuer un
      // (on fait ça en tâche de fond, et on rafraîchit la liste ensuite)
      const toFix = list.filter(a => (a.role === "guichetier" || a.role === "comptable") && !a.staffCode);
      for (const a of toFix) {
        const localRef = doc(db, "companies", a.companyId, "agences", a.agencyId, "users", a.id!);
        const rootRef  = doc(db, "users", a.uid);
        await ensureAgentHasCode(localRef, rootRef, a);
      }

      // re-read si on a fait du backfill
      if (toFix.length > 0) {
        const snap2 = await getDocs(ref);
        const list2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() } as Agent));
        setAgents(list2.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      } else {
        setAgents(list.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      }

    } catch (err) {
      console.error("loadAgents err:", err);
      setMessage("❌ Erreur lors du chargement des agents.");
    }
  };

  useEffect(() => {
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyId, user?.agencyId]);

  const resetForm = () => {
    setEmail("");
    setDisplayName("");
    setTelephone("");
    setPassword("");
    setRole("guichetier");
  };

  /* ===================== ACTIONS ===================== */

  const handleAdd = async () => {
    if (!user?.companyId || !user?.agencyId) {
      setMessage("⚠️ Contexte agence/compagnie manquant.");
      return;
    }
    if (!email || !password || !displayName) {
      setMessage("⚠️ Nom, email et mot de passe sont obligatoires.");
      return;
    }
    if (password.length < 6) {
      setMessage("⚠️ Mot de passe: minimum 6 caractères.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      // Règle: un seul comptable par agence
      if (role === "comptable") {
        const exists = await hasComptableAlready(user.companyId, user.agencyId);
        if (exists) {
          setBusy(false);
          setMessage("⚠️ Il existe déjà un comptable pour cette agence.");
          return;
        }
      }

      // 1) Créer l’utilisateur dans Auth
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      const uid = cred.user.uid;

      // 2) Code auto pour guichetier ET comptable
      let staffCode: string | undefined = undefined;
      if (role === "guichetier" || role === "comptable") {
        staffCode = await allocateStaffCode({
          companyId: user.companyId,
          agencyId: user.agencyId,
          role,
        });
      }

      // 3) Doc racine /users
      const rootRef = doc(db, "users", uid);
      await setDoc(
        rootRef,
        {
          uid,
          email,
          displayName,
          telephone: telephone || "",
          role,
          active: true,
          companyId: user.companyId,
          agencyId: user.agencyId,
          agencyName: (user as any)?.agencyName || "",
          createdAt: Timestamp.now(),
          ...(staffCode ? { staffCode, codeCourt: staffCode } : {}),
        },
        { merge: true }
      );

      // 4) Doc local agence
      const localRef = await addDoc(
        collection(
          db,
          "companies",
          user.companyId,
          "agences",
          user.agencyId,
          "users"
        ),
        {
          uid,
          email,
          displayName,
          telephone: telephone || "",
          role,
          active: true,
          companyId: user.companyId,
          agencyId: user.agencyId,
          agencyName: (user as any)?.agencyName || "",
          createdAt: Timestamp.now(),
          ...(staffCode ? { staffCode, codeCourt: staffCode } : {}),
        } as Agent
      );

      setMessage("✅ Agent ajouté avec succès.");
      resetForm();
      await loadAgents();
    } catch (error: any) {
      console.error("handleAdd err:", error);
      if (error?.code === "auth/email-already-in-use") {
        setMessage("⚠️ Cet email est déjà utilisé.");
      } else {
        setMessage("❌ Ajout impossible. Voir la console.");
      }
    } finally {
      setBusy(false);
    }
  };

  const askConfirm = (txt: string) => window.confirm(txt);

  const handleToggleActive = async (agent: Agent, next: boolean) => {
    if (!user?.companyId || !user?.agencyId || !agent.id) return;
    setBusy(true);

    try {
      // subcollection agence
      const localRef = doc(
        db,
        "companies",
        user.companyId,
        "agences",
        user.agencyId,
        "users",
        agent.id
      );
      await updateDoc(localRef, { active: next });

      // doc racine
      if (agent.uid) {
        const rootRef = doc(db, "users", agent.uid);
        await updateDoc(rootRef, { active: next });
      }

      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, active: next } : a))
      );
    } catch (err) {
      console.error("toggleActive err:", err);
      setMessage("❌ Erreur lors du changement de statut.");
    } finally {
      setBusy(false);
    }
  };

  const handleEditStart = (agent: Agent) => {
    setEditId(agent.id || null);
    setEditDisplayName(agent.displayName);
    setEditTelephone(agent.telephone || "");
    setEditRole(agent.role);
  };

  const handleEditSave = async () => {
    if (!editId || !user?.companyId || !user?.agencyId) return;
    setBusy(true);

    try {
      const localRef = doc(
        db,
        "companies",
        user.companyId,
        "agences",
        user.agencyId,
        "users",
        editId
      );

      // on récupère l'agent complet pour connaître uid / anciens champs
      const beforeSnap = await getDoc(localRef);
      const before = beforeSnap.exists() ? (beforeSnap.data() as Agent) : null;
      if (!before) throw new Error("Agent introuvable.");

      // Si on veut passer quelqu'un en comptable, vérifier la règle 1/comptable/agence
      if (editRole === "comptable" && before.role !== "comptable") {
        const exists = await hasComptableAlready(user.companyId, user.agencyId);
        if (exists) {
          setBusy(false);
          setMessage("⚠️ Il existe déjà un comptable pour cette agence.");
          return;
        }
      }

      // subcollection agence
      await updateDoc(localRef, {
        displayName: editDisplayName,
        telephone: editTelephone,
        role: editRole,
      });

      // doc racine
      const uid = before.uid;
      if (uid) {
        const rootRef = doc(db, "users", uid);
        await updateDoc(rootRef, {
          displayName: editDisplayName,
          telephone: editTelephone,
          role: editRole,
        });

        // Si guichetier/comptable et pas encore de code => en générer un
        if ((editRole === "guichetier" || editRole === "comptable") && !before.staffCode) {
          const code = await allocateStaffCode({
            companyId: user.companyId,
            agencyId: user.agencyId,
            role: editRole,
          });
          if (code) {
            await updateDoc(localRef, { staffCode: code, codeCourt: code });
            await updateDoc(rootRef, { staffCode: code, codeCourt: code });
          }
        }
      }

      // refresh local state
      const afterSnap = await getDoc(localRef);
      const after = afterSnap.exists() ? ({ id: editId, ...afterSnap.data() } as Agent) : null;

      setAgents((prev) =>
        prev.map((a) =>
          a.id === editId
            ? {
                ...a,
                displayName: after?.displayName || editDisplayName,
                telephone: after?.telephone || editTelephone,
                role: after?.role || editRole,
                staffCode: after?.staffCode,
                codeCourt: after?.codeCourt,
              }
            : a
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

  const handleDelete = async (agent: Agent) => {
    if (!user?.companyId || !user?.agencyId || !agent.id) return;

    const ok = askConfirm(
      `Supprimer définitivement "${agent.displayName}" ?\nCette action effacera aussi son compte d'authentification.`
    );
    if (!ok) return;

    setBusy(true);
    setMessage("");

    try {
      // 1) Supprimer le doc local
      const localRef = doc(
        db,
        "companies",
        user.companyId,
        "agences",
        user.agencyId,
        "users",
        agent.id
      );
      await deleteDoc(localRef);

      // 2) Supprimer /users/{uid}
      if (agent.uid) {
        const rootRef = doc(db, "users", agent.uid);
        const rootSnap = await getDoc(rootRef);
        if (rootSnap.exists()) await deleteDoc(rootRef);
      }

      // 3) Appeler la Cloud Function pour supprimer dans AUTH
      if (agent.uid) {
        const functions = getFunctions();
        const fn = httpsCallable(functions, "adminDeleteUser");
        await fn({ uid: agent.uid });
      }

      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      setMessage("✅ Agent supprimé partout.");
    } catch (err) {
      console.error("delete err:", err);
      setMessage(
        "❌ Suppression partielle. Vérifie la console et la Cloud Function."
      );
    } finally {
      setBusy(false);
    }
  };

  function setEditStart(agent: Agent): void {
    throw new Error("Function not implemented.");
  }

  /* ===================== UI ===================== */

  return (
    <div className="p-6 max-w-5xl mx-auto min-h-screen"
         style={{ background: "#f7f7fb" }}>
      <h1 className="text-3xl font-extrabold mb-6"
          style={{ color: theme.primary }}>
        Gestion du personnel (Agence)
      </h1>

      {/* Formulaire d'ajout */}
      <div className="mb-8 bg-white p-6 rounded-xl shadow-md border"
           style={{ borderColor: theme.secondary }}>
        <h2 className="text-lg font-semibold mb-4"
            style={{ color: theme.secondary }}>
          Ajouter un agent
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nom complet"
            className="border p-3 rounded focus:ring-2"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="border p-3 rounded focus:ring-2"
          />
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="Téléphone (optionnel)"
            className="border p-3 rounded focus:ring-2"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="border p-3 rounded focus:ring-2"
          >
            <option value="guichetier">Guichetier</option>
            <option value="controleur">Contrôleur</option>
            <option value="comptable">Comptable</option>
            <option value="chefAgence">Chef d’agence</option>
          </select>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            type="password"
            className="border p-3 rounded focus:ring-2 md:col-span-2"
          />
        </div>

        <button
          onClick={handleAdd}
          disabled={busy}
          className="w-full py-3 rounded font-semibold text-white transition disabled:opacity-60"
          style={{
            background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
          }}
        >
          {busy ? "⏳ Traitement..." : "Ajouter l’agent"}
        </button>
        {message && (
          <p className="mt-3 text-center text-sm text-gray-700">{message}</p>
        )}
      </div>

      {/* Liste des agents */}
      <div className="bg-white rounded-xl shadow-md border"
           style={{ borderColor: theme.secondary }}>
        <div className="p-4 border-b" style={{ borderColor: theme.secondary }}>
          <h2 className="text-lg font-semibold"
              style={{ color: theme.secondary }}>
            Agents de cette agence
          </h2>
        </div>

        {agents.length === 0 ? (
          <p className="p-6 text-gray-500">Aucun agent enregistré.</p>
        ) : (
          <div className="divide-y">
            {agents.map((agent) => (
              <div key={agent.id}
                   className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                {/* Infos */}
                <div>
                  {editId === agent.id ? (
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="border p-2 rounded"
                      />
                      <input
                        value={editTelephone}
                        onChange={(e) => setEditTelephone(e.target.value)}
                        placeholder="Téléphone"
                        className="border p-2 rounded"
                      />
                      <select
                        value={editRole}
                        onChange={(e) =>
                          setEditRole(e.target.value as Role)
                        }
                        className="border p-2 rounded"
                      >
                        <option value="guichetier">Guichetier</option>
                        <option value="controleur">Contrôleur</option>
                        <option value="comptable">Comptable</option>
                        <option value="chefAgence">Chef d’agence</option>
                      </select>
                      <div className="text-sm text-gray-500 flex items-center">
                        Code:&nbsp;
                        <span className="font-mono">
                          {agent.staffCode || "—"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center">
                        Statut:&nbsp;
                        <span className={agent.active ? "text-green-600" : "text-red-600"}>
                          {agent.active ? "Actif" : "Désactivé"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-gray-900">
                        {agent.displayName}{" "}
                        <span className="text-gray-500 text-sm">
                          • {agent.role}
                        </span>
                        {(agent.role === "guichetier" || agent.role === "comptable") && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-gray-100 font-mono text-xs">
                            {agent.staffCode || "—"}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">
                        {agent.email}
                        {agent.telephone ? ` • ${agent.telephone}` : ""}
                      </p>
                      <p className="text-xs">
                        Statut :{" "}
                        <span
                          className={
                            agent.active ? "text-green-600" : "text-red-600"
                          }
                        >
                          {agent.active ? "Actif" : "Désactivé"}
                        </span>
                      </p>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {editId === agent.id ? (
                    <>
                      <button
                        onClick={handleEditSave}
                        disabled={busy}
                        className="px-3 py-1 rounded text-white"
                        style={{ background: theme.primary }}
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
                        onClick={() => setEditStart(agent)}
                        className="px-3 py-1 rounded border"
                      >
                        Modifier
                      </button>

                      {agent.active ? (
                        <button
                          onClick={() => handleToggleActive(agent, false)}
                          disabled={busy}
                          className="px-3 py-1 rounded text-white"
                          style={{ background: "#b45309" }}
                        >
                          Désactiver
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleActive(agent, true)}
                          disabled={busy}
                          className="px-3 py-1 rounded text-white"
                          style={{ background: "#16a34a" }}
                        >
                          Activer
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(agent)}
                        disabled={busy}
                        className="px-3 py-1 rounded text-white"
                        style={{ background: "#dc2626" }}
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
    </div>
  );
};

export default AgencePersonnelPage;
