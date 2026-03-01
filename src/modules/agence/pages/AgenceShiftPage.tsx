// src/pages/AgenceShiftPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageOfflineState } from "@/shared/ui/PageStates";
import { StandardLayoutWrapper, PageHeader, SectionCard, StatusBadge, ActionButton } from "@/ui";

const AgenceShiftPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { activeShift } = useActiveShift();
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
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
    } catch {
      setError(
        !isOnline
          ? "Connexion indisponible. Impossible d'ouvrir le poste."
          : "Erreur lors de l'ouverture du poste."
      );
    } finally {
      setLoading(false);
    }
  }, [canOperate, companyId, agencyId, navigate, staffCode, user, isOnline]);

  /* =========================
     FERMER LE POSTE
  ========================= */
  const closeShift = useCallback(async () => {
    if (!canOperate || !companyId || !agencyId || !activeShift?.id) return;

    setLoading(true);
    setError(null);
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
    } catch {
      setError(
        !isOnline
          ? "Connexion indisponible. Impossible de clôturer le poste."
          : "Erreur lors de la clôture du poste."
      );
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
    isOnline,
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
    <StandardLayoutWrapper>
      {!isOnline && (
        <PageOfflineState message="Connexion instable: les actions d'ouverture/clôture peuvent échouer." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setError(null)} />
      )}
      <PageHeader
        title="Gestion du poste"
        right={
          <ActionButton variant="secondary" onClick={() => navigate("/agence/guichet")}>
            Retour guichet
          </ActionButton>
        }
      />

      <SectionCard title="Poste guichet">
        <div className="text-sm text-gray-600">
          Guichetier :{" "}
          <strong>{user?.displayName || user?.email}</strong> (
          <strong>{staffCode}</strong>)
        </div>

        <div className="text-sm">
          État actuel :{" "}
          {activeShift ? (
            <StatusBadge status="active">Poste actif (#{activeShift.id?.slice?.(0, 6)})</StatusBadge>
          ) : (
            <StatusBadge status="pending">Aucun poste ouvert</StatusBadge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={loading || !!activeShift || !canOperate}
            onClick={openShift}
            variant="primary"
          >
            Activer le poste
          </ActionButton>
          <ActionButton
            disabled={loading || !activeShift || !canOperate}
            onClick={closeShift}
            variant="secondary"
          >
            Clôturer le poste
          </ActionButton>
        </div>

        {!canOperate && (
          <div className="text-red-600 text-sm">
            Impossible d’opérer : informations utilisateur incomplètes.
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default AgenceShiftPage;
