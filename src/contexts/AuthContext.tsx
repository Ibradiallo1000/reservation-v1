import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export interface CustomUser {
  agencyLogoUrl: string | undefined;
  agencyNom: string;
  agencyTelephone: string;
  companyLogo: string | undefined;
  uid: string;
  email: string;
  displayName?: string;
  companyId: string;
  role: string;
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

const ROLES_PERMISSIONS: Record<string, string[]> = {
  admin: ['view_dashboard', 'manage_routes', 'manage_staff', 'view_finances'],
  manager: ['view_dashboard', 'manage_routes', 'view_finances'],
  agent: ['view_dashboard', 'access_ticketing'],
  superviseur: ['dashboard', 'reservations', 'guichet', 'courriers', 'trajets', 'finances', 'statistiques'],
  chefAgence: [
    'view_dashboard', 'access_ticketing', 'manage_routes',
    'manage_mail', 'mail_send', 'mail_receive',
    'view_finances', 'manage_income', 'manage_expenses',
    'manage_staff', 'manage_bookings', 'embarquement'
  ],
  user: []
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any | null>(null);

  const fetchUserData = useCallback(async (firebaseUser: any) => {
    const docRef = doc(db, 'users', firebaseUser.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) throw new Error('Document utilisateur non trouvé');

    const data = docSnap.data();

    const userData: CustomUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || data.nom || '',
      companyId: data.companyId || '',
      role: data.role || 'user',
      nom: data.nom || '',
      ville: data.ville || '',
      agencyId: data.agencyId || '',
      agencyName: data.agencyName || `${data.ville || 'Agence'} Principale`,
      lastLogin: data.lastLogin?.toDate() || null,
      permissions: [...(data.permissions || []), ...(ROLES_PERMISSIONS[data.role] || [])],
      companyLogo: undefined,
      agencyTelephone: '',
      agencyNom: '',
      agencyLogoUrl: undefined
    };

    setUser(userData);

    // Récupération de la compagnie
    if (userData.companyId) {
      const companyRef = doc(db, 'companies', userData.companyId);
      const companySnap = await getDoc(companyRef);
      if (companySnap.exists()) {
        setCompany(companySnap.data());
      }
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

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permission) || false;
  }, [user]);

useEffect(() => {
  let timeoutId: NodeJS.Timeout;
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
        } catch (error) {
          console.error('Erreur auth state:', error);
          setUser(null);
          setCompany(null);
        } finally {
          clearTimeout(timeoutId);
          setLoading(false);
        }
      });

      timeoutId = setTimeout(() => setLoading(false), 2500);
    })
    .catch((error) => {
      console.error('Erreur de persistance Firebase:', error);
      setLoading(false);
    });

  return () => {
    if (unsubscribe) unsubscribe();
    clearTimeout(timeoutId);
  };
}, [fetchUserData]);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser, hasPermission, company }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return context;
};

export { AuthContext };
