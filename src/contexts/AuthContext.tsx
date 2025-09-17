// ✅ src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser,
  getIdToken,
} from "firebase/auth";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { Role, permissionsByRole } from "@/roles-permissions";

/* ===================== Types ===================== */
export interface CustomUser {
  uid: string;
  email: string;
  displayName?: string;

  // société / agence
  companyId: string;
  role: Role;
  nom: string;
  ville: string;

  agencyId: string;
  agencyName: string;

  // UI / extras
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
  company?: any;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshUser: async () => {},
  hasPermission: () => false,
  company: null,
});

/* ===================== Helpers ===================== */

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

/* ===================== Provider ===================== */

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any | null>(null);

  const fetchUserData = useCallback(async (firebaseUser: FirebaseUser) => {
    // ⚠️ Si les custom claims viennent d’être modifiés côté Admin SDK,
    // force le refresh du token pour récupérer role/companyId à jour.
    try {
      await getIdToken(firebaseUser, true);
    } catch {
      /* ignore */
    }

    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      throw new Error("Document utilisateur non trouvé");
    }

    const data: any = snap.data() || {};
    const role: Role = normalizeRole(data.role);

    // Fusion des permissions: Firestore + permissions par rôle
    const mergedPermissions = Array.from(
      new Set([...(data.permissions || []), ...(permissionsByRole[role] || [])])
    );

    const custom: CustomUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || data.email || "",
      displayName:
        firebaseUser.displayName || data.displayName || data.nom || "",

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
      setCompany(companySnap.exists() ? companySnap.data() : null);
    } else {
      setCompany(null);
    }

    return custom;
  }, []);

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      await fetchUserData(auth.currentUser);
    }
  }, [fetchUserData]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setCompany(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      const role: Role = normalizeRole(user.role);
      // Raccourci pour certains rôles "forts"
      if (role === "chefAgence" || role === "admin_platforme") return true;
      return !!user.permissions?.includes(permission);
    },
    [user]
  );

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        unsub = onAuthStateChanged(auth, async (fbUser) => {
          try {
            if (fbUser) {
              await fetchUserData(fbUser);
            } else {
              setUser(null);
              setCompany(null);
            }
          } catch (e) {
            console.error("Erreur auth state:", e);
            setUser(null);
            setCompany(null);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
            setLoading(false);
          }
        });

        // Sécurité : ne jamais rester bloqué en loading si l’écoute tarde
        timeoutId = setTimeout(() => setLoading(false), 2500);
      })
      .catch((e) => {
        console.error("Erreur de persistance Firebase:", e);
        setLoading(false);
      });

    return () => {
      if (unsub) unsub();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [fetchUserData]);

  return (
    <AuthContext.Provider
      value={{ user, loading, logout, refreshUser, hasPermission, company }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
};

export { AuthContext };
