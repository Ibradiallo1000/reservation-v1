// src/pages/AgenceShiftPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveShift } from "@/modules/agence/hooks/useActiveShift";

const AgenceShiftPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { activeShift } = useActiveShift();
  const [loading, setLoading] = useState(false);

  const staffCode =
    (user as any)?.staffCode ||
    (user as any)?.codeCourt ||
    (user as any)?.code ||
    "—";

  // 🔒 Vérification logique
  const canOperate = useMemo(
    () => !!user?.companyId && !!user?.agencyId && !!user?.uid,
    [user?.companyId, user?.agencyId, user?.uid]
  );

  // ✅ IDs sécurisés pour TypeScript
  const companyId = user?.companyId;
  const agencyId = user?.agencyId;

  /* =========================
     OUVRIR LE POSTE
  ========================= */
  const openShift = useCallback(async () => {
    if (!canOperate || !companyId || !agencyId) return;

    setLoading(true);
    try {
      await addDoc(
        collection(db, "companies", companyId, "agences", agencyId, "shifts"),
        {
          isOpen: true,
          openedAt: serverTimestamp(),
          openedBy: {
            uid: user!.uid,
            displayName: user!.displayName || user!.email || "—",
            staffCode,
          },
          companyId,
          agencyId,
        }
      );

      navigate("/agence/guichet");
    } finally {
      setLoading(false);
    }
  }, [canOperate, companyId, agencyId, navigate, staffCode, user]);

  /* =========================
     FERMER LE POSTE
  ========================= */
  const closeShift = useCallback(async () => {
    if (!canOperate || !companyId || !agencyId || !activeShift?.id) return;

    setLoading(true);
    try {
      await updateDoc(
        doc(
          db,
          "companies",
          companyId,
          "agences",
          agencyId,
          "shifts",
          activeShift.id
        ),
        {
          isOpen: false,
          closedAt: serverTimestamp(),
          closedBy: {
            uid: user!.uid,
            displayName: user!.displayName || user!.email || "—",
            staffCode,
          },
        }
      );

      navigate("/agence/guichet");
    } finally {
      setLoading(false);
    }
  }, [
    activeShift?.id,
    canOperate,
    companyId,
    agencyId,
    navigate,
    staffCode,
    user,
  ]);

  /* =========================
     ACTION AUTO (?action=open|close)
  ========================= */
  useEffect(() => {
    const action = params.get("action");
    if (action === "open" && !activeShift && !loading) openShift();
    if (action === "close" && activeShift && !loading) closeShift();
  }, [params, activeShift, loading, openShift, closeShift]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestion du poste</h1>
        <Link to="/agence/guichet" className="px-3 py-2 rounded-lg border">
          Retour guichet
        </Link>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="text-sm text-gray-600">
          Guichetier :{" "}
          <strong>{user?.displayName || user?.email}</strong> (
          <strong>{staffCode}</strong>)
        </div>

        <div className="text-sm">
          État actuel :{" "}
          {activeShift ? (
            <span className="text-green-700 font-semibold">
              Poste actif (#{activeShift.id?.slice?.(0, 6)})
            </span>
          ) : (
            <span className="text-amber-700 font-semibold">
              Aucun poste ouvert
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            disabled={loading || !!activeShift || !canOperate}
            onClick={openShift}
            className={`px-4 py-2 rounded-lg border ${
              activeShift ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            Activer le poste
          </button>

          <button
            disabled={loading || !activeShift || !canOperate}
            onClick={closeShift}
            className={`px-4 py-2 rounded-lg border ${
              !activeShift ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            Clôturer le poste
          </button>
        </div>

        {!canOperate && (
          <div className="text-red-600 text-sm">
            Impossible d’opérer : informations utilisateur incomplètes.
          </div>
        )}
      </div>
    </div>
  );
};

export default AgenceShiftPage;
