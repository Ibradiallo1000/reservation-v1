// =============================================
// src/pages/AvisModerationPage.tsx
// =============================================

import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
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
}

const AvisModerationPage: React.FC = () => {
  const { user, company } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();

  // 🔥 Priorité URL → sinon user
  const effectiveCompanyId = routeCompanyId ?? user?.companyId;

  const theme = useCompanyTheme(company);
  const { setHeader, resetHeader } = usePageHeader();

  const [avisList, setAvisList] = useState<Avis[]>([]);
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
    <div className="max-w-4xl mx-auto p-6">

      {loading && avisList.length === 0 && (
        <p>Chargement des avis...</p>
      )}

      {!loading && avisList.length === 0 && (
        <p>Aucun avis en attente pour l’instant ✅</p>
      )}

      <ul className="space-y-4">
        {avisList.map((avis) => (
          <li
            key={avis.id}
            className="border p-4 rounded shadow-sm bg-white flex flex-col gap-2"
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
