// ✅ src/contexts/AuthContext.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { Role, permissionsByRole } from '@/roles-permissions';

export interface CustomUser {
  agencyLogoUrl?: string;
  agencyNom?: string;
  agencyTelephone?: string;
  companyLogo?: string;

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

  companyColor?: string;
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

/** Normalisation du rôle depuis Firestore */
const normalizeRole = (r?: string): Role => {
  const raw = (r ?? 'user').trim();
  const normalized = raw === 'chef_agence' ? 'chefAgence' : raw;
  return (permissionsByRole[normalized as Role] ? normalized : 'user') as Role;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any | null>(null);

  const fetchUserData = useCallback(async (firebaseUser: FirebaseUser) => {
    const docRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Document utilisateur non trouvé');

    const data = snap.data();
    const role: Role = normalizeRole(data.role);

    const mergedPermissions = Array.from(
      new Set([...(data.permissions || []), ...(permissionsByRole[role] || [])])
    );

    const userData: CustomUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || data.nom || '',
      companyId: data.companyId || '',
      role,
      nom: data.nom || '',
      ville: data.ville || '',
      agencyId: data.agencyId || '',
      agencyName: data.agencyName || `${data.ville || 'Agence'} Principale`,
      lastLogin: data.lastLogin?.toDate?.() || null,
      permissions: mergedPermissions,
      companyLogo: data.companyLogo,
      agencyTelephone: data.agencyTelephone,
      agencyNom: data.agencyNom,
      agencyLogoUrl: data.agencyLogoUrl,
    };

    setUser(userData);

    if (userData.companyId) {
      const companyRef = doc(db, 'companies', userData.companyId);
      const companySnap = await getDoc(companyRef);
      setCompany(companySnap.exists() ? companySnap.data() : null);
    } else {
      setCompany(null);
    }

    return userData;
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
      if (role === 'chefAgence' || role === 'admin') return true;
      return !!user.permissions?.includes(permission);
    },
    [user]
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let unsubscribe: (() => void) | undefined;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          try {
            if (firebaseUser) {
              await fetchUserData(firebaseUser);
            } else {
              setUser(null);
              setCompany(null);
            }
          } catch (e) {
            console.error('Erreur auth state:', e);
            setUser(null);
            setCompany(null);
          } finally {
            clearTimeout(timeoutId);
            setLoading(false);
          }
        });

        timeoutId = setTimeout(() => setLoading(false), 2500);
      })
      .catch((e) => {
        console.error('Erreur de persistance Firebase:', e);
        setLoading(false);
      });

    return () => {
      if (unsubscribe) unsubscribe();
      clearTimeout(timeoutId);
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
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
};

export { AuthContext };
