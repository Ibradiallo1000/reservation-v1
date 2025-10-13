import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState, useCallback,
} from "react";
import {
  onIdTokenChanged, signOut, setPersistence, browserLocalPersistence, User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { Role, permissionsByRole } from "@/roles-permissions";
import { Company } from "@/types/companyTypes";

export interface CustomUser {
  uid: string;
  email: string;
  displayName?: string;

  companyId: string;
  role: Role;
  nom: string;
  ville: string;

  agencyId: string;
  agencyName: string;

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
  isPlatformAdmin: boolean;            // 👈 ajouté
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshUser: async () => {},
  hasPermission: () => false,
  companyId: null,
  company: null,
  isPlatformAdmin: false,
});

const normalizeRole = (r?: string): Role => {
  const raw = (r ?? "user").trim();
  const normalized =
    raw === "chef_agence" || raw === "chefagence" ? "chefAgence" : raw;
  return (permissionsByRole[normalized as Role] ? normalized : "user") as Role;
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if ((v as Timestamp)?.toDate) return (v as Timestamp).toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const subscribedRef = useRef(false);

  const fetchUserDoc = useCallback(async (firebaseUser: FirebaseUser) => {
    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error("Document utilisateur non trouvé");

    const data: any = snap.data() || {};
    const role: Role = normalizeRole(data.role);

    const mergedPermissions = Array.from(
      new Set([...(data.permissions || []), ...(permissionsByRole[role] || [])])
    );

    const custom: CustomUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || data.email || "",
      displayName: firebaseUser.displayName || data.displayName || data.nom || "",

      companyId: data.companyId || "",
      role,
      nom: data.nom || "",
      ville: data.ville || "",

      agencyId: data.agencyId || "",
      agencyName: data.agencyName || `${data.ville || "Agence"} Principale`,

      lastLogin: toDate(data.lastLogin),
      permissions: mergedPermissions,

      companyLogo: data.companyLogo,
      companyColor: data.companyColor,

      agencyTelephone: data.agencyTelephone,
      agencyNom: data.agencyNom,
      agencyLogoUrl: data.agencyLogoUrl,
    };

    setUser(custom);

    if (custom.companyId) {
      const companyRef = doc(db, "companies", custom.companyId);
      const companySnap = await getDoc(companyRef);
      setCompany(
        companySnap.exists()
          ? ({ ...(companySnap.data() as Company), id: companySnap.id })
          : null
      );
    } else {
      setCompany(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) await fetchUserDoc(auth.currentUser);
  }, [fetchUserDoc]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setCompany(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      const role: Role = normalizeRole(user.role);
      if (role === "admin_platforme") return true;
      return !!user.permissions?.includes(permission);
    },
    [user]
  );

  useEffect(() => {
    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (e) {
        console.error("Erreur de persistance Firebase:", e);
      }
      if (subscribedRef.current) return;
      subscribedRef.current = true;

      const unsub = onIdTokenChanged(auth, async (fbUser) => {
        try {
          if (fbUser) {
            await fetchUserDoc(fbUser);
          } else {
            setUser(null);
            setCompany(null);
          }
        } catch (e) {
          console.error("Erreur auth state:", e);
          setUser(null);
          setCompany(null);
        } finally {
          setLoading(false);
        }
      });

      return () => unsub();
    })();
  }, [fetchUserDoc]);

  const isPlatformAdmin = useMemo(
    () => normalizeRole(user?.role) === "admin_platforme",
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      logout,
      refreshUser,
      hasPermission,
      companyId: user?.companyId || null,
      company,
      isPlatformAdmin,                 // 👈 exposé
    }),
    [user, loading, logout, refreshUser, hasPermission, company, isPlatformAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
};

export { AuthContext };
