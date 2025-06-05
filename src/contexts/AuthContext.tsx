// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export interface CustomUser {
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
}

interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshUser: async () => {},
  hasPermission: () => false
});

const ROLES_PERMISSIONS: Record<string, string[]> = {
  admin: ['view_dashboard', 'manage_routes', 'manage_staff', 'view_finances'],
  manager: ['view_dashboard', 'manage_routes', 'view_finances'],
  agent: ['view_dashboard', 'access_ticketing'],
  superviseur: [
    'dashboard', 'reservations', 'guichet',
    'courriers', 'trajets', 'finances', 'statistiques'
  ],
  chefAgence: [
    'view_dashboard', 'access_ticketing', 'manage_routes',
    'manage_mail', 'mail_send', 'mail_receive',
    'view_finances', 'manage_income', 'manage_expenses',
    'manage_staff', 'manage_bookings'
  ],
  user: []
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (firebaseUser: any) => {
    try {
      const docRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Document utilisateur non trouvé');
      }

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
        permissions: [...(data.permissions || []), ...(ROLES_PERMISSIONS[data.role] || [])]
      };

      setUser(userData);
      setLoading(false);
      return userData;
    } catch (error) {
      console.error('Erreur de chargement utilisateur:', error);
      setUser(null);
      setLoading(false);
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      await fetchUserData(auth.currentUser);
    }
  }, [fetchUserData]);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      throw error;
    }
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permission) || false;
  }, [user]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          await fetchUserData(firebaseUser);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Erreur auth state:', error);
        setUser(null);
      } finally {
        clearTimeout(timeoutId); // stop timeout si onAuthStateChanged répond avant
        setLoading(false);
      }
    });

    // Sécurité : force loading à false après 2.5 secondes (évite blocage infini)
    timeoutId = setTimeout(() => {
      setLoading(false);
    }, 2500);

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [fetchUserData]);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};

export { AuthContext };
