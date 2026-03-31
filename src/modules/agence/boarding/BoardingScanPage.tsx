// src/modules/agence/boarding/BoardingScanPage.tsx
// Liste / scan : capacité depuis le véhicule de l’affectation validée uniquement.
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import AgenceEmbarquementPage from "@/modules/agence/embarquement/pages/AgenceEmbarquementPage";
import { StandardLayoutWrapper } from "@/ui";
import {
  BOARDING_SESSION_IN_USE_MSG,
  getVehicleCapacity,
  startBoardingSessionLock,
  tripAssignmentDocId,
  type TripAssignmentDoc,
} from "@/modules/agence/planning/tripAssignmentService";
import { getOrCreateBoardingClientInstanceId, persistBoardingSlotSnapshot } from "@/modules/agence/embarquement/boardingSlotSnapshot";

const BoardingScanPage: React.FC = () => {
  const { user } = useAuth() as { user: { companyId?: string; uid?: string } };
  const navigate = useNavigate();
  const location = useLocation() as {
    state?: {
      agencyId?: string;
      date?: string;
      heure?: string;
      tripId?: string;
      departure?: string;
      arrival?: string;
      trajet?: string;
      assignmentId?: string;
      vehicleId?: string;
    };
  };
  const [vehicleCapacity, setVehicleCapacity] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const companyId = user?.companyId ?? null;
  const uid = user?.uid ?? null;
  const agencyId = location.state?.agencyId ?? null;
  const date = location.state?.date ?? null;
  const heure = location.state?.heure ?? null;
  const tripId = location.state?.tripId ?? undefined;
  const assignmentId = location.state?.assignmentId ?? null;
  const vehicleId = location.state?.vehicleId ?? null;
  const departure = location.state?.departure ?? "";
  const arrival = location.state?.arrival ?? "";
  const deniedLockAssignments = React.useRef<Set<string>>(new Set());
  const isPermissionDenied = (msg: string) => {
    const m = String(msg ?? "").toLowerCase();
    return m.includes("missing or insufficient permissions") || m.includes("permission_denied");
  };

  useEffect(() => {
    if (!companyId || !agencyId || !date || !heure) {
      setBlocked("Sélectionnez un départ depuis Départs planifiés pour ouvrir le scan.");
      setVehicleCapacity(null);
      setResolved(true);
      return;
    }
    const resolvedAssignmentId =
      assignmentId || (tripId ? tripAssignmentDocId(tripId, date, heure) : null);
    if (!resolvedAssignmentId) {
      setBlocked("Ce trajet n’a pas encore de véhicule assigné (créneau incomplet ou absent du tableau des départs).");
      setVehicleCapacity(null);
      setResolved(true);
      return;
    }
    if (deniedLockAssignments.current.has(resolvedAssignmentId)) {
      setResolved(true);
      return;
    }
    if (!uid) {
      setBlocked("Session expirée : reconnectez-vous pour embarquer.");
      setVehicleCapacity(null);
      setResolved(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, `companies/${companyId}/agences/${agencyId}/tripAssignments/${resolvedAssignmentId}`);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          if (!cancelled) {
            setBlocked("Affectation introuvable.");
            setResolved(true);
          }
          return;
        }
        const data = snap.data() as TripAssignmentDoc;
        if (data.status !== "validated" && data.status !== "planned") {
          if (!cancelled) {
            setBlocked("Cette affectation n’est plus utilisable pour l’embarquement.");
            setResolved(true);
          }
          return;
        }
        if (data.tripId !== tripId || data.date !== date || data.heure !== heure) {
          if (!cancelled) {
            setBlocked("Les paramètres ne correspondent pas à l’affectation.");
            setResolved(true);
          }
          return;
        }
        const vidFromAssignment = String(data.vehicleId ?? "").trim();
        if (!vidFromAssignment) {
          if (!cancelled) {
            setBlocked("Ce trajet n’a pas encore de véhicule assigné.");
            setResolved(true);
          }
          return;
        }
        const cap = await getVehicleCapacity(companyId, vidFromAssignment);
        const clientId = getOrCreateBoardingClientInstanceId();
        try {
          await startBoardingSessionLock(companyId, agencyId, resolvedAssignmentId, uid, clientId);
        } catch (lockErr: unknown) {
          const lm = String((lockErr as Error)?.message ?? lockErr);
          if (!cancelled) {
            if (lm.includes(BOARDING_SESSION_IN_USE_MSG)) {
              setBlocked(BOARDING_SESSION_IN_USE_MSG);
              setVehicleCapacity(null);
              setResolved(true);
              return;
            }
            if (!isPermissionDenied(lm)) {
              setBlocked(lm || "Impossible de verrouiller la session d’embarquement.");
              setVehicleCapacity(null);
              setResolved(true);
              return;
            }
            deniedLockAssignments.current.add(resolvedAssignmentId);
          }
          console.warn("[BoardingScanPage] lock skipped due to rules permissions:", lm);
        }
        persistBoardingSlotSnapshot({
          v: 1,
          companyId,
          agencyId,
          assignmentId: resolvedAssignmentId,
          vehicleId: vidFromAssignment,
          tripId: tripId ?? "",
          departure: departure || undefined,
          arrival: arrival || undefined,
          date,
          heure,
          assignmentStatus: data.status === "planned" ? "planned" : "validated",
          clientInstanceId: clientId,
          savedAt: Date.now(),
          vehicleCapacity: cap,
        });
        if (!cancelled) {
          setVehicleCapacity(cap);
          setResolved(true);
        }
      } catch {
        if (!cancelled) {
          setBlocked("Impossible de vérifier l’affectation.");
          setResolved(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId, date, heure, tripId, assignmentId, uid, departure, arrival]);

  if (!resolved) {
    return (
      <StandardLayoutWrapper>
        <div className="p-6 flex items-center justify-center min-h-[200px] text-gray-500">
          Vérification de l’affectation et de la capacité…
        </div>
      </StandardLayoutWrapper>
    );
  }

  if (blocked) {
    return (
      <StandardLayoutWrapper maxWidthClass="max-w-lg">
        <div className="p-6 space-y-4">
          <p className="text-gray-800 dark:text-gray-100">{blocked}</p>
          <button
            type="button"
            className="text-sm text-sky-600 dark:text-sky-400 underline"
            onClick={() => navigate("/agence/boarding", { replace: true })}
          >
            Retour aux départs du jour
          </button>
        </div>
      </StandardLayoutWrapper>
    );
  }

  const assignmentStatus =
    (location.state as { assignmentStatus?: "planned" | "validated" } | undefined)?.assignmentStatus ?? "validated";

  return (
    <AgenceEmbarquementPage
      vehicleCapacity={vehicleCapacity}
      boardingAssignmentStatus={assignmentStatus}
    />
  );
};

export default BoardingScanPage;
