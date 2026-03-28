/**
 * État partagé poste courrier (session, colis, ledger) — UI uniquement, mêmes services qu’avant.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  createCourierSession,
  closeCourierSession as closeCourierSessionService,
} from "@/modules/logistics/services/courierSessionService";
import { getCourierSessionLedgerTotal } from "@/modules/logistics/services/courierSessionLedger";
import { courierSessionsRef, courierSessionRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { markShipmentInTransit } from "@/modules/logistics/services/markShipmentInTransit";
import { playSound } from "@/modules/agence/guichet/components/pos/sounds";

export type CourierCounterUiStatus = "open" | "pending" | "closed";

export interface CourierWorkspaceContextValue {
  session: CourierSession | null;
  sessionId: string | null;
  shipments: Shipment[];
  ledgerSessionTotal: number | null;
  agentCode: string;
  agentName: string;
  agentId: string;
  companyId: string;
  agencyId: string;
  agencies: { id: string; nomAgence?: string; nom?: string }[];
  companyName: string;
  agencyName: string;
  companyLogoUrl: string | undefined;
  primaryColor: string;
  secondaryColor: string;
  counterUiStatus: CourierCounterUiStatus;
  isOnline: boolean;
  hubLoading: boolean;
  hubError: string | null;
  setHubError: (e: string | null) => void;
  showCloseModal: boolean;
  openComptoir: () => Promise<void>;
  requestCloseComptoir: () => void;
  confirmCloseComptoir: () => Promise<void>;
  cancelCloseComptoir: () => void;
  inTransitLoading: Record<string, boolean>;
  markInTransit: (shipmentId: string) => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  /** True jusqu’au premier snapshot Firestore des sessions agent (évite flash « comptoir fermé »). */
  isSessionLoading: boolean;
}

const CourierWorkspaceContext = createContext<CourierWorkspaceContextValue | null>(null);

export function useCourierWorkspace(): CourierWorkspaceContextValue {
  const v = useContext(CourierWorkspaceContext);
  if (!v) throw new Error("useCourierWorkspace must be used within CourierWorkspaceProvider");
  return v;
}

type Props = {
  children: React.ReactNode;
  agencyNameResolved: string;
  primaryColor: string;
  secondaryColor: string;
  isOnline: boolean;
};

export function CourierWorkspaceProvider({
  children,
  agencyNameResolved,
  primaryColor,
  secondaryColor,
  isOnline,
}: Props) {
  const { user, company } = useAuth() as {
    user: {
      uid: string;
      companyId?: string;
      agencyId?: string;
      displayName?: string;
      email?: string;
      agencyNom?: string;
      staffCode?: string;
      codeCourt?: string;
      code?: string;
    };
    company: { nom?: string; logoUrl?: string } | null;
  };

  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const agentId = user?.uid ?? "";
  const agentName = user?.displayName ?? user?.email ?? "Agent";
  const companyName = company?.nom ?? "Compagnie";
  const companyLogoUrl = company?.logoUrl ?? undefined;

  const [session, setSession] = useState<CourierSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [agentCodeFromTeam, setAgentCodeFromTeam] = useState<string | null>(null);
  const [ledgerSessionTotal, setLedgerSessionTotal] = useState<number | null>(null);
  const [inTransitLoading, setInTransitLoading] = useState<Record<string, boolean>>({});
  const [agencies, setAgencies] = useState<{ id: string; nomAgence?: string; nom?: string }[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem("teliya_courier_sound") !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("teliya_courier_sound", soundEnabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [soundEnabled]);

  const agentCode = useMemo(
    () =>
      agentCodeFromTeam
      ?? user?.staffCode
      ?? user?.codeCourt
      ?? user?.code
      ?? "GUEST",
    [agentCodeFromTeam, user]
  );

  useEffect(() => {
    if (!agentId || !companyId || !agencyId) return;
    (async () => {
      try {
        const rootSnap = await getDoc(doc(db, "users", agentId));
        if (rootSnap.exists()) {
          const u = rootSnap.data() as { staffCode?: string; codeCourt?: string; code?: string };
          const code = u.staffCode || u.codeCourt || u.code;
          if (code) {
            setAgentCodeFromTeam(code);
            return;
          }
        }
        const usersRef = collection(db, "companies", companyId, "agences", agencyId, "users");
        const snap = await getDocs(query(usersRef, where("uid", "==", agentId)));
        if (snap.docs.length > 0) {
          const d = snap.docs[0].data() as {
            agentCode?: string;
            staffCode?: string;
            codeCourt?: string;
            code?: string;
          };
          const code = d.agentCode || d.staffCode || d.codeCourt || d.code;
          if (code) setAgentCodeFromTeam(code);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [agentId, companyId, agencyId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, "companies", companyId, "agences")).then((snap) => {
      setAgencies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; nomAgence?: string; nom?: string })));
    });
  }, [companyId]);

  const byTime = (d: { data: () => Record<string, unknown> }) =>
    (d.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;

  useEffect(() => {
    if (!companyId || !agencyId || !agentId) {
      setSession(null);
      setSessionId(null);
      setIsSessionLoading(false);
      return;
    }
    setIsSessionLoading(true);
    const col = courierSessionsRef(db, companyId, agencyId);
    const unsub = onSnapshot(
      query(col, where("agentId", "==", agentId)),
      (snap) => {
        const sorted = [...snap.docs].sort((a, b) => byTime(b) - byTime(a));
        const open = sorted.filter((d) => {
          const st = (d.data() as CourierSession).status;
          return st === "PENDING" || st === "ACTIVE";
        });
        const pick = open.length > 0 ? open.sort((a, b) => byTime(b) - byTime(a))[0] : sorted[0];
        if (pick) {
          setSessionId(pick.id);
          setSession({ ...pick.data(), sessionId: pick.id } as CourierSession);
        } else {
          setSessionId(null);
          setSession(null);
        }
        setIsSessionLoading(false);
      },
      () => {
        setIsSessionLoading(false);
      }
    );
    return () => unsub();
  }, [companyId, agencyId, agentId]);

  useEffect(() => {
    if (!companyId || !agencyId || !sessionId) return;
    const sessionRef = courierSessionRef(db, companyId, agencyId, sessionId);
    const unsub = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        setSession({ ...snap.data(), sessionId: snap.id } as CourierSession);
      }
    });
    return () => unsub();
  }, [companyId, agencyId, sessionId]);

  useEffect(() => {
    if (!companyId || !sessionId) {
      setShipments([]);
      return;
    }
    const q = query(shipmentsRef(db, companyId), where("sessionId", "==", sessionId));
    const unsub = onSnapshot(q, (snap) => {
      setShipments(
        snap.docs.map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment))
      );
    });
    return () => unsub();
  }, [companyId, sessionId]);

  useEffect(() => {
    if (!companyId || !sessionId) {
      setLedgerSessionTotal(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const t = await getCourierSessionLedgerTotal(companyId, sessionId);
        if (!cancelled) setLedgerSessionTotal(t);
      } catch {
        if (!cancelled) setLedgerSessionTotal(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, sessionId, shipments.length]);

  const counterUiStatus: CourierCounterUiStatus = useMemo(() => {
    if (!session) return "closed";
    if (session.status === "ACTIVE") return "open";
    if (session.status === "PENDING") return "pending";
    return "closed";
  }, [session]);

  const openComptoir = useCallback(async () => {
    setHubError(null);
    setHubLoading(true);
    try {
      await createCourierSession({ companyId, agencyId, agentId, agentCode });
      if (soundEnabled) playSound("click");
    } catch (e) {
      setHubError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setHubLoading(false);
    }
  }, [companyId, agencyId, agentId, agentCode, soundEnabled]);

  const confirmCloseComptoir = useCallback(async () => {
    if (!sessionId) return;
    setHubError(null);
    setHubLoading(true);
    try {
      await closeCourierSessionService({ companyId, agencyId, sessionId });
      setShowCloseModal(false);
      if (soundEnabled) playSound("close");
    } catch (e) {
      setHubError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setHubLoading(false);
    }
  }, [companyId, agencyId, sessionId, soundEnabled]);

  const markInTransit = useCallback(
    async (shipmentId: string) => {
      setHubError(null);
      setInTransitLoading((p) => ({ ...p, [shipmentId]: true }));
      try {
        await markShipmentInTransit({
          companyId,
          shipmentId,
          performedBy: agentId,
          agencyId,
        });
        if (soundEnabled) playSound("click");
      } catch (e) {
        setHubError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setInTransitLoading((p) => ({ ...p, [shipmentId]: false }));
      }
    },
    [companyId, agencyId, agentId, soundEnabled]
  );

  const value = useMemo<CourierWorkspaceContextValue>(
    () => ({
      session,
      sessionId,
      shipments,
      ledgerSessionTotal,
      agentCode,
      agentName,
      agentId,
      companyId,
      agencyId,
      agencies,
      companyName,
      agencyName: agencyNameResolved,
      companyLogoUrl,
      primaryColor,
      secondaryColor,
      counterUiStatus,
      isOnline,
      hubLoading,
      hubError,
      setHubError,
      showCloseModal,
      openComptoir,
      requestCloseComptoir: () => setShowCloseModal(true),
      confirmCloseComptoir,
      cancelCloseComptoir: () => setShowCloseModal(false),
      inTransitLoading,
      markInTransit,
      soundEnabled,
      setSoundEnabled,
      isSessionLoading,
    }),
    [
      session,
      sessionId,
      isSessionLoading,
      shipments,
      ledgerSessionTotal,
      agentCode,
      agentName,
      agentId,
      companyId,
      agencyId,
      agencies,
      companyName,
      agencyNameResolved,
      companyLogoUrl,
      primaryColor,
      secondaryColor,
      counterUiStatus,
      isOnline,
      hubLoading,
      hubError,
      showCloseModal,
      openComptoir,
      confirmCloseComptoir,
      inTransitLoading,
      soundEnabled,
    ]
  );

  return (
    <CourierWorkspaceContext.Provider value={value}>{children}</CourierWorkspaceContext.Provider>
  );
}
