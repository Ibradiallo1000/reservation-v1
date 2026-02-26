import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
  setDoc,
  updateDoc,
  query,
  where,
  getDoc,
  limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { getFunctions, httpsCallable } from "firebase/functions";
import { createInvitationDoc } from "@/shared/invitations/createInvitationDoc";
import { Button } from "@/shared/ui/button";

type Role = "guichetier" | "controleur" | "agency_accountant" | "chefAgence" | "chefEmbarquement" | "agency_fleet_controller";

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

/* ===================== SYNC FONCTION ===================== */
/**
 * Synchronise les agents existants de /users vers la sous-collection de l'agence
 * Pour les agents créés avant l'implémentation de la sous-collection
 */
async function syncRootUsersToAgency(
  companyId: string,
  agencyId: string
) {
  try {
    // Récupérer tous les users de cette compagnie/agence
    const rootSnap = await getDocs(
      query(
        collection(db, "users"),
        where("companyId", "==", companyId),
        where("agencyId", "==", agencyId)
      )
    );

    console.log(`📥 ${rootSnap.docs.length} agents trouvés dans /users`);

    // Pour chaque user, créer un document dans la sous-collection agence
    for (const d of rootSnap.docs) {
      const userData = d.data();
      
      // Ne pas synchroniser les admins plateforme
      if (userData.role === "admin_platforme") continue;
      
      // S'assurer que les champs essentiels existent
      const safeData = {
        ...userData,
        uid: d.id,
        displayName: userData.displayName || "Nom inconnu",
        email: userData.email || "Email inconnu",
        role: userData.role || "guichetier",
        active: userData.active !== false,
        companyId: userData.companyId || companyId,
        agencyId: userData.agencyId || agencyId,
        createdAt: userData.createdAt || Timestamp.now(),
      };
      
      await setDoc(
        doc(
          db,
          "companies",
          companyId,
          "agences",
          agencyId,
          "users",
          d.id
        ),
        safeData,
        { merge: true }
      );
    }

    console.log(`✅ Synchronisation terminée pour ${companyId}/${agencyId}`);
    return rootSnap.docs.length;
  } catch (error) {
    console.error("❌ Erreur lors de la synchronisation:", error);
    return 0;
  }
}

/* ===================== HELPERS CODES ===================== */
async function allocateStaffCode(params: {
  companyId: string;
  agencyId: string;
  role: Role;
}): Promise<string | undefined> {
  const { companyId, agencyId, role } = params;

  if (!["guichetier", "agency_accountant"].includes(role)) {
    return undefined;
  }

  const counterRef = doc(
    db, 
    "companies", 
    companyId, 
    "agences", 
    agencyId, 
    "counters", 
    role
  );

  try {
    // 1. Lire la valeur actuelle
    const snap = await getDoc(counterRef);
    let currentValue = 1;
    
    if (snap.exists()) {
      currentValue = (snap.data().lastSeq || 0) + 1;
    }
    
    // 2. Écrire la nouvelle valeur
    await setDoc(counterRef, {
      lastSeq: currentValue,
      updatedAt: Timestamp.now()
    }, { merge: true });
    
    // 3. Générer le code
    if (role === "guichetier") {
      return "G" + String(currentValue).padStart(3, "0");
    } else if (role === "agency_accountant") {
      return "ACC" + String(currentValue).padStart(3, "0");
    }
    
  } catch (error) {
    console.error("Erreur allocateStaffCode:", error);
    
    // Fallback: utiliser timestamp
    const timestamp = Date.now();
    const fallbackCode = timestamp.toString().slice(-6);
    
    if (role === "guichetier") {
      return "G" + fallbackCode.slice(0, 3);
    } else if (role === "agency_accountant") {
      return "ACC" + fallbackCode.slice(0, 3);
    }
  }
  
  return undefined;
}

/** Vérifie s'il existe déjà un comptable agence pour l'agence. */
async function hasAgencyAccountantAlready(companyId: string, agencyId: string) {
  try {
    const ref = collection(db, "users");
    const snap = await getDocs(
      query(
        ref,
        where("companyId", "==", companyId),
        where("agencyId", "==", agencyId),
        where("role", "==", "agency_accountant"),
        limit(1)
      )
    );
    return !snap.empty;
  } catch (error) {
    console.error("Erreur hasComptableAlready:", error);
    return false;
  }
}

/** Backfill : si un agent guichetier/agency_accountant n'a pas de code, on en génère un. */
async function ensureAgentHasCode(agentDocRef: any, rootUserRef: any, agent: Agent) {
  if (!agent || !agent.companyId || !agent.agencyId) return;
  if (!["guichetier", "agency_accountant"].includes(agent.role)) return;
  if (agent.staffCode) return;

  try {
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
  } catch (error) {
    console.error("Erreur ensureAgentHasCode:", error);
  }
}

const AgencePersonnelPage: React.FC = () => {
  const { user, company } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [telephone, setTelephone] = useState("");
  const [role, setRole] = useState<Role>("guichetier");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);

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
      
      // Transformer les documents en objets Agent avec des valeurs par défaut
      const list = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            uid: data.uid || d.id,
            displayName: data.displayName || "Nom inconnu",
            email: data.email || "Email inconnu",
            telephone: data.telephone || "",
            role: (data.role as Role) || "guichetier",
            active: data.active !== false,
            companyId: data.companyId || user.companyId!,
            agencyId: data.agencyId || user.agencyId!,
            agencyName: data.agencyName || "",
            staffCode: data.staffCode,
            codeCourt: data.codeCourt,
            createdAt: data.createdAt || Timestamp.now(),
          } as Agent;
        })
        .filter(agent => agent.uid && agent.displayName); // Filtrer les agents valides

      // Backfill local: si guichetier/comptable sans code => en attribuer un
      const toFix = list.filter(a => (a.role === "guichetier" || a.role === "agency_accountant") && !a.staffCode);
      
      if (toFix.length > 0) {
        console.log(`🔄 Backfill pour ${toFix.length} agents sans code`);
        
        for (const a of toFix) {
          if (a.id && a.uid) {
            const localRef = doc(db, "companies", a.companyId, "agences", a.agencyId, "users", a.id);
            const rootRef = doc(db, "users", a.uid);
            await ensureAgentHasCode(localRef, rootRef, a);
          }
        }

        // Recharger après backfill
        const snap2 = await getDocs(ref);
        const list2 = snap2.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              uid: data.uid || d.id,
              displayName: data.displayName || "Nom inconnu",
              email: data.email || "Email inconnu",
              telephone: data.telephone || "",
              role: (data.role as Role) || "guichetier",
              active: data.active !== false,
              companyId: data.companyId || user.companyId!,
              agencyId: data.agencyId || user.agencyId!,
              agencyName: data.agencyName || "",
              staffCode: data.staffCode,
              codeCourt: data.codeCourt,
              createdAt: data.createdAt || Timestamp.now(),
            } as Agent;
          })
          .filter(agent => agent.uid && agent.displayName);
        
        setAgents(list2.sort((a, b) => 
          (a.displayName || "").localeCompare(b.displayName || "")
        ));
      } else {
        // Aucun backfill nécessaire
        setAgents(list.sort((a, b) => 
          (a.displayName || "").localeCompare(b.displayName || "")
        ));
      }

      console.log(`✅ ${list.length} agents chargés`);
    } catch (err) {
      console.error("loadAgents err:", err);
      setMessage("❌ Erreur lors du chargement des agents.");
    }
  };

  useEffect(() => {
    const initAgents = async () => {
      if (!user?.companyId || !user?.agencyId) return;

      // Vérifier si des agents existent déjà dans l'agence
      const ref = collection(
        db,
        "companies",
        user.companyId,
        "agences",
        user.agencyId,
        "users"
      );
      const snap = await getDocs(ref);
      
      // Si aucun agent dans l'agence mais que l'utilisateur est chef d'agence
      // Synchroniser les agents existants depuis /users
      if (snap.empty && user.role === "chefAgence" && !hasSynced) {
        console.log("🔄 Synchronisation des agents existants...");
        await syncRootUsersToAgency(user.companyId, user.agencyId);
        setHasSynced(true);
      }
      
      // Charger les agents
      await loadAgents();
    };

    initAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyId, user?.agencyId, user?.role]);

  const resetForm = () => {
    setEmail("");
    setDisplayName("");
    setTelephone("");
    setRole("guichetier");
  };

  /* ===================== ACTIONS ===================== */
  const handleAdd = async () => {
    if (!user?.companyId || !user?.agencyId) {
      setMessage("⚠️ Contexte agence/compagnie manquant.");
      return;
    }
    if (!email || !displayName) {
      setMessage("⚠️ Nom et email sont obligatoires.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (role === "agency_accountant") {
        const exists = await hasAgencyAccountantAlready(user.companyId, user.agencyId);
        if (exists) {
          setBusy(false);
          setMessage("⚠️ Il existe déjà un comptable pour cette agence.");
          return;
        }
      }

      const result = await createInvitationDoc({
        email: email.trim().toLowerCase(),
        role,
        companyId: user.companyId,
        agencyId: user.agencyId,
        fullName: displayName.trim(),
        ...(telephone.trim() ? { phone: telephone.trim() } : {}),
        createdBy: user?.uid,
      });

      setMessage("✅ Invitation créée. Lien : " + result.activationUrl);
      resetForm();
    } catch (error: any) {
      console.error("handleAdd err:", error);
      const code = error?.code ?? error?.details?.code;
      setMessage(
        code === "already-exists"
          ? "⚠️ Une invitation en attente existe déjà pour cet email."
          : "❌ " + (error?.message ?? "Envoi impossible. Voir la console.")
      );
    } finally {
      setBusy(false);
    }
  };

  const askConfirm = (txt: string) => window.confirm(txt);

  const handleToggleActive = async (agent: Agent, next: boolean) => {
    if (!user?.companyId || !user?.agencyId || !agent.id) return;
    setBusy(true);

    try {
      // Subcollection agence
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

      // Doc racine
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

      // On récupère l'agent complet
      const beforeSnap = await getDoc(localRef);
      const before = beforeSnap.exists() ? (beforeSnap.data() as Agent) : null;
      if (!before) throw new Error("Agent introuvable.");

      // Si on veut passer quelqu'un en comptable agence, vérifier la règle
      if (editRole === "agency_accountant" && before.role !== "agency_accountant") {
        const exists = await hasAgencyAccountantAlready(user.companyId, user.agencyId);
        if (exists) {
          setBusy(false);
          setMessage("⚠️ Il existe déjà un comptable pour cette agence.");
          return;
        }
      }

      // Subcollection agence
      await updateDoc(localRef, {
        displayName: editDisplayName,
        telephone: editTelephone,
        role: editRole,
      });

      // Doc racine
      const uid = before.uid;
      if (uid) {
        const rootRef = doc(db, "users", uid);
        await updateDoc(rootRef, {
          displayName: editDisplayName,
          telephone: editTelephone,
          role: editRole,
        });

        // Si guichetier/agency_accountant et pas encore de code
        if ((editRole === "guichetier" || editRole === "agency_accountant") && !before.staffCode) {
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

      // Refresh local state
      setAgents((prev) =>
        prev.map((a) =>
          a.id === editId
            ? {
                ...a,
                displayName: editDisplayName,
                telephone: editTelephone,
                role: editRole,
              }
            : a
        )
      );

      setEditId(null);
      setMessage("✅ Agent modifié avec succès.");
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

      // 3) Appeler Cloud Function pour supprimer dans AUTH (si configurée)
      // Note: adminDeleteUser requires Firebase Blaze plan (Cloud Functions)
      let authDeleteFailed = false;
      if (agent.uid) {
        try {
          const functions = getFunctions();
          const fn = httpsCallable(functions, "adminDeleteUser");
          await fn({ uid: agent.uid });
        } catch (fnError: unknown) {
          console.warn("Cloud Function non disponible:", fnError);
          authDeleteFailed = true;
          setMessage(
            "✅ Agent supprimé des données. La suppression du compte d'authentification nécessite les Cloud Functions (plan Blaze). Le compte Auth reste actif."
          );
        }
      }

      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      if (!authDeleteFailed) {
        setMessage("✅ Agent supprimé.");
      }
    } catch (err) {
      console.error("delete err:", err);
      setMessage("❌ Erreur lors de la suppression.");
    } finally {
      setBusy(false);
    }
  };

  /* ===================== UI ===================== */
  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen"
         style={{ background: "#f7f7fb" }}>
      <h1 className="text-2xl font-bold text-gray-900 mb-6"
          style={{ color: theme.primary }}>
        Gestion du personnel (Agence)
      </h1>

      {/* Formulaire d'ajout */}
      <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border"
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
            <option value="agency_accountant">Comptable</option>
            <option value="chefAgence">Chef d'agence</option>
            <option value="chefEmbarquement">Chef embarquement</option>
          </select>
        </div>

        <button
          onClick={handleAdd}
          disabled={busy}
          className="w-full py-3 rounded font-semibold text-white transition disabled:opacity-60"
          style={{
            background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
          }}
        >
          {busy ? "⏳ Traitement..." : "Envoyer l'invitation"}
        </button>
        {message && (
          <p className="mt-3 text-center text-sm text-gray-700">{message}</p>
        )}
      </div>

      {/* Liste des agents */}
      <div className="bg-white rounded-xl shadow-sm border"
           style={{ borderColor: theme.secondary }}>
        <div className="p-4 border-b" style={{ borderColor: theme.secondary }}>
          <h2 className="text-lg font-semibold"
              style={{ color: theme.secondary }}>
            Agents de cette agence ({agents.length})
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
                <div className="flex-1">
                  {editId === agent.id ? (
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="border p-2 rounded"
                        placeholder="Nom"
                      />
                      <input
                        value={editTelephone}
                        onChange={(e) => setEditTelephone(e.target.value)}
                        placeholder="Téléphone"
                        className="border p-2 rounded"
                      />
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as Role)}
                        className="border p-2 rounded"
                      >
                        <option value="guichetier">Guichetier</option>
                        <option value="controleur">Contrôleur</option>
                        <option value="agency_accountant">Comptable</option>
                        <option value="chefAgence">Chef d'agence</option>
                        <option value="chefEmbarquement">Chef embarquement</option>
                      </select>
                      <div className="text-sm text-gray-500 flex items-center">
                        Code: <span className="font-mono ml-1">{agent.staffCode || "—"}</span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center">
                        Statut: 
                        <span className={`ml-1 ${agent.active ? "text-green-600" : "text-red-600"}`}>
                          {agent.active ? "Actif" : "Désactivé"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-gray-900">
                        {agent.displayName}{" "}
                        <span className="text-gray-500 text-sm">• {agent.role}</span>
                        {(agent.role === "guichetier" || agent.role === "agency_accountant") && (
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
                        <span className={agent.active ? "text-green-600" : "text-red-600"}>
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
                        onClick={() => handleEditStart(agent)}
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