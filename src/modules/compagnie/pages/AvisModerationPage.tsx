// =============================================
// src/pages/AvisModerationPage.tsx
// =============================================

import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { useParams } from "react-router-dom";

interface Avis {
  id: string;
  nom: string;
  note: number;
  commentaire: string;
  visible: boolean;
  agencyId?: string;
}

const AvisModerationPage: React.FC = () => {
  const { user, company } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();

  // 🔥 Priorité URL → sinon user
  const effectiveCompanyId = routeCompanyId ?? user?.companyId;

  const theme = useCompanyTheme(company);
  const { setHeader, resetHeader } = usePageHeader();

  const [avisList, setAvisList] = useState<Avis[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  /* =========================
     🔥 TEMPS RÉEL
  ========================= */
  useEffect(() => {
    if (!effectiveCompanyId) return;

    setLoading(true);

    const q = query(
      collection(db, "companies", effectiveCompanyId, "avis"),
      where("visible", "==", false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Avis[];

        setAvisList(data);
        setLoading(false);
      },
      (error) => {
        console.error("Erreur écoute avis:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!effectiveCompanyId) return;
    getDocs(collection(db, "companies", effectiveCompanyId, "agences")).then((snap) => {
      setAgencies(
        snap.docs.map((d) => ({ id: d.id, nom: (d.data() as { nom?: string }).nom ?? d.id }))
      );
    });
  }, [effectiveCompanyId]);

  const filteredAvis = useMemo(() => {
    if (!agencyFilter) return avisList;
    return avisList.filter((a) => (a as Avis & { agencyId?: string }).agencyId === agencyFilter);
  }, [avisList, agencyFilter]);

  const aggregatedRating = useMemo(() => {
    if (filteredAvis.length === 0) return null;
    const sum = filteredAvis.reduce((s, a) => s + a.note, 0);
    return (sum / filteredAvis.length).toFixed(1);
  }, [filteredAvis]);

  /* =========================
     HEADER DYNAMIQUE
  ========================= */
  useEffect(() => {
    setHeader({
      title: "Avis clients",
      subtitle: avisList.length
        ? `${avisList.length} avis en attente`
        : "Aucun avis en attente",
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: "#fff",
    });

    return () => resetHeader();
  }, [avisList.length, theme.colors.primary, theme.colors.secondary]);

  /* =========================
     ACTIONS
  ========================= */
  const toggleVisibility = async (id: string, visible: boolean) => {
    if (!effectiveCompanyId) return;

    const avisRef = doc(
      db,
      "companies",
      effectiveCompanyId,
      "avis",
      id
    );

    await updateDoc(avisRef, { visible: !visible });
  };

  const handleDelete = async (id: string) => {
    if (!effectiveCompanyId) return;

    const avisRef = doc(
      db,
      "companies",
      effectiveCompanyId,
      "avis",
      id
    );

    await deleteDoc(avisRef);
  };

  /* =========================
     UI
  ========================= */
  return (
    <div className="max-w-7xl mx-auto p-6">
      {agencies.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Agence :</label>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
          >
            <option value="">Toutes les agences</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.nom}</option>
            ))}
          </select>
          {aggregatedRating != null && (
            <span className="text-sm text-gray-600">
              Note moyenne : <strong>{aggregatedRating}</strong> / 5 ({filteredAvis.length} avis)
            </span>
          )}
        </div>
      )}

      {loading && avisList.length === 0 && (
        <p>Chargement des avis...</p>
      )}

      {!loading && filteredAvis.length === 0 && (
        <p>Aucun avis en attente pour l’instant ✅</p>
      )}

      <ul className="space-y-4">
        {filteredAvis.map((avis) => (
          <li
            key={avis.id}
            className="border p-4 rounded-xl shadow-sm bg-white flex flex-col gap-2"
          >
            <div className="flex justify-between items-center">
              <h4 className="font-semibold">
                {avis.nom} — ⭐ {avis.note}
              </h4>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    toggleVisibility(avis.id, avis.visible)
                  }
                  className="text-sm px-3 py-1 rounded bg-green-100 text-green-700"
                >
                  Publier
                </button>

                <button
                  onClick={() => handleDelete(avis.id)}
                  className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                >
                  Supprimer
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-600 italic">
              {avis.commentaire}
            </p>
          </li>
        ))}
      </ul>

    </div>
  );
};

export default AvisModerationPage;
