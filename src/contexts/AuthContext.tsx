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

/* =========================
   Types
========================= */
export interface CustomUser {
  uid: string;
  email: string;
  displayName?: string;

  companyId: string;
  role: Role;
  nom: string;
  ville?: string;

  agencyId?: string;
  agencyName?: string;

  lastLogin?: Date | null;
  permissions?: string[];

  companyLogo?: string;
  companyColor?: string;

  agencyTelephone?: string;
  agencyNom?: string;
  agencyLogoUrl?: string;
}

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
const normalizeRole = (r?: string): Role => {
  const raw = (r ?? "user").trim();
  const normalized =
    raw === "chef_agence" || raw === "chefagence" ? "chefAgence" : raw;
  return (permissionsByRole[normalized as Role]
    ? normalized
    : "user") as Role;
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if ((v as Timestamp)?.toDate) return (v as Timestamp).toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
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

      await setDoc(userRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: data.role ?? "chefAgence",
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
          role: "user",
          companyId: "",
          nom: "",
        } as CustomUser);
        setCompany(null);
        return;
      }

      const data: any = snap.data();
      const role = normalizeRole(data.role);

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
      if (normalizeRole(user.role) === "admin_platforme") return true;
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
            console.error("AuthContext error:", e);
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
