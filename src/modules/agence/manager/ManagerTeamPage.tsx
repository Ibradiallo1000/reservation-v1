import React, { useEffect, useState, useMemo } from "react";
import {
  collection, getDocs, updateDoc, doc, getDoc, setDoc, Timestamp,
  query, where, limit, deleteDoc,
} from "firebase/firestore";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { createInvitationDoc } from "@/shared/invitations/createInvitationDoc";
import { allocateCourierAgentCode } from "@/modules/logistics/services/allocateCourierAgentCode";
import {
  Users, UserPlus, X, RotateCcw, Loader2, Copy, Check, RefreshCw,
} from "lucide-react";
import { SectionCard, StatusBadge, EmptyState, KpiCard, HelpTip, ConfirmModal, MGR } from "./ui";

const ROLE_LABELS: Record<string, string> = {
  chefAgence: "Chef d'agence",
  superviseur: "Superviseur",
  guichetier: "Guichetier",
  controleur: "Contrôleur",
  agency_accountant: "Comptable",
  chefEmbarquement: "Chef embarquement",
  agentCourrier: "Agent courrier",
};

type Role = "guichetier" | "controleur" | "agency_accountant" | "chefAgence" | "chefEmbarquement" | "agentCourrier";

const ALL_ASSIGNABLE_ROLES: { value: Role; label: string }[] = [
  { value: "guichetier", label: "Guichetier" },
  { value: "controleur", label: "Contrôleur" },
  { value: "agency_accountant", label: "Comptable" },
  { value: "chefAgence", label: "Chef d'agence" },
  { value: "chefEmbarquement", label: "Chef embarquement" },
  { value: "agentCourrier", label: "Agent courrier" },
];

type Agent = {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  telephone?: string;
  role: string;
  active: boolean;
  staffCode?: string;
  invitationPending?: boolean;
  invitationToken?: string;
};

async function allocateStaffCode(companyId: string, agencyId: string, role: string): Promise<string | undefined> {
  if (!["guichetier", "agency_accountant"].includes(role)) return undefined;
  const counterRef = doc(db, "companies", companyId, "agences", agencyId, "counters", role);
  try {
    const snap = await getDoc(counterRef);
    let seq = 1;
    if (snap.exists()) seq = (snap.data().lastSeq || 0) + 1;
    await setDoc(counterRef, { lastSeq: seq, updatedAt: Timestamp.now() }, { merge: true });
    if (role === "guichetier") return `G${String(seq).padStart(3, "0")}`;
    if (role === "agency_accountant") return `ACC${String(seq).padStart(3, "0")}`;
    return undefined;
  } catch { return undefined; }
}

async function hasAgencyAccountantAlready(companyId: string, agencyId: string): Promise<boolean> {
  const snap = await getDocs(query(collection(db, "users"),
    where("companyId", "==", companyId), where("agencyId", "==", agencyId),
    where("role", "==", "agency_accountant"), limit(1)));
  return !snap.empty;
}

async function syncRootUsersToAgency(companyId: string, agencyId: string) {
  const rootSnap = await getDocs(query(collection(db, "users"),
    where("companyId", "==", companyId), where("agencyId", "==", agencyId)));
  for (const d of rootSnap.docs) {
    const data = d.data();
    if (data.role === "admin_platforme") continue;
    await setDoc(doc(db, "companies", companyId, "agences", agencyId, "users", d.id), {
      ...data, uid: d.id, displayName: data.displayName || "Nom inconnu",
      email: data.email || "", role: data.role || "guichetier", active: data.active !== false,
      companyId, agencyId, createdAt: data.createdAt || Timestamp.now(),
    }, { merge: true });
  }
}

export default function ManagerTeamPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState<Role>("guichetier");
  const [lastUrl, setLastUrl] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<Role>("guichetier");

  const [confirmResetAgent, setConfirmResetAgent] = useState<Agent | null>(null);

  const isChefAgence = user?.role === "chefAgence";
  const assignableRoles = useMemo(() =>
    isChefAgence ? ALL_ASSIGNABLE_ROLES.filter((r) => r.value !== "chefAgence") : ALL_ASSIGNABLE_ROLES,
  [isChefAgence]);

  const loadAgents = async () => {
    if (!companyId || !agencyId) return;
    setLoading(true);
    try {
      const ref = collection(db, "companies", companyId, "agences", agencyId, "users");
      let snap = await getDocs(ref);

      if (snap.empty && user?.role === "chefAgence") {
        await syncRootUsersToAgency(companyId, agencyId);
        snap = await getDocs(ref);
      }

      const list: Agent[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, uid: data.uid || d.id,
          displayName: data.displayName || "Nom inconnu",
          email: data.email || "", telephone: data.telephone || "",
          role: data.role || "guichetier", active: data.active !== false,
          staffCode: data.staffCode || data.codeCourt || "",
          invitationPending: data.invitationPending || false,
          invitationToken: data.invitationToken || "",
        };
      }).filter((a) => a.displayName).sort((a, b) => a.displayName.localeCompare(b.displayName));

      for (const agent of list) {
        if (agent.role === "agentCourrier" && !agent.staffCode && agent.uid) {
          try {
            const code = await allocateCourierAgentCode({ companyId, agencyId });
            const localRef = doc(db, "companies", companyId, "agences", agencyId, "users", agent.id);
            await updateDoc(localRef, { staffCode: code, codeCourt: code });
            const rootRef = doc(db, "users", agent.uid);
            const rootSnap = await getDoc(rootRef);
            if (rootSnap.exists()) await updateDoc(rootRef, { staffCode: code, codeCourt: code });
            agent.staffCode = code;
          } catch (e) {
            console.error("allocateCourierAgentCode backfill:", e);
          }
        }
      }

      setAgents(list);
    } catch (e) {
      console.error("loadAgents error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAgents(); }, [companyId, agencyId]);

  const flash = (type: "success" | "error" | "warn", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  /* ── Add staff ── */
  const handleAdd = async () => {
    if (!companyId || !agencyId) return flash("error", "Contexte agence manquant.");
    if (!formName.trim() || !formEmail.trim()) return flash("warn", "Nom et email sont obligatoires.");
    setBusy("add");
    try {
      if (formRole === "agency_accountant") {
        const exists = await hasAgencyAccountantAlready(companyId, agencyId);
        if (exists) { setBusy(null); return flash("warn", "Un comptable existe déjà pour cette agence."); }
      }
      const result = await createInvitationDoc({
        email: formEmail.trim().toLowerCase(), role: formRole,
        companyId, agencyId, fullName: formName.trim(),
        ...(formPhone.trim() ? { phone: formPhone.trim() } : {}),
        createdBy: user?.uid,
      });

      await setDoc(doc(db, "companies", companyId, "agences", agencyId, "users", result.inviteId), {
        displayName: formName.trim(), email: formEmail.trim().toLowerCase(),
        telephone: formPhone.trim() || "", role: formRole,
        active: false, invitationPending: true, invitationToken: result.token,
        companyId, agencyId, createdAt: Timestamp.now(),
      });

      setLastUrl(result.activationUrl);
      flash("success", "Invitation envoyée avec succès.");
      setFormName(""); setFormEmail(""); setFormPhone(""); setFormRole("guichetier");
      loadAgents();
    } catch (e: any) {
      flash("error", e?.code === "already-exists"
        ? "Une invitation en attente existe déjà pour cet email."
        : e?.message ?? "Erreur lors de la création.");
    } finally { setBusy(null); }
  };

  /* ── Toggle active ── */
  const handleToggle = async (agent: Agent, nextActive: boolean) => {
    setBusy(agent.id);
    try {
      const localRef = doc(db, "companies", companyId, "agences", agencyId, "users", agent.id);
      await updateDoc(localRef, { active: nextActive });
      if (agent.uid) {
        const rootRef = doc(db, "users", agent.uid);
        const rootSnap = await getDoc(rootRef);
        if (rootSnap.exists()) await updateDoc(rootRef, { active: nextActive });
      }
      setAgents((p) => p.map((a) => a.id === agent.id ? { ...a, active: nextActive } : a));
      flash("success", `${agent.displayName} ${nextActive ? "activé" : "désactivé"}.`);
    } catch { flash("error", "Erreur lors du changement de statut."); }
    finally { setBusy(null); }
  };

  /* ── Edit ── */
  const startEdit = (a: Agent) => { setEditId(a.id); setEditName(a.displayName); setEditPhone(a.telephone || ""); setEditRole(a.role as Role); };
  const cancelEdit = () => setEditId(null);
  const saveEdit = async () => {
    if (!editId) return;
    setBusy(editId);
    try {
      if (editRole === "agency_accountant") {
        const agent = agents.find((a) => a.id === editId);
        if (agent && agent.role !== "agency_accountant") {
          const exists = await hasAgencyAccountantAlready(companyId, agencyId);
          if (exists) { setBusy(null); return flash("warn", "Un comptable existe déjà."); }
        }
      }
      const localRef = doc(db, "companies", companyId, "agences", agencyId, "users", editId);
      await updateDoc(localRef, { displayName: editName, telephone: editPhone, role: editRole });
      const agent = agents.find((a) => a.id === editId);
      if (agent?.uid) {
        const rootRef = doc(db, "users", agent.uid);
        const rootSnap = await getDoc(rootRef);
        if (rootSnap.exists()) await updateDoc(rootRef, { displayName: editName, telephone: editPhone, role: editRole });
        if ((editRole === "guichetier" || editRole === "agency_accountant") && !agent.staffCode) {
          const code = await allocateStaffCode(companyId, agencyId, editRole);
          if (code) {
            await updateDoc(localRef, { staffCode: code, codeCourt: code });
            if (rootSnap.exists()) await updateDoc(doc(db, "users", agent.uid), { staffCode: code, codeCourt: code });
          }
        }
        if (editRole === "agentCourrier" && !agent.staffCode) {
          const code = await allocateCourierAgentCode({ companyId, agencyId });
          await updateDoc(localRef, { staffCode: code, codeCourt: code });
          if (rootSnap.exists()) await updateDoc(doc(db, "users", agent.uid), { staffCode: code, codeCourt: code });
        }
      }
      setAgents((p) => p.map((a) => a.id === editId ? { ...a, displayName: editName, telephone: editPhone, role: editRole } : a));
      setEditId(null);
      flash("success", "Agent modifié.");
    } catch { flash("error", "Erreur lors de la modification."); }
    finally { setBusy(null); }
  };

  /* ── Password reset (with confirmation modal) ── */
  const confirmPasswordReset = async () => {
    const agent = confirmResetAgent;
    if (!agent?.email) { setConfirmResetAgent(null); return; }
    setConfirmResetAgent(null);
    setBusy(agent.id);
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, agent.email);
      flash("success", `Email de réinitialisation envoyé à ${agent.email}.`);
    } catch {
      flash("error", "Impossible d'envoyer l'email de réinitialisation.");
    } finally { setBusy(null); }
  };

  /* ── Resend invitation ── */
  const handleResendInvitation = async (agent: Agent) => {
    if (!agent.invitationToken) return flash("warn", "Pas de token d'invitation trouvé.");
    const url = `${window.location.origin}/accept-invitation/${agent.invitationToken}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("success", `Lien d'invitation copié pour ${agent.displayName}.`);
    } catch {
      setLastUrl(url);
      flash("success", "Lien d'invitation régénéré. Copiez-le ci-dessus.");
    }
  };

  /* ── Copy URL ── */
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(lastUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const summary = useMemo(() => {
    const total = agents.length;
    const active = agents.filter((a) => a.active).length;
    return { total, active, inactive: total - active };
  }, [agents]);

  if (loading) return <div className={MGR.page}><p className={MGR.muted}>Chargement de l'équipe…</p></div>;

  return (
    <div className={MGR.page}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className={MGR.h1}>Équipe</h1>
        <button onClick={() => { setShowForm(!showForm); setLastUrl(""); }}
          className={showForm ? MGR.btnSecondary : MGR.btnPrimary}>
          {showForm ? <><X className="w-4 h-4" /> Fermer</> : <><UserPlus className="w-4 h-4" /> Ajouter un agent</>}
        </button>
      </div>

      {/* ── Feedback message ── */}
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "success" ? "bg-emerald-50 text-emerald-800" :
          message.type === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
          {message.text}
        </div>
      )}

      {/* ── Add form ── */}
      {showForm && (
        <SectionCard title="Nouvel agent" icon={UserPlus}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom complet *</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)}
                placeholder="Prénom Nom" className={MGR.input + " w-full"} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
              <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                type="email" placeholder="email@exemple.com" className={MGR.input + " w-full"} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
              <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                placeholder="Optionnel" className={MGR.input + " w-full"} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Rôle <HelpTip text="Le rôle détermine les permissions de l'agent dans l'application. Le guichetier vend les billets, le comptable valide les rapports, etc." />
              </label>
              <select value={formRole} onChange={(e) => setFormRole(e.target.value as Role)}
                className={MGR.input + " w-full"}>
                {assignableRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {isChefAgence && <p className="text-xs text-gray-400 col-span-full">Seuls les administrateurs de la compagnie peuvent attribuer le rôle Chef d'agence.</p>}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleAdd} disabled={busy === "add"} className={MGR.btnPrimary}>
              {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Envoyer l'invitation
            </button>
          </div>
          {lastUrl && (
            <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Lien d'activation :</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-700 flex-1 truncate">{lastUrl}</code>
                <button onClick={handleCopyUrl} className="p-1.5 rounded-lg hover:bg-gray-200 transition" title="Copier">
                  {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Summary KPIs ── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total" value={summary.total} />
        <KpiCard label="Actifs" value={summary.active} accent="text-emerald-700" />
        <KpiCard label="Inactifs" value={summary.inactive} accent="text-red-700" />
      </div>

      {/* ── Staff list ── */}
      <SectionCard title="Personnel" icon={Users} noPad>
        {agents.length === 0 ? (
          <EmptyState message="Aucun membre dans l'équipe." />
        ) : (
          <div className={MGR.table.wrapper}>
            <table className={MGR.table.base}>
              <thead className={MGR.table.head}>
                <tr>
                  <th className={MGR.table.th}>Nom</th>
                  <th className={MGR.table.th}>Rôle</th>
                  <th className={MGR.table.th}>Code</th>
                  <th className={MGR.table.th}>Contact</th>
                  <th className={MGR.table.th}>Statut</th>
                  <th className={MGR.table.thRight}>Actions</th>
                </tr>
              </thead>
              <tbody className={MGR.table.body}>
                {agents.map((a) => (
                  <tr key={a.id} className={MGR.table.row}>
                    {editId === a.id ? (
                      <>
                        <td className={MGR.table.td}>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)}
                            className={MGR.input + " w-full text-sm"} />
                        </td>
                        <td className={MGR.table.td}>
                          <select value={editRole} onChange={(e) => setEditRole(e.target.value as Role)}
                            className={MGR.input + " w-full text-sm"}>
                            {assignableRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td className={MGR.table.td}>
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{a.staffCode || "—"}</code>
                        </td>
                        <td className={MGR.table.td}>
                          <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="Téléphone" className={MGR.input + " w-full text-sm"} />
                        </td>
                        <td className={MGR.table.td}>
                          {a.active ? <StatusBadge color="green">Actif</StatusBadge> : <StatusBadge color="red">Inactif</StatusBadge>}
                        </td>
                        <td className={MGR.table.tdRight}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={saveEdit} disabled={busy === a.id} className={MGR.btnPrimary + " !py-1.5 !text-xs"}>
                              {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Sauver"}
                            </button>
                            <button onClick={cancelEdit} className={MGR.btnSecondary + " !py-1.5 !text-xs"}>Annuler</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={MGR.table.td}>
                          <span className="font-medium text-gray-900">{a.displayName}</span>
                        </td>
                        <td className={MGR.table.td}>{ROLE_LABELS[a.role] ?? a.role}</td>
                        <td className={MGR.table.td}>
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{a.staffCode || "—"}</code>
                        </td>
                        <td className={MGR.table.td}>
                          <div className="text-sm">{a.email}</div>
                          {a.telephone && <div className="text-xs text-gray-500">{a.telephone}</div>}
                        </td>
                        <td className={MGR.table.td}>
                          {a.invitationPending
                            ? <StatusBadge color="purple">Invitation en attente</StatusBadge>
                            : a.active ? <StatusBadge color="green">Actif</StatusBadge> : <StatusBadge color="red">Inactif</StatusBadge>}
                        </td>
                        <td className={MGR.table.tdRight}>
                          <div className="flex items-center justify-end gap-1.5">
                            {a.invitationPending && a.invitationToken && (
                              <button onClick={() => handleResendInvitation(a)}
                                title="Renvoyer le lien d'invitation"
                                className={MGR.btnSecondary + " !py-1.5 !text-xs"}>
                                <RefreshCw className="w-3.5 h-3.5" /> Renvoyer
                              </button>
                            )}
                            <button onClick={() => startEdit(a)} className={MGR.btnSecondary + " !py-1.5 !text-xs"}>Modifier</button>
                            {!a.invitationPending && (
                              <>
                                <button onClick={() => handleToggle(a, !a.active)} disabled={busy === a.id}
                                  className={`${a.active ? MGR.btnSecondary : MGR.btnPrimary} !py-1.5 !text-xs`}>
                                  {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : a.active ? "Désactiver" : "Activer"}
                                </button>
                                <button onClick={() => setConfirmResetAgent(a)} disabled={busy === a.id}
                                  title="Réinitialiser le mot de passe"
                                  className={MGR.btnSecondary + " !py-1.5 !text-xs !px-2"}>
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Password reset confirmation modal */}
      <ConfirmModal
        open={!!confirmResetAgent}
        title="Réinitialiser le mot de passe"
        message={confirmResetAgent ? `Envoyer un email de réinitialisation du mot de passe à ${confirmResetAgent.email} ?` : ""}
        confirmLabel="Envoyer"
        variant="danger"
        onConfirm={confirmPasswordReset}
        onCancel={() => setConfirmResetAgent(null)}
      />
    </div>
  );
}
