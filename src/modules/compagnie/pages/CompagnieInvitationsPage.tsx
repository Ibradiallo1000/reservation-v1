import React, { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { createInvitationDoc } from "@/shared/invitations/createInvitationDoc";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";

/* =========================
   Types
========================= */
type InvitationStatus = "pending" | "accepted";

interface Invitation {
  id: string;
  email: string;
  fullName: string;
  role: string;
  agencyId?: string;
  status: InvitationStatus;
  createdAt?: any;
}

interface Agence {
  id: string;
  nomAgence: string;
  ville: string;
}

/* =========================
   Page
========================= */
const CompagnieInvitationsPage: React.FC = () => {
  const { user, company } = useAuth();
  const theme = useCompanyTheme(company);
  const { setHeader, resetHeader } = usePageHeader();

  const [agences, setAgences] = useState<Agence[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [agencyId, setAgencyId] = useState("");

  const companyId = user?.companyId;

  /* =========================
     Header
  ========================= */
  useEffect(() => {
    setHeader({
      title: "Invitations",
      subtitle: "Inviter des gérants d’agence",
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: "#fff",
    });
    return () => resetHeader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.colors.primary, theme.colors.secondary]);

  /* =========================
     Charger agences
  ========================= */
  useEffect(() => {
    if (!companyId) return;

    const loadAgences = async () => {
      const snap = await getDocs(
        collection(db, "companies", companyId, "agences")
      );
      setAgences(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      );
    };

    loadAgences();
  }, [companyId]);

  /* =========================
     Charger invitations
  ========================= */
  const loadInvitations = async () => {
    if (!companyId) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, "invitations"),
        where("companyId", "==", companyId),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      setInvitations(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) }) as Invitation
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, [companyId]);

  /* =========================
     Créer invitation
  ========================= */
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!email || !fullName || !agencyId) {
      alert("Tous les champs sont obligatoires");
      return;
    }

    try {
      const result = await createInvitationDoc({
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        role: "chefAgence",
        companyId,
        agencyId,
      });

      alert(`Invitation envoyée.\n\nLien d'activation :\n${result.activationUrl}`);
    } catch (err: any) {
      alert(err?.message || "Erreur lors de l'envoi de l'invitation.");
      return;
    }

    setEmail("");
    setFullName("");
    setAgencyId("");
    loadInvitations();
  };

  /* =========================
     Annuler invitation
  ========================= */
  const cancelInvitation = async (id: string) => {
    if (!window.confirm("Annuler cette invitation ?")) return;
    await deleteDoc(doc(db, "invitations", id));
    loadInvitations();
  };

  /* =========================
     Render
  ========================= */
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Formulaire */}
      <form
        onSubmit={handleInvite}
        className="bg-white rounded-xl shadow-sm p-6 space-y-4 border"
      >
        <h3 className="text-lg font-semibold">Nouvelle invitation</h3>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm">Nom complet</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="text-sm">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="text-sm">Agence</label>
            <select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            >
              <option value="">— Choisir —</option>
              {agences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nomAgence} ({a.ville})
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="px-4 py-2 rounded text-white"
          style={{ backgroundColor: theme.colors.primary }}
        >
          Envoyer l’invitation
        </button>
      </form>

      {/* Liste */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="px-6 py-4 border-b font-semibold">
          Invitations
        </div>

        {loading ? (
          <p className="p-6">Chargement…</p>
        ) : invitations.length === 0 ? (
          <p className="p-6 text-gray-500">Aucune invitation</p>
        ) : (
          <ul className="divide-y">
            {invitations.map((inv) => (
              <li key={inv.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium">{inv.fullName}</div>
                  <div className="text-sm text-gray-500">{inv.email}</div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      inv.status === "accepted"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {inv.status === "accepted"
                      ? "Acceptée"
                      : "En attente"}
                  </span>

                  {inv.status === "pending" && (
                    <button
                      onClick={() => cancelInvitation(inv.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CompagnieInvitationsPage;
