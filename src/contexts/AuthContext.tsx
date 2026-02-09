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
  if (!r) return "user";

  const raw = r.trim().toLowerCase();

  console.log("🔍 AuthContext normalizeRole - raw input:", raw);

  const map: Record<string, Role> = {
    // PLATFORME
    'admin_platforme': "admin_platforme",
    'admin platforme': "admin_platforme",
    'admin': "admin_platforme",

    // COMPAGNIE (CEO)
    'admin_compagnie': "admin_compagnie",
    'compagnie': "admin_compagnie",
    'admin compagnie': "admin_compagnie",
    'ceo': "admin_compagnie",
    'directeur': "admin_compagnie",

    // COMPTABILITÉ COMPAGNIE (CHEF COMPTABLE + DAF) - NOUVEAU
    'company_accountant': "company_accountant",
    'comptable_compagnie': "company_accountant",
    'comptable compagnie': "company_accountant",
    'comptable': "company_accountant",
    'chef comptable': "company_accountant",
    'chef_comptable': "company_accountant",
    
    // DAF (DIRECTEUR ADMINISTRATIF ET FINANCIER)
    'financial_director': "financial_director",
    'daf': "financial_director",
    'directeur_financier': "financial_director",
    'directeur financier': "financial_director",

    // COMPTABILITÉ AGENCE
    'agency_accountant': "agency_accountant",
    'comptable_agence': "agency_accountant",
    'comptable agence': "agency_accountant",

    // AGENCE
    'chefagence': "chefAgence",
    'chef_agence': "chefAgence",
    'chef agence': "chefAgence",
    'superviseur': "chefAgence",
    'agentcourrier': "chefAgence",
    'agent_courrier': "chefAgence",

    // GUICHET
    'guichetier': "guichetier",
    'embarquement': "embarquement",

    // DEFAULT
    'user': "user",
  };

  const result = map[raw] ?? "user";
  console.log("🔍 AuthContext normalizeRole - result:", result);
  
  return result;
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
  
  console.log("🎯 AuthContext landingTargetForRoles - rôles reçus:", rolesArray);

  // ✅ ESPACE CHEF COMPTABLE COMPAGNIE (NOUVEAU - PRIORITÉ HAUTE)
  if (hasAny(rolesArray, ["company_accountant", "financial_director"])) {
    console.log("🎯 Redirection vers: /chef-comptable");
    return "/chef-comptable";
  }

  // ✅ ESPACE COMPTABILITÉ AGENCE
  if (hasAny(rolesArray, ["agency_accountant"])) {
    console.log("🎯 Redirection vers: /agence/comptabilite");
    return "/agence/comptabilite";
  }

  // ✅ GUICHET
  if (hasAny(rolesArray, ["guichetier"])) {
    console.log("🎯 Redirection vers: /agence/guichet");
    return "/agence/guichet";
  }

  // ✅ CHEF AGENCE & EMBARQUEMENT
  if (hasAny(rolesArray, ["chefAgence", "embarquement"])) {
    console.log("🎯 Redirection vers: /agence/dashboard");
    return "/agence/dashboard";
  }

  // ✅ CEO COMPAGNIE
  if (hasAny(rolesArray, ["admin_compagnie"])) {
    console.log("🎯 Redirection vers: /compagnie/dashboard");
    return "/compagnie/dashboard";
  }

  // ✅ ADMIN PLATFORME
  if (hasAny(rolesArray, ["admin_platforme"])) {
    console.log("🎯 Redirection vers: /admin/dashboard");
    return "/admin/dashboard";
  }

  // ✅ COMPATIBILITÉ - rôles obsolètes mais existants
  if (hasAny(rolesArray, ["compagnie"])) {
    console.log("🎯 Redirection (compatibilité) vers: /compagnie/dashboard");
    return "/compagnie/dashboard";
  }

  console.log("🎯 Aucun rôle spécifique détecté, redirection vers: /login");
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

      console.log("📊 AuthContext - Données utilisateur Firestore:", {
        rawRole: data.role,
        normalizedRole: role,
        companyId: data.companyId,
        agencyId: data.agencyId,
        email: data.email
      });

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

      console.log("✅ AuthContext - Utilisateur créé:", {
        role: customUser.role,
        companyId: customUser.companyId,
        agencyId: customUser.agencyId,
        target: landingTargetForRoles(customUser.role)
      });

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
          console.log("🚪 AuthContext - Utilisateur déconnecté");
          setUser(null);
          setCompany(null);
          setLoading(false);
          return;
        }

        console.log("🔐 AuthContext - Nouvel utilisateur détecté:", fbUser.email);

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