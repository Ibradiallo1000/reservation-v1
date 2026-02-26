// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  onIdTokenChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  collection,
  updateDoc,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import { Role, permissionsByRole } from "@/roles-permissions";
import { Company } from "@/types/companyTypes";
import { CustomUser } from "@/types/auth";

/* =========================
   Types
========================= */
interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  companyId: string | null;
  company: Company | null;
  isPlatformAdmin: boolean;
  isLoggingOut: boolean;
}

export const AuthContext = createContext<AuthContextType>(null as any);

/* =========================
   Utils
========================= */
/** Canonical roles only. Unknown → unauthenticated. agency_boarding_officer / embarquement → chefEmbarquement. */
const CANONICAL_ROLES: ReadonlySet<string> = new Set([
  "admin_platforme",
  "admin_compagnie",
  "company_accountant",
  "agency_accountant",
  "chef_garage",
  "chefagence",
  "chefembarquement",
  "guichetier",
  "agency_fleet_controller",
  "financial_director",
  "agentcourrier",
]);

const normalizeRole = (r?: string): Role => {
  if (!r || typeof r !== "string") return "unauthenticated";
  const role = r.trim().toLowerCase();
  switch (role) {
    case "chefagence":
      return "chefAgence";
    case "chefgarage":
      return "chef_garage";
    case "chefembarquement":
      return "chefEmbarquement";
    case "company_ceo":
      return "admin_compagnie";
    case "agentcourrier":
      return "agentCourrier";
    default:
      if (CANONICAL_ROLES.has(role)) return role as Role;
      if (role === "agency_boarding_officer" || role === "embarquement") return "chefEmbarquement";
      console.error("Unknown role in AuthContext:", r);
      return "unauthenticated";
  }
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/* =========================
   Fonction de redirection par rôle (EXPORTÉE)
========================= */
const asArray = (x: unknown) => (Array.isArray(x) ? x : [x].filter(Boolean));
const hasAny = (roles: unknown, allowed: readonly string[]) =>
  asArray(roles).some((r) => allowed.includes(String(r)));

export const landingTargetForRoles = (roles: unknown): string => {
  const rolesArray = asArray(roles).map(String);

  // admin_platforme → /admin/dashboard
  if (hasAny(rolesArray, ["admin_platforme"])) return "/admin/dashboard";

  // company_ceo / admin_compagnie → /compagnie/command-center (Phase 5)
  if (hasAny(rolesArray, ["admin_compagnie", "company_ceo"])) return "/compagnie/command-center";
  // chef_garage → garage layout (Flotte uniquement) ; redirect avec companyId dans LoginPage/RoleLanding
  if (hasAny(rolesArray, ["chef_garage"])) return "/compagnie/garage/dashboard";

  // company_accountant / financial_director → /chef-comptable
  if (hasAny(rolesArray, ["company_accountant", "financial_director"])) return "/chef-comptable";

  // agency_accountant → /agence/comptabilite
  if (hasAny(rolesArray, ["agency_accountant"])) return "/agence/comptabilite";

  // chefEmbarquement → /agence/boarding (embarquement)
  if (hasAny(rolesArray, ["chefEmbarquement"])) return "/agence/boarding";
  // chefAgence → /agence/dashboard (rolesArray may be from context: chefAgence or chefagence)
  if (hasAny(rolesArray, ["chefAgence", "chefagence"])) return "/agence/dashboard";
  // agency_fleet_controller → /agence/fleet
  if (hasAny(rolesArray, ["agency_fleet_controller"])) return "/agence/fleet";

  // guichetier → /agence/guichet
  if (hasAny(rolesArray, ["guichetier"])) return "/agence/guichet";

  // unauthenticated / user / unknown → /login
  return "/login";
};

/* =========================
   Provider
========================= */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const subscribedRef = useRef(false);

  /* =========================
     Attacher invitation
  ========================= */
  const attachInvitationIfNeeded = useCallback(
    async (firebaseUser: FirebaseUser) => {
      if (isLoggingOut) return;
      if (!firebaseUser.email) return;

      const userRef = doc(db, "users", firebaseUser.uid);
      const existing = await getDoc(userRef);
      if (existing.exists()) return;

      const q = query(
        collection(db, "invitations"),
        where("email", "==", firebaseUser.email),
        where("status", "==", "pending")
      );

      const snap = await getDocs(q);
      if (snap.empty) return;

      const invite = snap.docs[0];
      const data: any = invite.data();

      const invRole = data.role ?? "chefAgence";
      const canonicalRole =
        invRole === "comptable" && data.agencyId
          ? "agency_accountant"
          : invRole === "comptable"
            ? "company_accountant"
            : invRole === "company_ceo"
              ? "admin_compagnie"
              : invRole;

      await setDoc(userRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: canonicalRole,
        companyId: data.companyId,
        agencyId: data.agencyId ?? "",
        nom: data.fullName ?? "",
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });

      await updateDoc(invite.ref, {
        status: "accepted",
        uid: firebaseUser.uid,
        acceptedAt: serverTimestamp(),
      });

      if (data.companyId && data.agencyId) {
        const agencyUserRef = doc(
          db,
          "companies",
          data.companyId,
          "agences",
          data.agencyId,
          "users",
          invite.ref.id
        );
        try {
          await updateDoc(agencyUserRef, {
            invitationPending: false,
            uid: firebaseUser.uid,
          });
        } catch {
          /* Doc may not exist; ignore */
        }
      }
    },
    [isLoggingOut]
  );

  /* =========================
     Charger utilisateur
  ========================= */
  const fetchUserDoc = useCallback(
    async (firebaseUser: FirebaseUser) => {
      if (isLoggingOut) return;

      await attachInvitationIfNeeded(firebaseUser);

      const userRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          role: "unauthenticated",
          companyId: "",
          nom: "",
        } as CustomUser);
        setCompany(null);
        return;
      }

      const data: any = snap.data();
      // Legacy: resolve "comptable" from Firestore before normalization (until migration runs)
      const rawRole = data.role;
      const resolvedRole =
        rawRole === "comptable" && data.agencyId
          ? "agency_accountant"
          : rawRole === "comptable"
            ? "company_accountant"
            : rawRole;
      const role = normalizeRole(resolvedRole);

      const permissions = Array.from(
        new Set([
          ...(data.permissions || []),
          ...(permissionsByRole[role] || []),
        ])
      );

      const customUser: CustomUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || data.email || "",
        displayName: firebaseUser.displayName || data.nom || "",
        companyId: data.companyId || "",
        role,
        nom: data.nom || "",
        ville: data.ville || "",
        agencyId: data.agencyId || "",
        agencyName: data.agencyName,
        lastLogin: toDate(data.lastLogin),
        permissions,
        companyLogo: data.companyLogo,
        companyColor: data.companyColor,
        agencyTelephone: data.agencyTelephone,
        agencyNom: data.agencyNom,
        agencyLogoUrl: data.agencyLogoUrl,
      };

      setUser(customUser);

      if (customUser.companyId) {
        const companySnap = await getDoc(
          doc(db, "companies", customUser.companyId)
        );
        setCompany(
          companySnap.exists()
            ? ({ ...(companySnap.data() as Company), id: companySnap.id })
            : null
        );
      } else {
        setCompany(null);
      }
    },
    [attachInvitationIfNeeded, isLoggingOut]
  );

  const refreshUser = useCallback(async () => {
    if (auth.currentUser && !isLoggingOut) {
      await fetchUserDoc(auth.currentUser);
    }
  }, [fetchUserDoc, isLoggingOut]);

  /* =========================
     LOGOUT SAFE
  ========================= */
  const logout = useCallback(async () => {
    setIsLoggingOut(true);

    // Nettoyage immédiat (UI + hooks)
    setUser(null);
    setCompany(null);

    try {
      await signOut(auth);
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      const role = normalizeRole(user.role);
      if (role === "unauthenticated") return false;
      if (role === "admin_platforme") return true;
      return !!user.permissions?.includes(permission);
    },
    [user]
  );

  /* =========================
     Auth listener
  ========================= */
  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    setPersistence(auth, browserLocalPersistence).then(() => {
      onIdTokenChanged(auth, async (fbUser) => {
        if (isLoggingOut) return;

        setLoading(true);

        if (!fbUser) {
          setUser(null);
          setCompany(null);
          setLoading(false);
          return;
        }

        try {
          await fetchUserDoc(fbUser);
        } catch (e: any) {
          if (e?.code !== "permission-denied") {
            console.error("❌ AuthContext error:", e);
          }
        } finally {
          setLoading(false);
        }
      });
    });
  }, [fetchUserDoc, isLoggingOut]);

  const isPlatformAdmin = useMemo(
    () => normalizeRole(user?.role) === "admin_platforme",
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout,
        refreshUser,
        hasPermission,
        companyId: user?.companyId || null,
        company,
        isPlatformAdmin,
        isLoggingOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);